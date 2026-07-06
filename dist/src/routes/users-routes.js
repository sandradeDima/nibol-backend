import multer from "multer";
import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth, requireAnyPermission, requirePermission, } from "../middleware/authorization-middleware.js";
import { usersService } from "../services/users-service.js";
import { AppError } from "../utils/app-error.js";
import { getRequestLogActorContext } from "../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { avatarUploadSchema, bulkDeleteUsersSchema, changePasswordSchema, createUserSchema, listUsersQuerySchema, updateProfileSchema, updateUserSchema, userIdParamSchema, } from "../validators/users-validator.js";
const upload = multer({
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    storage: multer.memoryStorage(),
});
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
const getRequiredUserId = (value) => {
    const userId = Array.isArray(value) ? value[0] : value;
    if (!userId) {
        throw new AppError("User id is required.", 400);
    }
    return userIdParamSchema.parse({
        id: userId,
    }).id;
};
const getAuthenticatedUserId = (request) => {
    const userId = request.authSession?.user.id;
    if (!userId) {
        throw new AppError("Authentication required.", 401);
    }
    return userId;
};
export const usersRouter = Router();
usersRouter.get("/users/profile", requireAuth(), asyncHandler(async (request, response) => {
    const profile = await usersService.getProfile(getAuthenticatedUserId(request));
    sendSuccess(response, profile);
}));
usersRouter.put("/users/profile", requireAuth(), asyncHandler(async (request, response) => {
    const payload = updateProfileSchema.parse(request.body);
    const profile = await usersService.updateProfile(getAuthenticatedUserId(request), payload, getRequestLogActorContext(request));
    sendSuccess(response, profile);
}));
usersRouter.post("/users/profile/change-password", requireAuth(), asyncHandler(async (request, response) => {
    const payload = changePasswordSchema.parse(request.body);
    await usersService.changePassword(getAuthenticatedUserId(request), payload, getRequestLogActorContext(request));
    sendSuccess(response, {
        updated: true,
    });
}));
usersRouter.post("/users/profile/avatar", requireAuth(), upload.single("avatar"), asyncHandler(async (request, response) => {
    const file = request.file;
    if (!file) {
        throw new AppError("Avatar file is required.", 400);
    }
    const metadata = avatarUploadSchema.parse({
        mimetype: file.mimetype,
        originalName: file.originalname,
        size: file.size,
    });
    const avatar = await usersService.uploadAvatar(getAuthenticatedUserId(request), {
        buffer: file.buffer,
        mimetype: metadata.mimetype,
        originalName: metadata.originalName,
    });
    sendSuccess(response, avatar);
}));
usersRouter.get("/users/options", requireAnyPermission([
    "activity_logs.view",
    "audit_logs.view",
    "notifications.create",
    "users.view",
]), asyncHandler(async (_request, response) => {
    const users = await usersService.listUserOptions();
    sendSuccess(response, users);
}));
usersRouter.get("/users", requirePermission("users.view"), asyncHandler(async (request, response) => {
    const query = listUsersQuerySchema.parse({
        emailVerified: getQueryValue(request.query["filter.emailVerified"]),
        isActive: getQueryValue(request.query["filter.isActive"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        roles: getQueryValue(request.query["filter.roles"]),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
    });
    const result = await usersService.listUsers(query);
    sendPaginated(response, result.data, result.pagination);
}));
usersRouter.get("/users/:userId", requirePermission("users.view"), asyncHandler(async (request, response) => {
    const user = await usersService.getUserById(getRequiredUserId(request.params.userId));
    sendSuccess(response, user);
}));
usersRouter.post("/users", requirePermission("users.create"), asyncHandler(async (request, response) => {
    const payload = createUserSchema.parse(request.body);
    const user = await usersService.createUser(payload, getRequestLogActorContext(request));
    sendSuccess(response, user, 201);
}));
usersRouter.put("/users/:userId", requirePermission("users.edit"), asyncHandler(async (request, response) => {
    const payload = updateUserSchema.parse(request.body);
    const user = await usersService.updateUser(getRequiredUserId(request.params.userId), payload, getRequestLogActorContext(request));
    sendSuccess(response, user);
}));
usersRouter.patch("/users/:userId/disable", requirePermission("users.edit"), asyncHandler(async (request, response) => {
    const user = await usersService.setUserActiveState(getRequiredUserId(request.params.userId), false, getRequestLogActorContext(request));
    sendSuccess(response, user);
}));
usersRouter.patch("/users/:userId/enable", requirePermission("users.edit"), asyncHandler(async (request, response) => {
    const user = await usersService.setUserActiveState(getRequiredUserId(request.params.userId), true, getRequestLogActorContext(request));
    sendSuccess(response, user);
}));
usersRouter.post("/users/bulk-delete", requirePermission("users.delete"), asyncHandler(async (request, response) => {
    const payload = bulkDeleteUsersSchema.parse(request.body);
    const deletedCount = await usersService.bulkDeleteUsers(payload.ids, getRequestLogActorContext(request));
    sendSuccess(response, {
        deletedCount,
    });
}));
usersRouter.delete("/users/:userId", requirePermission("users.delete"), asyncHandler(async (request, response) => {
    await usersService.deleteUser(getRequiredUserId(request.params.userId), getRequestLogActorContext(request));
    sendSuccess(response, {
        deleted: true,
    });
}));
//# sourceMappingURL=users-routes.js.map