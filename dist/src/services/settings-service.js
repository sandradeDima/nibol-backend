import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ADMIN_ROLE_NAME } from "../permissions/definitions.js";
import { env } from "../utils/env.js";
import { buildLogoUrl, logoUploadsDir, } from "../utils/uploads.js";
import { prisma } from "../utils/prisma.js";
import { activityLogService } from "./activity-log-service.js";
import { auditLogService } from "./audit-log-service.js";
import { notificationService } from "./notification-service.js";
const DEFAULT_PRIMARY_COLOR = "#07142d";
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const resolveLogoUrl = (logo) => {
    if (!logo) {
        return null;
    }
    if (logo.startsWith("http://") || logo.startsWith("https://")) {
        return logo;
    }
    if (logo.startsWith("/")) {
        return `${env.BETTER_AUTH_URL}${logo}`;
    }
    return `${env.BETTER_AUTH_URL}/${logo}`;
};
const buildDefaultSnapshot = () => {
    return {
        appName: env.APP_NAME,
        dateFormat: "YYYY-MM-DD",
        logo: null,
        primaryColor: DEFAULT_PRIMARY_COLOR,
        recordId: null,
        senderEmail: env.SMTP_FROM_EMAIL,
        senderName: env.SMTP_FROM_NAME,
        supportEmail: env.SMTP_FROM_EMAIL,
        timezone: "UTC",
        updatedAt: null,
    };
};
const buildLogoFileName = (originalName) => {
    const extension = path.extname(originalName).toLowerCase() || ".png";
    return `logo-${Date.now()}-${randomUUID()}${extension}`;
};
const removePreviousLogoIfLocal = async (logoUrl) => {
    if (!logoUrl) {
        return;
    }
    const marker = "/uploads/logos/";
    const markerIndex = logoUrl.indexOf(marker);
    if (markerIndex === -1) {
        return;
    }
    const fileName = logoUrl.slice(markerIndex + marker.length);
    if (!fileName) {
        return;
    }
    try {
        await unlink(path.join(logoUploadsDir, fileName));
    }
    catch {
        // Ignore missing files so logo replacement remains resilient.
    }
};
const mapSnapshot = (record) => {
    if (!record) {
        return buildDefaultSnapshot();
    }
    return {
        appName: record.appName,
        dateFormat: record.dateFormat,
        logo: resolveLogoUrl(record.logo),
        primaryColor: record.primaryColor?.trim() || DEFAULT_PRIMARY_COLOR,
        recordId: record.id,
        senderEmail: record.senderEmail,
        senderName: record.senderName,
        supportEmail: record.supportEmail,
        timezone: record.timezone,
        updatedAt: record.updatedAt.toISOString(),
    };
};
const listActiveAdminUserIds = async (db) => {
    const userRoles = await db.userRole.findMany({
        select: {
            userId: true,
        },
        where: {
            role: {
                deletedAt: null,
                name: ADMIN_ROLE_NAME,
            },
            user: {
                deletedAt: null,
                isActive: true,
            },
        },
    });
    return Array.from(new Set(userRoles.map(({ userId }) => userId)));
};
export class SettingsService {
    cache = null;
    pendingLoad = null;
    async loadSettingsSnapshot(db = prisma) {
        const record = await db.setting.findFirst({
            orderBy: {
                updatedAt: "desc",
            },
            select: {
                appName: true,
                dateFormat: true,
                id: true,
                logo: true,
                primaryColor: true,
                senderEmail: true,
                senderName: true,
                supportEmail: true,
                timezone: true,
                updatedAt: true,
            },
            where: {
                deletedAt: null,
            },
        });
        return mapSnapshot(record);
    }
    async getSnapshot(forceRefresh = false) {
        if (!forceRefresh && this.cache && this.cache.expiresAt > Date.now()) {
            return this.cache.value;
        }
        if (!forceRefresh && this.pendingLoad) {
            return this.pendingLoad;
        }
        const loadPromise = this.loadSettingsSnapshot();
        this.pendingLoad = loadPromise;
        try {
            const snapshot = await loadPromise;
            this.cache = {
                expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
                value: snapshot,
            };
            return snapshot;
        }
        finally {
            this.pendingLoad = null;
        }
    }
    async persistSettings(input, currentSnapshot, db = prisma) {
        if (currentSnapshot.recordId) {
            await db.setting.update({
                data: {
                    appName: input.appName,
                    dateFormat: input.dateFormat,
                    primaryColor: input.primaryColor,
                    senderEmail: input.senderEmail,
                    senderName: input.senderName,
                    supportEmail: input.supportEmail,
                    timezone: input.timezone,
                },
                where: {
                    id: currentSnapshot.recordId,
                },
            });
            return;
        }
        await db.setting.create({
            data: {
                appName: input.appName,
                dateFormat: input.dateFormat,
                logo: currentSnapshot.logo,
                primaryColor: input.primaryColor,
                senderEmail: input.senderEmail,
                senderName: input.senderName,
                supportEmail: input.supportEmail,
                timezone: input.timezone,
            },
        });
    }
    clearCache() {
        this.cache = null;
        this.pendingLoad = null;
    }
    async getSettings() {
        const snapshot = await this.getSnapshot();
        return {
            appName: snapshot.appName,
            dateFormat: snapshot.dateFormat,
            logo: snapshot.logo,
            primaryColor: snapshot.primaryColor,
            senderEmail: snapshot.senderEmail,
            senderName: snapshot.senderName,
            supportEmail: snapshot.supportEmail,
            timezone: snapshot.timezone,
            updatedAt: snapshot.updatedAt,
        };
    }
    async getEmailBrandingSettings() {
        const settings = await this.getSettings();
        return {
            appName: settings.appName,
            logoUrl: settings.logo,
            primaryColor: settings.primaryColor,
            senderEmail: settings.senderEmail,
            senderName: settings.senderName,
            supportEmail: settings.supportEmail,
        };
    }
    async updateSettings(input, context) {
        const currentSnapshot = await this.getSnapshot(true);
        await prisma.$transaction(async (transaction) => {
            await this.persistSettings(input, currentSnapshot, transaction);
            const nextSnapshot = await this.loadSettingsSnapshot(transaction);
            await auditLogService.create({
                ...context,
                entityId: nextSnapshot.recordId,
                entityType: "setting",
                newValues: nextSnapshot,
                oldValues: currentSnapshot,
            }, {
                db: transaction,
            });
            await activityLogService.logUserAction({
                ...context,
                action: "Settings updated",
                entityId: nextSnapshot.recordId,
                entityType: "setting",
                metadata: {
                    summary: "Application settings were updated.",
                    updatedFields: [
                        "appName",
                        "dateFormat",
                        "primaryColor",
                        "senderEmail",
                        "senderName",
                        "supportEmail",
                        "timezone",
                    ],
                },
            }, {
                db: transaction,
            });
            await notificationService.createMany({
                message: "Application settings were updated. Review branding, sender identity, and localization defaults if this affects your workflow.",
                title: "Settings updated",
                type: "info",
                userIds: await listActiveAdminUserIds(transaction),
            }, {
                db: transaction,
            });
        });
        this.clearCache();
        return this.getSettings();
    }
    async uploadLogo(file, context) {
        const currentSnapshot = await this.getSnapshot(true);
        const fileName = buildLogoFileName(file.originalName);
        const destination = path.join(logoUploadsDir, fileName);
        await writeFile(destination, file.buffer);
        const logoUrl = buildLogoUrl(fileName);
        await prisma.$transaction(async (transaction) => {
            if (currentSnapshot.recordId) {
                await transaction.setting.update({
                    data: {
                        logo: logoUrl,
                    },
                    where: {
                        id: currentSnapshot.recordId,
                    },
                });
            }
            else {
                const defaults = buildDefaultSnapshot();
                await transaction.setting.create({
                    data: {
                        appName: defaults.appName,
                        dateFormat: defaults.dateFormat,
                        logo: logoUrl,
                        primaryColor: defaults.primaryColor,
                        senderEmail: defaults.senderEmail,
                        senderName: defaults.senderName,
                        supportEmail: defaults.supportEmail,
                        timezone: defaults.timezone,
                    },
                });
            }
            const nextSnapshot = await this.loadSettingsSnapshot(transaction);
            await auditLogService.create({
                ...context,
                entityId: nextSnapshot.recordId,
                entityType: "setting",
                newValues: nextSnapshot,
                oldValues: currentSnapshot,
            }, {
                db: transaction,
            });
            await activityLogService.logUserAction({
                ...context,
                action: "Settings updated",
                entityId: nextSnapshot.recordId,
                entityType: "setting",
                metadata: {
                    summary: "The application logo was updated.",
                    updatedFields: ["logo"],
                },
            }, {
                db: transaction,
            });
            await notificationService.createMany({
                message: "Application settings were updated. The logo and shared branding assets changed.",
                title: "Settings updated",
                type: "info",
                userIds: await listActiveAdminUserIds(transaction),
            }, {
                db: transaction,
            });
        });
        await removePreviousLogoIfLocal(currentSnapshot.logo);
        this.clearCache();
        return this.getSettings();
    }
}
export const settingsService = new SettingsService();
//# sourceMappingURL=settings-service.js.map