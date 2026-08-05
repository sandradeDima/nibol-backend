import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAnyPermission, requirePermission, } from "../../middleware/authorization-middleware.js";
import { workflowsController } from "./workflows.controller.js";
import { WORKFLOW_PERMISSIONS } from "./workflows.permissions.js";
export const workflowsRouter = Router();
workflowsRouter.get("/workflows/summary", requirePermission(WORKFLOW_PERMISSIONS.view), asyncHandler(workflowsController.summary));
workflowsRouter.get("/workflows/options", requireAnyPermission([
    WORKFLOW_PERMISSIONS.create,
    WORKFLOW_PERMISSIONS.view,
]), asyncHandler(workflowsController.options));
workflowsRouter.get("/workflows/designer-options", requireAnyPermission([
    WORKFLOW_PERMISSIONS.edit,
    WORKFLOW_PERMISSIONS.simulate,
    WORKFLOW_PERMISSIONS.validate,
    WORKFLOW_PERMISSIONS.viewVersions,
]), asyncHandler(workflowsController.designerOptions));
workflowsRouter.get("/workflows", requirePermission(WORKFLOW_PERMISSIONS.view), asyncHandler(workflowsController.list));
workflowsRouter.post("/workflows", requirePermission(WORKFLOW_PERMISSIONS.create), asyncHandler(workflowsController.create));
workflowsRouter.get("/workflows/:id/activity", requirePermission(WORKFLOW_PERMISSIONS.view), asyncHandler(workflowsController.activity));
workflowsRouter.get("/workflows/:id/versions", requirePermission(WORKFLOW_PERMISSIONS.viewVersions), asyncHandler(workflowsController.listVersions));
workflowsRouter.post("/workflows/:id/versions", requirePermission(WORKFLOW_PERMISSIONS.edit), asyncHandler(workflowsController.createVersion));
workflowsRouter.get("/workflows/:id", requirePermission(WORKFLOW_PERMISSIONS.view), asyncHandler(workflowsController.getById));
workflowsRouter.patch("/workflows/:id", requirePermission(WORKFLOW_PERMISSIONS.edit), asyncHandler(workflowsController.update));
workflowsRouter.post("/workflows/:id/duplicate", requirePermission(WORKFLOW_PERMISSIONS.create), asyncHandler(workflowsController.duplicate));
workflowsRouter.post("/workflows/:id/archive", requirePermission(WORKFLOW_PERMISSIONS.archive), asyncHandler(workflowsController.archive));
workflowsRouter.get("/workflow-versions/:versionId", requireAnyPermission([
    WORKFLOW_PERMISSIONS.simulate,
    WORKFLOW_PERMISSIONS.viewVersions,
]), asyncHandler(workflowsController.getVersion));
workflowsRouter.get("/workflow-versions/:versionId/designer", requireAnyPermission([
    WORKFLOW_PERMISSIONS.edit,
    WORKFLOW_PERMISSIONS.simulate,
    WORKFLOW_PERMISSIONS.validate,
    WORKFLOW_PERMISSIONS.viewVersions,
]), asyncHandler(workflowsController.getDesigner));
workflowsRouter.put("/workflow-versions/:versionId/designer", requirePermission(WORKFLOW_PERMISSIONS.edit), asyncHandler(workflowsController.saveDesigner));
workflowsRouter.post("/workflow-versions/:versionId/designer/validate", requirePermission(WORKFLOW_PERMISSIONS.validate), asyncHandler(workflowsController.validateDesigner));
workflowsRouter.post("/workflow-versions/:versionId/simulate", requirePermission(WORKFLOW_PERMISSIONS.simulate), asyncHandler(workflowsController.simulate));
workflowsRouter.post("/workflow-versions/:versionId/publish", requirePermission(WORKFLOW_PERMISSIONS.publish), asyncHandler(workflowsController.publish));
//# sourceMappingURL=workflows.routes.js.map