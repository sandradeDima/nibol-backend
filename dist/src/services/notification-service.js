import { NotificationType as PrismaNotificationType } from "../../generated/prisma/client.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
const notificationTypeMap = {
    error: PrismaNotificationType.ERROR,
    info: PrismaNotificationType.INFO,
    success: PrismaNotificationType.SUCCESS,
    warning: PrismaNotificationType.WARNING,
};
const prismaNotificationTypeToValueMap = {
    [PrismaNotificationType.ERROR]: "error",
    [PrismaNotificationType.INFO]: "info",
    [PrismaNotificationType.SUCCESS]: "success",
    [PrismaNotificationType.WARNING]: "warning",
};
const toPrismaNotificationType = (value) => {
    return notificationTypeMap[value ?? "info"];
};
const mapNotificationRecord = (notification) => {
    return {
        createdAt: notification.createdAt.toISOString(),
        id: notification.id,
        isRead: notification.isRead,
        message: notification.message,
        title: notification.title,
        type: prismaNotificationTypeToValueMap[notification.type],
    };
};
const buildWhereClause = (userId, query) => {
    return {
        deletedAt: null,
        ...(query.search.length > 0
            ? {
                OR: [
                    {
                        message: {
                            contains: query.search,
                        },
                    },
                    {
                        title: {
                            contains: query.search,
                        },
                    },
                ],
            }
            : {}),
        ...(query.type
            ? {
                type: toPrismaNotificationType(query.type),
            }
            : {}),
        ...(query.unreadOnly
            ? {
                isRead: false,
            }
            : {}),
        userId,
    };
};
const getNotificationForUser = async (userId, notificationId, db = prisma) => {
    return db.notification.findFirst({
        select: {
            createdAt: true,
            id: true,
            isRead: true,
            message: true,
            title: true,
            type: true,
        },
        where: {
            deletedAt: null,
            id: notificationId,
            userId,
        },
    });
};
export const notificationService = {
    async create(input, options) {
        const db = options?.db ?? prisma;
        const notification = await db.notification.create({
            data: {
                message: input.message.trim(),
                title: input.title.trim(),
                type: toPrismaNotificationType(input.type),
                user: {
                    connect: {
                        id: input.userId,
                    },
                },
            },
            select: {
                createdAt: true,
                id: true,
                isRead: true,
                message: true,
                title: true,
                type: true,
            },
        });
        return mapNotificationRecord(notification);
    },
    async createMany(input, options) {
        const db = options?.db ?? prisma;
        const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
        if (userIds.length === 0) {
            return {
                createdCount: 0,
            };
        }
        const created = await db.notification.createMany({
            data: userIds.map((userId) => ({
                message: input.message.trim(),
                title: input.title.trim(),
                type: toPrismaNotificationType(input.type),
                userId,
            })),
        });
        return {
            createdCount: created.count,
        };
    },
    async delete(notificationId, userId) {
        const existingNotification = await getNotificationForUser(userId, notificationId);
        if (!existingNotification) {
            throw new AppError("Notification not found.", 404);
        }
        await prisma.notification.update({
            data: {
                deletedAt: new Date(),
            },
            where: {
                id: notificationId,
            },
        });
    },
    async listNotifications(userId, query) {
        const where = buildWhereClause(userId, query);
        const [total, notifications] = await prisma.$transaction([
            prisma.notification.count({
                where,
            }),
            prisma.notification.findMany({
                orderBy: {
                    createdAt: "desc",
                },
                select: {
                    createdAt: true,
                    id: true,
                    isRead: true,
                    message: true,
                    title: true,
                    type: true,
                },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: notifications.map((notification) => mapNotificationRecord(notification)),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async markAllRead(userId, options) {
        const db = options?.db ?? prisma;
        const result = await db.notification.updateMany({
            data: {
                isRead: true,
            },
            where: {
                deletedAt: null,
                isRead: false,
                userId,
            },
        });
        return {
            updatedCount: result.count,
        };
    },
    async markRead(notificationId, userId, options) {
        const db = options?.db ?? prisma;
        const existingNotification = await getNotificationForUser(userId, notificationId, db);
        if (!existingNotification) {
            throw new AppError("Notification not found.", 404);
        }
        if (existingNotification.isRead) {
            return mapNotificationRecord(existingNotification);
        }
        const notification = await db.notification.update({
            data: {
                isRead: true,
            },
            select: {
                createdAt: true,
                id: true,
                isRead: true,
                message: true,
                title: true,
                type: true,
            },
            where: {
                id: notificationId,
            },
        });
        return mapNotificationRecord(notification);
    },
};
//# sourceMappingURL=notification-service.js.map