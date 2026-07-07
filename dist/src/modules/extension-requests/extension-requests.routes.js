import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { extensionRequestsController } from "./extension-requests.controller.js";
import { EXTENSION_REQUESTS_PERMISSIONS } from "./extension-requests.constants.js";
export const extensionRequestsRouter = Router();
extensionRequestsRouter.get("/extension-requests", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.view), asyncHandler(extensionRequestsController.list));
extensionRequestsRouter.get("/extension-requests/:id", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.view), asyncHandler(extensionRequestsController.getById));
extensionRequestsRouter.post("/observations/:id/extension-requests", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.create), asyncHandler(extensionRequestsController.createForObservation));
extensionRequestsRouter.post("/commitments/:id/extension-requests", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.create), asyncHandler(extensionRequestsController.createForCommitment));
extensionRequestsRouter.patch("/extension-requests/:id", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.update));
extensionRequestsRouter.post("/extension-requests/:id/send-to-manager", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.sendToManager));
extensionRequestsRouter.post("/extension-requests/:id/manager-approve", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.managerApprove));
extensionRequestsRouter.post("/extension-requests/:id/manager-reject", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.managerReject));
extensionRequestsRouter.post("/extension-requests/:id/send-to-audit", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.sendToAudit));
extensionRequestsRouter.post("/extension-requests/:id/audit-approve", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.auditApprove));
extensionRequestsRouter.post("/extension-requests/:id/audit-reject", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.auditReject));
extensionRequestsRouter.post("/extension-requests/:id/cancel", requirePermission(EXTENSION_REQUESTS_PERMISSIONS.edit), asyncHandler(extensionRequestsController.cancel));
//# sourceMappingURL=extension-requests.routes.js.map