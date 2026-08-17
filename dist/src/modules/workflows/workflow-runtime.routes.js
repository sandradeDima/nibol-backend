import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAnyPermission, requirePermission, } from "../../middleware/authorization-middleware.js";
import { workflowRuntimeController } from "./workflow-runtime.controller.js";
import { WORKFLOW_INSTANCE_PERMISSIONS, WORKFLOW_PERMISSIONS, WORKFLOW_TASK_PERMISSIONS, WORKFLOW_TIMER_PERMISSIONS, } from "./workflows.permissions.js";
export const workflowRuntimeRouter = Router();
workflowRuntimeRouter.post("/workflow-instances", requirePermission(WORKFLOW_INSTANCE_PERMISSIONS.start), asyncHandler(workflowRuntimeController.startInstance));
workflowRuntimeRouter.get("/workflow-instances/:instanceId/history", requireAnyPermission([
    WORKFLOW_PERMISSIONS.viewInstances,
    WORKFLOW_TASK_PERMISSIONS.view,
]), asyncHandler(workflowRuntimeController.getHistory));
workflowRuntimeRouter.post("/workflow-instances/:instanceId/cancel", requirePermission(WORKFLOW_INSTANCE_PERMISSIONS.cancel), asyncHandler(workflowRuntimeController.cancelInstance));
workflowRuntimeRouter.post("/workflow-instances/:instanceId/retry", requirePermission(WORKFLOW_INSTANCE_PERMISSIONS.retry), asyncHandler(workflowRuntimeController.retryInstance));
workflowRuntimeRouter.post("/workflow-timers/:timerId/retry", requirePermission(WORKFLOW_TIMER_PERMISSIONS.retry), asyncHandler(workflowRuntimeController.retryTimer));
workflowRuntimeRouter.get("/workflow-timers", requirePermission(WORKFLOW_TIMER_PERMISSIONS.view), asyncHandler(workflowRuntimeController.listTimers));
workflowRuntimeRouter.get("/workflow-instances/:instanceId", requireAnyPermission([
    WORKFLOW_PERMISSIONS.viewInstances,
    WORKFLOW_TASK_PERMISSIONS.view,
]), asyncHandler(workflowRuntimeController.getInstance));
workflowRuntimeRouter.get("/workflow-tasks/my-pending", requirePermission(WORKFLOW_TASK_PERMISSIONS.view), asyncHandler(workflowRuntimeController.listMyPending));
workflowRuntimeRouter.get("/workflow-tasks/:taskId", requirePermission(WORKFLOW_TASK_PERMISSIONS.view), asyncHandler(workflowRuntimeController.getTask));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/approve", requirePermission(WORKFLOW_TASK_PERMISSIONS.approve), asyncHandler(workflowRuntimeController.approve));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/reject", requirePermission(WORKFLOW_TASK_PERMISSIONS.reject), asyncHandler(workflowRuntimeController.reject));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/observe", requirePermission(WORKFLOW_TASK_PERMISSIONS.observe), asyncHandler(workflowRuntimeController.observe));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/request-correction", requirePermission(WORKFLOW_TASK_PERMISSIONS.requestCorrection), asyncHandler(workflowRuntimeController.requestCorrection));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/complete", requirePermission(WORKFLOW_TASK_PERMISSIONS.complete), asyncHandler(workflowRuntimeController.complete));
workflowRuntimeRouter.post("/workflow-tasks/:taskId/reassign", requirePermission(WORKFLOW_TASK_PERMISSIONS.reassign), asyncHandler(workflowRuntimeController.reassign));
//# sourceMappingURL=workflow-runtime.routes.js.map