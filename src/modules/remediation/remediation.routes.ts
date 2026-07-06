import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { OBSERVATIONS_PERMISSIONS } from "../observations/observations.permissions.js";
import { remediationController } from "./remediation.controller.js";

export const remediationRouter = Router();

remediationRouter.get(
  "/observations/:id/remediation-plan",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.getObservationWorkspace),
);

remediationRouter.post(
  "/observations/:id/remediation-plan",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.saveObservationPlan),
);

remediationRouter.get(
  "/remediation-plans",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.listPlans),
);

remediationRouter.patch(
  "/remediation-plans/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.updatePlan),
);

remediationRouter.post(
  "/remediation-plans/:id/send-to-audit",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.sendPlanToAudit),
);

remediationRouter.post(
  "/remediation-plans/:id/return",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.returnPlan),
);

remediationRouter.post(
  "/remediation-plans/:id/approve",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.approvePlan),
);

remediationRouter.get(
  "/remediation-plans/:id/commitments",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.listPlanCommitments),
);

remediationRouter.post(
  "/remediation-plans/:id/commitments",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.createCommitment),
);

remediationRouter.get(
  "/commitments",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.listCommitments),
);

remediationRouter.patch(
  "/commitments/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.updateCommitment),
);

remediationRouter.delete(
  "/commitments/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.deleteCommitment),
);

remediationRouter.post(
  "/commitments/:id/mark-complete",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.markCommitmentComplete),
);

remediationRouter.post(
  "/commitments/:id/send-to-audit",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(remediationController.sendCommitmentToAudit),
);

