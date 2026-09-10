export const progressEvaluationTypeValues = [
    "ADVANCE",
    "FINALIZATION",
];
export const progressEvaluationStatusValues = [
    "DRAFT",
    "SENT_TO_AUDIT",
    "APPROVED",
    "RETURNED",
];
export const commentVisibilityValues = [
    "INTERNAL_AUDIT",
    "AREA_VISIBLE",
    "SYSTEM",
];
export const progressReviewActionValues = [
    "SENT",
    "APPROVED",
    "RETURNED",
];
export const officialProgressByStatus = {
    CONCLUDED: 100,
    NOT_STARTED: 0,
    STARTED: 20,
    WITH_PROGRESS: 60,
};
export const PROGRESS_ENTITY_TYPES = {
    comment: "observation_comment",
    evidence: "evidence_file",
    progressEvaluation: "progress_evaluation",
};
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
};
export const EDITABLE_PROGRESS_STATUSES = new Set([
    "DRAFT",
    "RETURNED",
]);
export const AUDIT_VISIBLE_COMMENT_VISIBILITIES = new Set([
    "INTERNAL_AUDIT",
    "AREA_VISIBLE",
    "SYSTEM",
]);
export const AREA_VISIBLE_COMMENT_VISIBILITIES = new Set([
    "AREA_VISIBLE",
    "SYSTEM",
]);
//# sourceMappingURL=progress.constants.js.map