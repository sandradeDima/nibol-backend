export const progressEvaluationTypeValues = [
  "ADVANCE",
  "FINALIZATION",
] as const;

export const progressEvaluationStatusValues = [
  "DRAFT",
  "SENT_TO_AUDIT",
  "APPROVED",
  "RETURNED",
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
] as const;

export const officialProgressByStatus = {
  CONCLUDED: 100,
  NOT_STARTED: 0,
  STARTED: 20,
  WITH_PROGRESS: 60,
} as const;

export const isOfficialProgressStatusTransitionAllowed = (
  current: keyof typeof officialProgressByStatus,
  next: keyof typeof officialProgressByStatus,
): boolean =>
  current === next ||
  officialProgressByStatus[next] > officialProgressByStatus[current];

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
  returnProgressEvaluation: "progress-evaluation.return",
  sendProgressEvaluationToAudit: "progress-evaluation.send-to-audit",
  updateComment: "observation-comment.update",
  updateProgressEvaluation: "progress-evaluation.update",
} as const;

export const EDITABLE_PROGRESS_STATUSES = new Set<string>([
  "DRAFT",
  "RETURNED",
] satisfies ReadonlyArray<(typeof progressEvaluationStatusValues)[number]>);

export const FILE_LEVEL_EVIDENCE_REVIEW_CONTEXTS = new Set<string>([
  "CLOSURE",
  "FINDING",
]);

export const AUDIT_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "INTERNAL_AUDIT",
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);

export const AREA_VISIBLE_COMMENT_VISIBILITIES = new Set([
  "AREA_VISIBLE",
  "SYSTEM",
] satisfies ReadonlyArray<(typeof commentVisibilityValues)[number]>);
