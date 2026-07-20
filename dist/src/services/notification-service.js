import { NotificationPriority as PrismaNotificationPriority, NotificationType as PrismaNotificationType, } from "../../generated/prisma/client.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
const notificationTypeMap = {
    error: PrismaNotificationType.ERROR,
    info: PrismaNotificationType.INFO,
    success: PrismaNotificationType.SUCCESS,
    warning: PrismaNotificationType.WARNING,
};
const notificationPriorityMap = {
    CRITICAL: PrismaNotificationPriority.CRITICAL,
    HIGH: PrismaNotificationPriority.HIGH,
    LOW: PrismaNotificationPriority.LOW,
    NORMAL: PrismaNotificationPriority.NORMAL,
};
const toPrismaNotificationType = (value) => notificationTypeMap[value ?? "info"];
const toPrismaNotificationPriority = (value) => notificationPriorityMap[value ?? "NORMAL"];
const mapNotificationRecord = (notification) => ({
    createdAt: notification.createdAt.toISOString(),
    entityId: notification.entityId,
    entityType: notification.entityType,
    eventType: notification.eventType,
    id: notification.id,
    isRead: notification.isRead,
    message: notification.message,
    priority: notification.priority,
    readAt: notification.readAt?.toISOString() ?? null,
    targetUrl: notification.targetUrl,
    title: notification.title,
    type: notification.type === PrismaNotificationType.ERROR
        ? "error"
        : notification.type === PrismaNotificationType.SUCCESS
            ? "success"
            : notification.type === PrismaNotificationType.WARNING
                ? "warning"
                : "info",
});
const buildWhereClause = (userId, query) => ({
    deletedAt: null,
    ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
                ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
                ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
        }
        : {}),
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.priority
        ? { priority: notificationPriorityMap[query.priority] }
        : {}),
    ...(query.search.length > 0
        ? {
            OR: [
                { message: { contains: query.search } },
                { title: { contains: query.search } },
            ],
        }
        : {}),
    ...(query.type ? { type: toPrismaNotificationType(query.type) } : {}),
    ...(query.unreadOnly ? { isRead: false } : {}),
    userId,
});
const notificationSelect = {
    createdAt: true,
    entityId: true,
    entityType: true,
    eventType: true,
    id: true,
    isRead: true,
    message: true,
    priority: true,
    readAt: true,
    targetUrl: true,
    title: true,
    type: true,
};
const getNotificationForUser = async (userId, notificationId, db = prisma) => db.notification.findFirst({
    select: notificationSelect,
    where: {
        deletedAt: null,
        id: notificationId,
        userId,
    },
});
export const notificationService = {
    async create(input, options) {
        const db = options?.db ?? prisma;
        const notification = await db.notification.create({
            data: {
                ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
                ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
                ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
                ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
                message: input.message.trim(),
                priority: toPrismaNotificationPriority(input.priority),
                ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
                title: input.title.trim(),
                type: toPrismaNotificationType(input.type),
                user: { connect: { id: input.userId } },
            },
            select: notificationSelect,
        });
        return mapNotificationRecord(notification);
    },
    async createMany(input, options) {
        const db = options?.db ?? prisma;
        const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
        if (userIds.length === 0) {
            return { createdCount: 0 };
        }
        const created = await db.notification.createMany({
            data: userIds.map((userId) => ({
                message: input.message.trim(),
                priority: toPrismaNotificationPriority(input.priority),
                title: input.title.trim(),
                type: toPrismaNotificationType(input.type),
                userId,
            })),
        });
        return { createdCount: created.count };
    },
    async delete(notificationId, userId) {
        const existingNotification = await getNotificationForUser(userId, notificationId);
        if (!existingNotification) {
            throw new AppError("Notification not found.", 404);
        }
        await prisma.notification.update({
            data: { deletedAt: new Date() },
            where: { id: notificationId },
        });
    },
    async listNotifications(userId, query) {
        const where = buildWhereClause(userId, query);
        const [total, notifications] = await prisma.$transaction([
            prisma.notification.count({ where }),
            prisma.notification.findMany({
                orderBy: { createdAt: "desc" },
                select: notificationSelect,
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: notifications.map((notification) => mapNotificationRecord(notification)),
            pagination: { page: query.page, perPage: query.perPage, total },
        };
    },
    async markAllRead(userId, options) {
        const db = options?.db ?? prisma;
        const result = await db.notification.updateMany({
            data: { isRead: true, readAt: new Date() },
            where: { deletedAt: null, isRead: false, userId },
        });
        return { updatedCount: result.count };
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
            data: { isRead: true, readAt: new Date() },
            select: notificationSelect,
            where: { id: notificationId },
        });
        return mapNotificationRecord(notification);
    },
};
//# sourceMappingURL=notification-service.js.map