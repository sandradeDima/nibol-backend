import { randomUUID } from "node:crypto";

import { type Prisma } from "../../generated/prisma/client.js";
import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationPriority as DatabaseNotificationPriority,
  NotificationPriority as PrismaNotificationPriority,
  NotificationType as DatabaseNotificationType,
  NotificationType as PrismaNotificationType,
  parseDatabaseEnum,
} from "../types/database-enums.js";

import { AppError } from "../utils/app-error.js";
import { buildFrontendUrl } from "../utils/notification-links.js";
import { logger } from "../utils/logger.js";
import { parseDatabaseJson, toDatabaseJson } from "./logging-utils.js";
import { isNotificationChannelEnabled } from "./notification-preferences.js";
import { resolveNotificationTarget } from "../utils/notification-links.js";
import { prisma } from "../utils/prisma.js";
import type {
  CreateNotificationInput,
  ListNotificationsQuery,
  NotificationPriority,
  NotificationType,
} from "../validators/notifications-validator.js";

type NotificationWriter = {
  notification: Pick<
    typeof prisma.notification,
    | "count"
    | "create"
    | "createMany"
    | "findFirst"
    | "findMany"
    | "update"
    | "updateMany"
  >;
  systemParameter: Pick<typeof prisma.systemParameter, "findMany">;
};

type NotificationDeliveryWriter = Pick<
  typeof prisma.notificationDelivery,
  "create" | "findUnique" | "findUniqueOrThrow" | "update" | "updateMany"
>;

export type CreateNotificationDeliveryInput = {
  channel: NotificationDeliveryChannel;
  dedupeKey: string;
  notificationId?: string;
  payloadJson?: unknown;
  recipientEmail?: string | null;
  recipientUserId?: string | null;
  status?: NotificationDeliveryStatus;
};

const notificationDeliveryMaxAttempts = 3;
const notificationDeliveryClaimLeaseMs = 15 * 60_000;
const notificationDeliveryRetryDelayMs = 5 * 60_000;

type NotificationEmailPayload = {
  eventType: string | null;
  message: string;
  targetUrl: string;
  title: string;
  userName?: string;
};

type NotificationRecord = {
  createdAt: Date;
  entityId: string | null;
  entityType: string | null;
  eventType: string | null;
  id: string;
  isRead: boolean;
  message: string;
  priority: string;
  readAt: Date | null;
  targetUrl: string | null;
  title: string;
  type: string;
};

type CreateManyNotificationInput = {
  message: string;
  priority?: NotificationPriority | undefined;
  title: string;
  type?: NotificationType;
  userIds: string[];
};

const notificationTypeMap: Record<NotificationType, PrismaNotificationType> = {
  error: PrismaNotificationType.ERROR,
  info: PrismaNotificationType.INFO,
  success: PrismaNotificationType.SUCCESS,
  warning: PrismaNotificationType.WARNING,
};

const notificationPriorityMap: Record<
  NotificationPriority,
  PrismaNotificationPriority
> = {
  CRITICAL: PrismaNotificationPriority.CRITICAL,
  HIGH: PrismaNotificationPriority.HIGH,
  LOW: PrismaNotificationPriority.LOW,
  NORMAL: PrismaNotificationPriority.NORMAL,
};

const toPrismaNotificationType = (
  value: NotificationType | undefined,
): PrismaNotificationType => notificationTypeMap[value ?? "info"];

const toPrismaNotificationPriority = (
  value: NotificationPriority | undefined,
): PrismaNotificationPriority => notificationPriorityMap[value ?? "NORMAL"];

const mapNotificationRecord = (notification: NotificationRecord) => {
  const type = parseDatabaseEnum(
    DatabaseNotificationType,
    notification.type,
    "notifications.type",
  );
  return {
    createdAt: notification.createdAt.toISOString(),
    entityId: notification.entityId,
    entityType: notification.entityType,
    eventType: notification.eventType,
    id: notification.id,
    isRead: notification.isRead,
    message: notification.message,
    priority: parseDatabaseEnum(
      DatabaseNotificationPriority,
      notification.priority,
      "notifications.priority",
    ),
    readAt: notification.readAt?.toISOString() ?? null,
    targetUrl: notification.targetUrl,
    title: notification.title,
    type:
      type === PrismaNotificationType.ERROR
        ? "error"
        : type === PrismaNotificationType.SUCCESS
          ? "success"
          : type === PrismaNotificationType.WARNING
            ? "warning"
            : "info",
  };
};

const buildWhereClause = (
  userId: string,
  query: ListNotificationsQuery,
): Prisma.NotificationWhereInput => ({
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
} as const;

const getNotificationForUser = async (
  userId: string,
  notificationId: string,
  db: NotificationWriter = prisma,
) =>
  db.notification.findFirst({
    select: notificationSelect,
    where: {
      deletedAt: null,
      id: notificationId,
      userId,
    },
  });

export const notificationService = {
  async create(
    input: CreateNotificationInput,
    options?: { db?: NotificationWriter },
  ) {
    const db = options?.db ?? prisma;
    const internalEnabled = await isNotificationChannelEnabled(
      input.eventType,
      "internal",
      db.systemParameter,
    );
    if (!internalEnabled) return null;
    const targetUrl =
      input.targetUrl !== undefined
        ? input.targetUrl
        : resolveNotificationTarget(input);
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
        ...(targetUrl !== null ? { targetUrl } : {}),
        title: input.title.trim(),
        type: toPrismaNotificationType(input.type),
        user: { connect: { id: input.userId } },
      },
      select: notificationSelect,
    });

    return mapNotificationRecord(notification);
  },

  async createMany(
    input: CreateManyNotificationInput,
    options?: { db?: NotificationWriter },
  ) {
    const db = options?.db ?? prisma;
    const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
    if (userIds.length === 0) {
      return { createdCount: 0, emailCount: 0, suppressed: false };
    }
    const [internalEnabled, emailEnabled] = await Promise.all([
      isNotificationChannelEnabled(null, "internal", db.systemParameter),
      isNotificationChannelEnabled(null, "email", db.systemParameter),
    ]);
    const created = internalEnabled
      ? await db.notification.createMany({
          data: userIds.map((userId) => ({
            message: input.message.trim(),
            priority: toPrismaNotificationPriority(input.priority),
            title: input.title.trim(),
            type: toPrismaNotificationType(input.type),
            userId,
          })),
        })
      : { count: 0 };
    let emailCount = 0;
    if (emailEnabled && !options?.db) {
      const batchId = randomUUID();
      const results = await Promise.all(
        userIds.map((userId) =>
          notificationService.sendEmailNotification({
            dedupeKey: `manual:${batchId}:${userId}`,
            eventType: null,
            message: input.message,
            title: input.title,
            userId,
          }),
        ),
      );
      emailCount = results.filter(Boolean).length;
    }

    return {
      createdCount: created.count,
      emailCount,
      suppressed: !internalEnabled && !emailEnabled,
    };
  },

  async sendEmailNotification(input: {
    dedupeKey?: string | null;
    eventType?: string | null;
    message: string;
    notificationId?: string;
    targetUrl?: string | null;
    title: string;
    userId: string;
  }): Promise<boolean> {
    if (!(await isNotificationChannelEnabled(input.eventType, "email")))
      return false;
    const recipient = await prisma.user.findFirst({
      select: { email: true, name: true },
      where: { deletedAt: null, id: input.userId, isActive: true },
    });
    if (!recipient?.email) return false;
    const delivery = await notificationService.createDelivery({
      channel: NotificationDeliveryChannel.EMAIL,
      dedupeKey: `${input.dedupeKey ?? randomUUID()}:${input.userId}:EMAIL`,
      ...(input.notificationId ? { notificationId: input.notificationId } : {}),
      payloadJson: {
        eventType: input.eventType ?? null,
        message: input.message,
        targetUrl: input.targetUrl ?? "/notificaciones",
        title: input.title,
        userName: recipient.name,
      },
      recipientEmail: recipient.email,
      recipientUserId: input.userId,
    });
    if (delivery.status === NotificationDeliveryStatus.SKIPPED) return false;
    if (delivery.status === NotificationDeliveryStatus.SENT) return true;
    if (delivery.attempts >= notificationDeliveryMaxAttempts) return false;

    void notificationService
      .deliverEmailNotification(delivery.id)
      .catch((error: unknown) => {
        logger.warn(
          "No se pudo iniciar la entrega de una notificación por correo.",
          {
            deliveryId: delivery.id,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      });
    return true;
  },

  async createDelivery(
    input: CreateNotificationDeliveryInput,
    options?: { db?: NotificationDeliveryWriter },
  ) {
    const db = options?.db ?? prisma.notificationDelivery;
    const existing = await db.findUnique({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return existing;

    const status = input.status ?? NotificationDeliveryStatus.PENDING;
    try {
      const data: Prisma.NotificationDeliveryUncheckedCreateInput = {
        channel: input.channel,
        dedupeKey: input.dedupeKey,
        ...(input.notificationId !== undefined
          ? { notificationId: input.notificationId }
          : {}),
        ...(input.payloadJson !== undefined
          ? { payloadJson: toDatabaseJson(input.payloadJson) }
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
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return db.findUniqueOrThrow({ where: { dedupeKey: input.dedupeKey } });
    }
  },

  async claimEmailDelivery(deliveryId: string, eventType?: string | null) {
    const delivery = await prisma.notificationDelivery.findUnique({
      select: { notification: { select: { eventType: true } } },
      where: { id: deliveryId },
    });
    if (
      delivery &&
      !(await isNotificationChannelEnabled(
        eventType !== undefined ? eventType : delivery.notification?.eventType,
        "email",
      ))
    ) {
      await prisma.notificationDelivery.updateMany({
        data: {
          errorMessage: "La categoría de notificación está desactivada.",
          status: NotificationDeliveryStatus.SKIPPED,
        },
        where: {
          channel: NotificationDeliveryChannel.EMAIL,
          id: deliveryId,
          status: {
            in: [
              NotificationDeliveryStatus.PENDING,
              NotificationDeliveryStatus.FAILED,
            ],
          },
        },
      });
      return false;
    }
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

  async completeEmailDelivery(
    deliveryId: string,
    result: { error?: string; success: boolean },
  ) {
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

  async deliverEmailNotification(deliveryId: string): Promise<boolean> {
    const delivery = await prisma.notificationDelivery.findUnique({
      select: {
        payloadJson: true,
        recipientEmail: true,
        recipientUser: { select: { name: true } },
      },
      where: { id: deliveryId },
    });
    if (!delivery) return false;

    let payload: NotificationEmailPayload | null;
    try {
      payload = parseDatabaseJson<NotificationEmailPayload>(
        delivery.payloadJson,
        "notification_deliveries.payload_json",
        (value) => {
          if (
            typeof value !== "object" ||
            value === null ||
            (typeof (value as NotificationEmailPayload).eventType !==
              "string" &&
              (value as NotificationEmailPayload).eventType !== null) ||
            typeof (value as NotificationEmailPayload).message !== "string" ||
            typeof (value as NotificationEmailPayload).targetUrl !== "string" ||
            typeof (value as NotificationEmailPayload).title !== "string"
          ) {
            throw new Error("La carga útil de notificación no es válida.");
          }
          return value as NotificationEmailPayload;
        },
      );
    } catch (error) {
      await prisma.notificationDelivery.update({
        data: {
          errorMessage: error instanceof Error ? error.message : String(error),
          status: NotificationDeliveryStatus.SKIPPED,
        },
        where: { id: deliveryId },
      });
      return false;
    }
    if (!payload || !delivery.recipientEmail) {
      await prisma.notificationDelivery.update({
        data: {
          errorMessage: "La entrega no tiene destinatario o carga útil válida.",
          status: NotificationDeliveryStatus.SKIPPED,
        },
        where: { id: deliveryId },
      });
      return false;
    }
    if (
      !(await notificationService.claimEmailDelivery(
        deliveryId,
        payload.eventType,
      ))
    )
      return false;

    try {
      const { emailService } = await import("../emails/EmailService.js");
      const result = await emailService.sendTemplate({
        template: "genericNotification",
        to: delivery.recipientEmail,
        variables: {
          actionLabel: "Ver notificación",
          actionLink: buildFrontendUrl(payload.targetUrl),
          message: payload.message,
          title: payload.title,
          userName: payload.userName ?? delivery.recipientUser?.name ?? "",
        },
      });
      await notificationService.completeEmailDelivery(deliveryId, result);
      return result.success;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await notificationService.completeEmailDelivery(deliveryId, {
          error: message,
          success: false,
        });
      } catch (completionError) {
        logger.error("No se pudo actualizar el estado de entrega del correo.", {
          deliveryId,
          error:
            completionError instanceof Error
              ? completionError.message
              : String(completionError),
        });
      }
      logger.warn("Falló la entrega de una notificación por correo.", {
        deliveryId,
        error: message,
      });
      return false;
    }
  },

  async deliverPendingEmailNotifications(limit = 100): Promise<number> {
    const now = new Date();
    const deliveries = await prisma.notificationDelivery.findMany({
      orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
      take: Math.max(1, Math.min(500, limit)),
      where: {
        attempts: { lt: notificationDeliveryMaxAttempts },
        channel: NotificationDeliveryChannel.EMAIL,
        dedupeKey: { not: { startsWith: "deadline-reminder:" } },
        OR: [
          { lastAttemptAt: null, status: NotificationDeliveryStatus.PENDING },
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
        payloadJson: { not: null },
      },
    });
    let sentCount = 0;
    for (const delivery of deliveries) {
      if (await notificationService.deliverEmailNotification(delivery.id))
        sentCount += 1;
    }
    return sentCount;
  },

  async delete(notificationId: string, userId: string) {
    const existingNotification = await getNotificationForUser(
      userId,
      notificationId,
    );

    if (!existingNotification) {
      throw new AppError("No se encontró la notificación.", 404);
    }

    await prisma.notification.update({
      data: { deletedAt: new Date() },
      where: { id: notificationId },
    });
  },

  async listNotifications(userId: string, query: ListNotificationsQuery) {
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
      data: notifications.map((notification) =>
        mapNotificationRecord(notification),
      ),
      pagination: { page: query.page, perPage: query.perPage, total },
    };
  },

  async markAllRead(userId: string, options?: { db?: NotificationWriter }) {
    const db = options?.db ?? prisma;
    const result = await db.notification.updateMany({
      data: { isRead: true, readAt: new Date() },
      where: { deletedAt: null, isRead: false, userId },
    });

    return { updatedCount: result.count };
  },

  async markRead(
    notificationId: string,
    userId: string,
    options?: { db?: NotificationWriter },
  ) {
    const db = options?.db ?? prisma;
    const existingNotification = await getNotificationForUser(
      userId,
      notificationId,
      db,
    );

    if (!existingNotification) {
      throw new AppError("No se encontró la notificación.", 404);
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
