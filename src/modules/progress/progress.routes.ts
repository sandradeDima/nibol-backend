import multer from "multer";
import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import {
  requireAllPermissions,
  requirePermission,
} from "../../middleware/authorization-middleware.js";
import { progressController as controller } from "./progress.controller.js";

const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  storage: multer.memoryStorage(),
});
export const progressRouter = Router();

progressRouter.get(
  "/progress-evaluations",
  requirePermission("progress_evaluations.view"),
  asyncHandler(controller.listProgressEvaluations),
);
progressRouter.get(
  "/progress-evaluations/:id",
  requirePermission("progress_evaluations.view"),
  asyncHandler(controller.getProgressEvaluation),
);
progressRouter.post(
  "/action-plans/:id/evaluations",
  requirePermission("progress_evaluations.submit"),
  asyncHandler(controller.createProgressEvaluation),
);
progressRouter.patch(
  "/progress-evaluations/:id",
  requirePermission("progress_evaluations.submit"),
  asyncHandler(controller.updateProgressEvaluation),
);
progressRouter.post(
  "/progress-evaluations/:id/submit",
  requirePermission("progress_evaluations.submit"),
  asyncHandler(controller.sendProgressEvaluationToAudit),
);
progressRouter.post(
  "/progress-evaluations/:id/approve",
  requireAllPermissions([
    "progress_evaluations.review",
    "progress_evaluations.approve",
  ]),
  asyncHandler(controller.approveProgressEvaluation),
);
progressRouter.post(
  "/progress-evaluations/:id/return",
  requirePermission("progress_evaluations.review"),
  asyncHandler(controller.returnProgressEvaluation),
);
progressRouter.post(
  "/progress-evaluations/:id/reject",
  requireAllPermissions([
    "progress_evaluations.review",
    "progress_evaluations.reject",
  ]),
  asyncHandler(controller.rejectProgressEvaluation),
);
progressRouter.post(
  "/progress-evaluations/:id/evidence",
  requirePermission("progress_evaluations.submit"),
  upload.array("files", 10),
  asyncHandler(controller.createProgressEvaluationEvidence),
);
progressRouter.post(
  "/action-plans/:id/evidence",
  requirePermission("finding_evidence.upload"),
  upload.array("files", 10),
  asyncHandler(controller.createActionPlanEvidence),
);
progressRouter.get(
  "/observations/:id/evidence",
  requirePermission("observations.view"),
  asyncHandler(controller.getObservationEvidence),
);
progressRouter.post(
  "/observations/:id/evidence",
  requirePermission("finding_evidence.upload"),
  upload.array("files", 10),
  asyncHandler(controller.createObservationEvidence),
);
progressRouter.delete(
  "/evidences/:id",
  requirePermission("finding_evidence.delete"),
  asyncHandler(controller.deleteEvidence),
);
progressRouter.get(
  "/evidences/:id/download",
  requirePermission("observations.view"),
  asyncHandler(controller.downloadEvidence),
);
progressRouter.get(
  "/observations/:id/comments",
  requirePermission("observations.view"),
  asyncHandler(controller.getObservationComments),
);
progressRouter.post(
  "/observations/:id/comments",
  requirePermission("observations.view"),
  asyncHandler(controller.createComment),
);
progressRouter.patch(
  "/comments/:id",
  requirePermission("observations.view"),
  asyncHandler(controller.updateComment),
);
progressRouter.delete(
  "/comments/:id",
  requirePermission("observations.view"),
  asyncHandler(controller.deleteComment),
);
