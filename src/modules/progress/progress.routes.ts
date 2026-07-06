import multer from "multer";
import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { OBSERVATIONS_PERMISSIONS } from "../observations/observations.permissions.js";
import { progressController } from "./progress.controller.js";

const upload = multer({
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
  storage: multer.memoryStorage(),
});

export const progressRouter = Router();

progressRouter.get(
  "/progress-updates",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.listProgressUpdates),
);

progressRouter.get(
  "/observations/:id/progress-updates",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.getObservationProgressWorkspace),
);

progressRouter.post(
  "/observations/:id/progress-updates",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.createProgressUpdate),
);

progressRouter.patch(
  "/progress-updates/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.updateProgressUpdate),
);

progressRouter.post(
  "/progress-updates/:id/evidences",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  upload.array("files", 10),
  asyncHandler(progressController.createProgressUpdateEvidence),
);

progressRouter.post(
  "/progress-updates/:id/send-to-audit",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.sendProgressUpdateToAudit),
);

progressRouter.post(
  "/progress-updates/:id/approve",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.approveProgressUpdate),
);

progressRouter.post(
  "/progress-updates/:id/return",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.returnProgressUpdate),
);

progressRouter.post(
  "/progress-updates/:id/reject",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.rejectProgressUpdate),
);

progressRouter.get(
  "/observations/:id/evidences",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.getObservationEvidence),
);

progressRouter.post(
  "/observations/:id/evidences",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  upload.array("files", 10),
  asyncHandler(progressController.createObservationEvidence),
);

progressRouter.delete(
  "/evidences/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.deleteEvidence),
);

progressRouter.get(
  "/evidences/:id/download",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.downloadEvidence),
);

progressRouter.get(
  "/observations/:id/comments",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.getObservationComments),
);

progressRouter.post(
  "/observations/:id/comments",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.createComment),
);

progressRouter.patch(
  "/comments/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.updateComment),
);

progressRouter.delete(
  "/comments/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(progressController.deleteComment),
);
