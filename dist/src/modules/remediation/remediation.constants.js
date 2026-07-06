export const remediationPlanStatusValues = [
    "DRAFT",
    "SENT_TO_AUDIT",
    "APPROVED",
    "RETURNED",
    "CLOSED",
];
export const commitmentStatusValues = [
    "PENDING",
    "IN_PROGRESS",
    "SENT_TO_AUDIT",
    "APPROVED",
    "RETURNED",
    "COMPLETED",
    "OVERDUE",
];
export const REMEDIATION_ENTITY_TYPES = {
    commitment: "commitment",
    remediationPlan: "remediation_plan",
};
export const REMEDIATION_ACTIVITY_ACTIONS = {
    approvePlan: "remediation-plan.approve",
    createCommitment: "commitment.create",
    createPlan: "remediation-plan.create",
    deleteCommitment: "commitment.delete",
    markCommitmentComplete: "commitment.mark-complete",
    returnPlan: "remediation-plan.return",
    sendCommitmentToAudit: "commitment.send-to-audit",
    sendPlanToAudit: "remediation-plan.send-to-audit",
    updateCommitment: "commitment.update",
    updatePlan: "remediation-plan.update",
};
export const PLAN_EDITABLE_STATUSES = new Set([
    "DRAFT",
    "RETURNED",
]);
export const PLAN_PROGRESS_UPDATE_STATUSES = new Set([
    "APPROVED",
]);
export const SYSTEM_WIDE_ROLE_NAMES = new Set([
    "admin",
    "sistema",
    "sistemas",
    "system",
    "systems",
]);
export const AUDIT_ROLE_MARKERS = [
    "audit",
    "auditor",
    "auditoria",
];
//# sourceMappingURL=remediation.constants.js.map