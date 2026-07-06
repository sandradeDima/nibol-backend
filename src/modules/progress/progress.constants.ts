export const progressUpdateTypeValues = [
  "ADVANCE",
  "FINALIZATION",
  "CORRECTION",
] as const;

export const progressUpdateStatusValues = [
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
  progressUpdate: "progress_update",
} as const;

export const PROGRESS_ACTIVITY_ACTIONS = {
  approveProgressUpdate: "progress-update.approve",
  createComment: "observation-comment.create",
  createEvidence: "evidence-file.upload",
  createProgressUpdate: "progress-update.create",
  deleteComment: "observation-comment.delete",
  deleteEvidence: "evidence-file.delete",
  downloadEvidence: "evidence-file.download",
  rejectProgressUpdate: "progress-update.reject",
  returnProgressUpdate: "progress-update.return",
  sendProgressUpdateToAudit: "progress-update.send-to-audit",
  updateComment: "observation-comment.update",
  updateProgressUpdate: "progress-update.update",
} as const;

export const EDITABLE_PROGRESS_STATUSES = new Set([
  "DRAFT",
  "RETURNED",
] satisfies ReadonlyArray<(typeof progressUpdateStatusValues)[number]>);

export const AUDIT_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "INTERNAL_AUDIT",
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);

export const AREA_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);
