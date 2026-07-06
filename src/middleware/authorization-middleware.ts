import type { Request, RequestHandler } from "express";

import {
  authorizationService,
  createAuthorizationRequestCache,
} from "../services/authorization-service.js";
import { sendError } from "../utils/response.js";

const getRequestCache = (request: Request) => {
  request.authorizationCache ??= createAuthorizationRequestCache();
  return request.authorizationCache;
};

const getAuthenticatedUserId = (request: Request): string | null => {
  return request.authSession?.user.id ?? null;
};

const storeAuthorizationSummary = async (request: Request): Promise<void> => {
  const userId = getAuthenticatedUserId(request);

  if (!userId) {
    request.authorizationSummary = null;
    return;
  }

  request.authorizationSummary = await authorizationService.getUserAuthorizationSummary(
    userId,
    {
      cache: getRequestCache(request),
    },
  );
};

export const requireAuth = (): RequestHandler => {
  return async (request, response, next) => {
    if (!request.authSession?.session) {
      sendError(response, "Authentication required.", 401);
      return;
    }

    try {
      await storeAuthorizationSummary(request);
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requirePermission = (permission: string): RequestHandler => {
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
    } catch (error) {
      next(error);
    }
  };
};

export const requireAnyPermission = (permissions: string[]): RequestHandler => {
  return async (request, response, next) => {
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
      sendError(response, "Authentication required.", 401);
      return;
    }

    try {
      const hasPermission = await authorizationService.hasAnyPermission(
        userId,
        permissions,
        {
          cache: getRequestCache(request),
        },
      );

      await storeAuthorizationSummary(request);

      if (!hasPermission) {
        sendError(
          response,
          `Missing one of the required permissions: ${permissions.join(", ")}.`,
          403,
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireAllPermissions = (permissions: string[]): RequestHandler => {
  return async (request, response, next) => {
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
      sendError(response, "Authentication required.", 401);
      return;
    }

    try {
      const hasPermission = await authorizationService.hasAllPermissions(
        userId,
        permissions,
        {
          cache: getRequestCache(request),
        },
      );

      await storeAuthorizationSummary(request);

      if (!hasPermission) {
        sendError(
          response,
          `Missing required permissions: ${permissions.join(", ")}.`,
          403,
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireAdmin = (): RequestHandler => {
  return async (request, response, next) => {
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
      sendError(response, "Authentication required.", 401);
      return;
    }

    try {
      const summary =
        request.authorizationSummary ??
        (await authorizationService.getUserAuthorizationSummary(userId, {
          cache: getRequestCache(request),
        }));

      request.authorizationSummary = summary;

      if (!summary.isAdmin) {
        sendError(response, "Admin access is required.", 403);
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
