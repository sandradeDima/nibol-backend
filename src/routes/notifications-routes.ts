import { Router } from "express";
import type { Request } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/authorization-middleware.js";
import { notificationService } from "../services/notification-service.js";
import { AppError } from "../utils/app-error.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import {
  createNotificationSchema,
  createNotificationsSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../validators/notifications-validator.js";

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return undefined;
};

const getRequiredNotificationId = (
  value: string | string[] | undefined,
): string => {
  const notificationId = Array.isArray(value) ? value[0] : value;

  if (!notificationId) {
    throw new AppError("Se requiere el identificador de la notificación.", 400);
  }

  return notificationIdParamSchema.parse({
    id: notificationId,
  }).id;
};

const getAuthenticatedUserId = (request: Request): string => {
  const userId = request.authSession?.user.id;

  if (!userId) {
    throw new AppError("Debe iniciar sesión para continuar.", 401);
  }

  return userId;
};

export const notificationsRouter = Router();

notificationsRouter.get(
  "/notifications",
  requirePermission("notifications.view"),
  asyncHandler(async (request, response) => {
    const query = listNotificationsQuerySchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      search: getQueryValue(request.query.search),
      priority: getQueryValue(request.query["filter.priority"]),
      eventType: getQueryValue(request.query["filter.eventType"]),
      dateFrom: getQueryValue(request.query["filter.dateFrom"]),
      dateTo: getQueryValue(request.query["filter.dateTo"]),
      type: getQueryValue(request.query["filter.type"]),
      unreadOnly: getQueryValue(request.query["filter.unreadOnly"]),
    });

    const result = await notificationService.listNotifications(
      getAuthenticatedUserId(request),
      query,
    );

    sendPaginated(response, result.data, result.pagination);
  }),
);

notificationsRouter.post(
  "/notifications/bulk",
  requirePermission("notifications.create"),
  asyncHandler(async (request, response) => {
    const payload = createNotificationsSchema.parse(request.body);
    const result = await notificationService.createMany(payload);

    sendSuccess(response, result, 201);
  }),
);

notificationsRouter.post(
  "/notifications",
  requirePermission("notifications.create"),
  asyncHandler(async (request, response) => {
    const payload = createNotificationSchema.parse(request.body);
    const [notification, emailQueued] = await Promise.all([
      notificationService.create(payload),
      notificationService.sendEmailNotification({
        ...(payload.dedupeKey !== undefined
          ? { dedupeKey: payload.dedupeKey }
          : {}),
        ...(payload.eventType !== undefined
          ? { eventType: payload.eventType }
          : {}),
        message: payload.message,
        ...(payload.targetUrl !== undefined
          ? { targetUrl: payload.targetUrl }
          : {}),
        title: payload.title,
        userId: payload.userId,
      }),
    ]);
    if (!notification && !emailQueued)
      throw new AppError("La categoría de notificación está desactivada.", 409);

    sendSuccess(response, notification, 201);
  }),
);

notificationsRouter.post(
  "/notifications/:id/read",
  requirePermission("notifications.view"),
  asyncHandler(async (request, response) => {
    const notification = await notificationService.markRead(
      getRequiredNotificationId(request.params.id),
      getAuthenticatedUserId(request),
    );

    sendSuccess(response, notification);
  }),
);

notificationsRouter.post(
  "/notifications/read-all",
  requirePermission("notifications.view"),
  asyncHandler(async (request, response) => {
    const result = await notificationService.markAllRead(
      getAuthenticatedUserId(request),
    );

    sendSuccess(response, result);
  }),
);

notificationsRouter.delete(
  "/notifications/:id",
  requirePermission("notifications.delete"),
  asyncHandler(async (request, response) => {
    await notificationService.delete(
      getRequiredNotificationId(request.params.id),
      getAuthenticatedUserId(request),
    );

    sendSuccess(response, {
      deleted: true,
    });
  }),
);
