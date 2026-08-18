import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import {
  requireAllPermissions,
  requirePermission,
} from "../../middleware/authorization-middleware.js";
import { remediationController } from "./remediation.controller.js";

export const remediationRouter = Router();

remediationRouter.get(
  "/observations/:id/remediation-plans",
  requirePermission("action_plans.view"),
  asyncHandler(remediationController.listRemediationPlans),
);
remediationRouter.post(
  "/observations/:id/remediation-plans",
  requirePermission("action_plans.create"),
  asyncHandler(remediationController.createRemediationPlan),
);
remediationRouter.patch(
  "/remediation-plans/:id",
  requirePermission("action_plans.edit"),
  asyncHandler(remediationController.updateRemediationPlan),
);
remediationRouter.post(
  "/remediation-plans/:id/submit",
  requirePermission("progress_evaluations.submit"),
  asyncHandler(remediationController.submitRemediationPlan),
);

remediationRouter.get(
  "/action-plans",
  requirePermission("action_plans.view"),
  asyncHandler(remediationController.listActionPlans),
);
remediationRouter.get(
  "/action-plans/:id",
  requirePermission("action_plans.view"),
  asyncHandler(remediationController.getActionPlan),
);
remediationRouter.post(
  "/observations/:id/action-plans",
  requireAllPermissions(["action_plans.create", "action_plans.assign"]),
  asyncHandler(remediationController.createActionPlan),
);
remediationRouter.patch(
  "/action-plans/:id",
  requirePermission("action_plans.edit"),
  asyncHandler(remediationController.updateActionPlan),
);
remediationRouter.delete(
  "/action-plans/:id",
  requirePermission("action_plans.delete"),
  asyncHandler(remediationController.deleteActionPlan),
);
remediationRouter.post(
  "/action-plans/:id/complete",
  requirePermission("action_plans.complete"),
  asyncHandler(remediationController.markActionPlanComplete),
);
