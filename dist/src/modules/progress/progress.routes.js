import multer from "multer";
import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requireAllPermissions, requirePermission, } from "../../middleware/authorization-middleware.js";
import { progressController as controller } from "./progress.controller.js";
const upload = multer({
    limits: { fileSize: 25 * 1024 * 1024, files: 10 },
    storage: multer.memoryStorage(),
});
export const progressRouter = Router();
progressRouter.get("/progress-evaluations", requirePermission("action_plans.view"), asyncHandler(controller.listProgressEvaluations));
progressRouter.get("/progress-evaluations/:id", requirePermission("action_plans.view"), asyncHandler(controller.getProgressEvaluation));
progressRouter.post("/action-plans/:id/evaluations", requirePermission("action_plans.submit_to_audit"), asyncHandler(controller.createProgressEvaluation));
progressRouter.patch("/progress-evaluations/:id", requirePermission("action_plans.submit_to_audit"), asyncHandler(controller.updateProgressEvaluation));
progressRouter.post("/progress-evaluations/:id/submit", requirePermission("action_plans.submit_to_audit"), asyncHandler(controller.sendProgressEvaluationToAudit));
progressRouter.post("/progress-evaluations/:id/approve", requireAllPermissions(["action_plans.evaluate", "action_plans.approve"]), asyncHandler(controller.approveProgressEvaluation));
progressRouter.post("/progress-evaluations/:id/return", requirePermission("action_plans.evaluate"), asyncHandler(controller.returnProgressEvaluation));
progressRouter.post("/progress-evaluations/:id/evidence", requirePermission("evidence.create"), upload.array("files", 10), asyncHandler(controller.createProgressEvaluationEvidence));
progressRouter.post("/action-plans/:id/evidence", requirePermission("evidence.create"), upload.array("files", 10), asyncHandler(controller.createActionPlanEvidence));
progressRouter.get("/observations/:id/evidence", requirePermission("observations.view"), asyncHandler(controller.getObservationEvidence));
progressRouter.post("/observations/:id/evidence", requirePermission("evidence.create"), upload.array("files", 10), asyncHandler(controller.createObservationEvidence));
progressRouter.delete("/evidences/:id", requirePermission("evidence.delete"), asyncHandler(controller.deleteEvidence));
progressRouter.post("/evidences/:id/submit-review", requirePermission("evidence.create"), asyncHandler(controller.submitEvidenceForReview));
progressRouter.post("/evidences/:id/approve-review", requirePermission("evidence.review"), asyncHandler(controller.approveEvidenceReview));
progressRouter.post("/evidences/:id/return-review", requirePermission("evidence.review"), asyncHandler(controller.returnEvidenceReview));
progressRouter.get("/evidences/:id/download", requirePermission("observations.view"), asyncHandler(controller.downloadEvidence));
progressRouter.get("/observations/:id/comments", requirePermission("observations.view"), asyncHandler(controller.getObservationComments));
progressRouter.post("/observations/:id/comments", requirePermission("observations.view"), asyncHandler(controller.createComment));
progressRouter.patch("/comments/:id", requirePermission("observations.view"), asyncHandler(controller.updateComment));
progressRouter.delete("/comments/:id", requirePermission("observations.view"), asyncHandler(controller.deleteComment));
//# sourceMappingURL=progress.routes.js.map