import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { EXTENSION_REQUESTS_PERMISSIONS as permissions } from "./extension-requests.constants.js";
import { extensionRequestsController as controller } from "./extension-requests.controller.js";

export const extensionRequestsRouter = Router();
extensionRequestsRouter.get(
  "/deadline-extension-classifications",
  requirePermission(permissions.request),
  asyncHandler(controller.listClassifications),
);
extensionRequestsRouter.get(
  "/extension-requests",
  requirePermission(permissions.view),
  asyncHandler(controller.list),
);
extensionRequestsRouter.get(
  "/extension-requests/:id",
  requirePermission(permissions.view),
  asyncHandler(controller.getById),
);
extensionRequestsRouter.post(
  "/action-plans/:id/extension-requests",
  requirePermission(permissions.create),
  asyncHandler(controller.createForActionPlan),
);
extensionRequestsRouter.patch(
  "/extension-requests/:id",
  requirePermission(permissions.request),
  asyncHandler(controller.update),
);
extensionRequestsRouter.post(
  "/extension-requests/:id/submit",
  requirePermission(permissions.request),
  asyncHandler(controller.sendToManager),
);
extensionRequestsRouter.post(
  "/extension-requests/:id/manager-approve",
  requirePermission(permissions.approve),
  asyncHandler(controller.managerApprove),
);
extensionRequestsRouter.post(
  "/extension-requests/:id/manager-reject",
  requirePermission(permissions.reject),
  asyncHandler(controller.managerReject),
);
extensionRequestsRouter.post(
  "/extension-requests/:id/cancel",
  requirePermission(permissions.request),
  asyncHandler(controller.cancel),
);
