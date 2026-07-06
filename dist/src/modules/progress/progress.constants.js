export const progressUpdateTypeValues = [
    "ADVANCE",
    "FINALIZATION",
    "CORRECTION",
];
export const progressUpdateStatusValues = [
    "DRAFT",
    "SENT_TO_AUDIT",
    "APPROVED",
    "RETURNED",
    "REJECTED",
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
    "REJECTED",
];
export const PROGRESS_ENTITY_TYPES = {
    comment: "observation_comment",
    evidence: "evidence_file",
    progressUpdate: "progress_update",
};
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