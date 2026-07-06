import { authorizationService, createAuthorizationRequestCache, } from "../services/authorization-service.js";
import { sendError } from "../utils/response.js";
const getRequestCache = (request) => {
    request.authorizationCache ??= createAuthorizationRequestCache();
    return request.authorizationCache;
};
const getAuthenticatedUserId = (request) => {
    return request.authSession?.user.id ?? null;
};
const storeAuthorizationSummary = async (request) => {
    const userId = getAuthenticatedUserId(request);
    if (!userId) {
        request.authorizationSummary = null;
        return;
    }
    request.authorizationSummary = await authorizationService.getUserAuthorizationSummary(userId, {
        cache: getRequestCache(request),
    });
};
export const requireAuth = () => {
    return async (request, response, next) => {
        if (!request.authSession?.session) {
            sendError(response, "Authentication required.", 401);
            return;
        }
        try {
            await storeAuthorizationSummary(request);
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
export const requirePermission = (permission) => {
    return async (request, response, next) => {
        const userId = getAuthenticatedUserId(request);
        if (!userId) {
            sendError(response, "Authentication required.", 401);
            return;
        }
        try {
            const hasPermission = await authorizationService.hasPermission(userId, permission, {
                cache: getRequestCache(request),
            });
            await storeAuthorizationSummary(request);
            if (!hasPermission) {
                sendError(response, `Missing required permission: ${permission}.`, 403);
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
export const requireAnyPermission = (permissions) => {
    return async (request, response, next) => {
        const userId = getAuthenticatedUserId(request);
        if (!userId) {
            sendError(response, "Authentication required.", 401);
            return;
        }
        try {
            const hasPermission = await authorizationService.hasAnyPermission(userId, permissions, {
                cache: getRequestCache(request),
            });
            await storeAuthorizationSummary(request);
            if (!hasPermission) {
                sendError(response, `Missing one of the required permissions: ${permissions.join(", ")}.`, 403);
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
export const requireAllPermissions = (permissions) => {
    return async (request, response, next) => {
        const userId = getAuthenticatedUserId(request);
        if (!userId) {
            sendError(response, "Authentication required.", 401);
            return;
        }
        try {
            const hasPermission = await authorizationService.hasAllPermissions(userId, permissions, {
                cache: getRequestCache(request),
            });
            await storeAuthorizationSummary(request);
            if (!hasPermission) {
                sendError(response, `Missing required permissions: ${permissions.join(", ")}.`, 403);
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
export const requireAdmin = () => {
    return async (request, response, next) => {
        const userId = getAuthenticatedUserId(request);
        if (!userId) {
            sendError(response, "Authentication required.", 401);
            return;
        }
        try {
            const summary = request.authorizationSummary ??
                (await authorizationService.getUserAuthorizationSummary(userId, {
                    cache: getRequestCache(request),
                }));
            request.authorizationSummary = summary;
            if (!summary.isAdmin) {
                sendError(response, "Admin access is required.", 403);
                return;
            }
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
//# sourceMappingURL=authorization-middleware.js.map