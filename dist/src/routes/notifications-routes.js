import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/authorization-middleware.js";
import { notificationService } from "../services/notification-service.js";
import { AppError } from "../utils/app-error.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { createNotificationSchema, listNotificationsQuerySchema, notificationIdParamSchema, } from "../validators/notifications-validator.js";
const getQueryValue = (value) => {
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
const getRequiredNotificationId = (value) => {
    const notificationId = Array.isArray(value) ? value[0] : value;
    if (!notificationId) {
        throw new AppError("Notification id is required.", 400);
    }
    return notificationIdParamSchema.parse({
        id: notificationId,
    }).id;
};
const getAuthenticatedUserId = (request) => {
    const userId = request.authSession?.user.id;
    if (!userId) {
        throw new AppError("Authentication required.", 401);
    }
    return userId;
};
export const notificationsRouter = Router();
notificationsRouter.get("/notifications", requirePermission("notifications.view"), asyncHandler(async (request, response) => {
    const query = listNotificationsQuerySchema.parse({
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        type: getQueryValue(request.query["filter.type"]),
        unreadOnly: getQueryValue(request.query["filter.unreadOnly"]),
    });
    const result = await notificationService.listNotifications(getAuthenticatedUserId(request), query);
    sendPaginated(response, result.data, result.pagination);
}));
notificationsRouter.post("/notifications", requirePermission("notifications.create"), asyncHandler(async (request, response) => {
    const payload = createNotificationSchema.parse(request.body);
    const notification = await notificationService.create(payload);
    sendSuccess(response, notification, 201);
}));
notificationsRouter.post("/notifications/:id/read", requirePermission("notifications.view"), asyncHandler(async (request, response) => {
    const notification = await notificationService.markRead(getRequiredNotificationId(request.params.id), getAuthenticatedUserId(request));
    sendSuccess(response, notification);
}));
notificationsRouter.post("/notifications/read-all", requirePermission("notifications.view"), asyncHandler(async (request, response) => {
    const result = await notificationService.markAllRead(getAuthenticatedUserId(request));
    sendSuccess(response, result);
}));
notificationsRouter.delete("/notifications/:id", requirePermission("notifications.view"), asyncHandler(async (request, response) => {
    await notificationService.delete(getRequiredNotificationId(request.params.id), getAuthenticatedUserId(request));
    sendSuccess(response, {
        deleted: true,
    });
}));
//# sourceMappingURL=notifications-routes.js.map