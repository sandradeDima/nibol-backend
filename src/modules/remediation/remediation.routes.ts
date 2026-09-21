import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../../middleware/authorization-middleware.js";
import { remediationController } from "./remediation.controller.js";
import { RECOMMENDED_ACTION_PLAN_PERMISSIONS as recommended } from "./remediation.constants.js";

export const remediationRouter = Router();

remediationRouter.get(
  "/observations/:id/remediation-plans",
  requirePermission(recommended.view),
  asyncHandler(remediationController.listRemediationPlans),
);
remediationRouter.post(
  "/observations/:id/remediation-plans",
  requirePermission(recommended.create),
  asyncHandler(remediationController.createRemediationPlan),
);
remediationRouter.patch(
  "/remediation-plans/:id",
  requireAnyPermission([recommended.edit, "action_plans.assign_executor"]),
  asyncHandler(remediationController.updateRemediationPlan),
);
remediationRouter.post(
  "/remediation-plans/:id/submit",
  requirePermission(recommended.submit),
  asyncHandler(remediationController.submitRemediationPlan),
);
remediationRouter.delete(
  "/remediation-plans/:id",
  requirePermission(recommended.delete),
  asyncHandler(remediationController.deleteRemediationPlan),
);

remediationRouter.get(
  "/action-plans",
  requirePermission("action_plans.view"),
  asyncHandler(remediationController.listActionPlans),
);
remediationRouter.get(
  "/action-plans/options",
  requireAnyPermission([
    "action_plans.create",
    "action_plans.edit",
    "action_plans.view",
  ]),
  asyncHandler(remediationController.actionPlanOptions),
);
remediationRouter.get(
  "/action-plans/:id",
  requirePermission("action_plans.view"),
  asyncHandler(remediationController.getActionPlan),
);
remediationRouter.post(
  "/observations/:id/action-plans",
  requirePermission("action_plans.create"),
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
  requirePermission("action_plans.evaluate"),
  asyncHandler(remediationController.markActionPlanComplete),
);
