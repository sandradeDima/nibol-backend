import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAuth } from "../middleware/authorization-middleware.js";
import { authorizationService } from "../services/authorization-service.js";
import { sendError, sendSuccess } from "../utils/response.js";
export const permissionsRouter = Router();
permissionsRouter.get("/permissions/me", requireAuth(), asyncHandler(async (request, response) => {
    const userId = request.authSession?.user.id;
    if (!userId) {
        sendError(response, "Authentication required.", 401);
        return;
    }
    const authorizationSummary = request.authorizationSummary ??
        (await authorizationService.getUserAuthorizationSummary(userId, request.authorizationCache
            ? {
                cache: request.authorizationCache,
            }
            : undefined));
    sendSuccess(response, authorizationSummary);
}));
//# sourceMappingURL=permissions-routes.js.map