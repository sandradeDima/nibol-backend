export const progressEvaluationTypeValues = [
  "ADVANCE",
  "FINALIZATION",
  "CORRECTION",
] as const;

export const progressEvaluationStatusValues = [
  "DRAFT",
  "SENT_TO_AUDIT",
  "APPROVED",
  "RETURNED",
  "REJECTED",
] as const;

export const commentVisibilityValues = [
  "INTERNAL_AUDIT",
  "AREA_VISIBLE",
  "SYSTEM",
] as const;

export const progressReviewActionValues = [
  "SENT",
  "APPROVED",
  "RETURNED",
  "REJECTED",
] as const;

export const PROGRESS_ENTITY_TYPES = {
  comment: "observation_comment",
  evidence: "evidence_file",
  progressEvaluation: "progress_evaluation",
} as const;

export const PROGRESS_ACTIVITY_ACTIONS = {
  approveProgressEvaluation: "progress-evaluation.approve",
  createComment: "observation-comment.create",
  createEvidence: "evidence-file.upload",
  createProgressEvaluation: "progress-evaluation.create",
  deleteComment: "observation-comment.delete",
  deleteEvidence: "evidence-file.delete",
  downloadEvidence: "evidence-file.download",
  rejectProgressEvaluation: "progress-evaluation.reject",
  returnProgressEvaluation: "progress-evaluation.return",
  sendProgressEvaluationToAudit: "progress-evaluation.send-to-audit",
  updateComment: "observation-comment.update",
  updateProgressEvaluation: "progress-evaluation.update",
} as const;

export const EDITABLE_PROGRESS_STATUSES = new Set([
  "DRAFT",
  "RETURNED",
] satisfies ReadonlyArray<(typeof progressEvaluationStatusValues)[number]>);

export const AUDIT_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "INTERNAL_AUDIT",
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);

export const AREA_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);
