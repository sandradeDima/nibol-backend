import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority as PrismaNotificationPriority, NotificationType as PrismaNotificationType, } from "../../generated/prisma/client.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
const notificationDeliveryMaxAttempts = 3;
const notificationDeliveryClaimLeaseMs = 15 * 60_000;
const notificationDeliveryRetryDelayMs = 5 * 60_000;
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
                ...(input.dedupeKey !== undefined
                    ? { dedupeKey: input.dedupeKey }
                    : {}),
                ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
                ...(input.entityType !== undefined
                    ? { entityType: input.entityType }
                    : {}),
                ...(input.eventType !== undefined
                    ? { eventType: input.eventType }
                    : {}),
                message: input.message.trim(),
                priority: toPrismaNotificationPriority(input.priority),
                ...(input.targetUrl !== undefined
                    ? { targetUrl: input.targetUrl }
                    : {}),
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
    async createDelivery(input, options) {
        const db = options?.db ?? prisma.notificationDelivery;
        const existing = await db.findUnique({
            where: { dedupeKey: input.dedupeKey },
        });
        if (existing)
            return existing;
        const status = input.status ?? NotificationDeliveryStatus.PENDING;
        try {
            const data = {
                channel: input.channel,
                dedupeKey: input.dedupeKey,
                ...(input.notificationId !== undefined
                    ? { notificationId: input.notificationId }
                    : {}),
                ...(input.payloadJson !== undefined
                    ? { payloadJson: input.payloadJson }
                    : {}),
                ...(input.recipientEmail !== undefined
                    ? { recipientEmail: input.recipientEmail }
                    : {}),
                ...(input.recipientUserId !== undefined
                    ? { recipientUserId: input.recipientUserId }
                    : {}),
                ...(status === NotificationDeliveryStatus.SENT
                    ? { sentAt: new Date() }
                    : {}),
                status,
            };
            return await db.create({
                data,
            });
        }
        catch (error) {
            if (error.code !== "P2002")
                throw error;
            return db.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
        }
    },
    async claimEmailDelivery(deliveryId) {
        const now = new Date();
        const claimed = await prisma.notificationDelivery.updateMany({
            data: {
                attempts: { increment: 1 },
                lastAttemptAt: now,
                status: NotificationDeliveryStatus.PENDING,
            },
            where: {
                attempts: { lt: notificationDeliveryMaxAttempts },
                channel: NotificationDeliveryChannel.EMAIL,
                id: deliveryId,
                OR: [
                    {
                        lastAttemptAt: null,
                        status: NotificationDeliveryStatus.PENDING,
                    },
                    {
                        lastAttemptAt: {
                            lt: new Date(now.getTime() - notificationDeliveryClaimLeaseMs),
                        },
                        status: NotificationDeliveryStatus.PENDING,
                    },
                    {
                        lastAttemptAt: {
                            lt: new Date(now.getTime() - notificationDeliveryRetryDelayMs),
                        },
                        status: NotificationDeliveryStatus.FAILED,
                    },
                ],
            },
        });
        return claimed.count === 1;
    },
    async completeEmailDelivery(deliveryId, result) {
        await prisma.notificationDelivery.update({
            data: result.success
                ? {
                    errorMessage: null,
                    sentAt: new Date(),
                    status: NotificationDeliveryStatus.SENT,
                }
                : {
                    errorMessage: result.error ?? "No fue posible enviar el correo.",
                    status: NotificationDeliveryStatus.FAILED,
                },
            where: { id: deliveryId },
        });
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