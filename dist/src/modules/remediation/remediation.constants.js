export const remediationPlanStatusValues = [
    "DRAFT",
    "SENT_TO_AUDIT",
    "APPROVED",
    "RETURNED",
    "CLOSED",
];
export const actionPlanStatusValues = [
    "NOT_STARTED",
    "STARTED",
    "WITH_PROGRESS",
    "CONCLUDED",
];
export const REMEDIATION_ENTITY_TYPES = {
    actionPlan: "actionPlan",
    remediationPlan: "remediation_plan",
};
export const REMEDIATION_ACTIVITY_ACTIONS = {
    approvePlan: "remediation-plan.approve",
    createActionPlan: "actionPlan.create",
    createPlan: "remediation-plan.create",
    deleteActionPlan: "actionPlan.delete",
    markActionPlanComplete: "actionPlan.mark-complete",
    returnPlan: "remediation-plan.return",
    sendActionPlanToAudit: "actionPlan.send-to-audit",
    sendPlanToAudit: "remediation-plan.send-to-audit",
    updateActionPlan: "actionPlan.update",
    updatePlan: "remediation-plan.update",
};
export const PLAN_EDITABLE_STATUSES = new Set([
    "DRAFT",
    "RETURNED",
]);
export const PLAN_PROGRESS_EVALUATION_STATUSES = new Set([
    "APPROVED",
]);
export const SYSTEM_WIDE_ROLE_NAMES = new Set([
    "admin",
    "sistema",
    "sistemas",
    "system",
    "systems",
]);
export const AUDIT_ROLE_MARKERS = ["audit", "auditor", "auditoria"];
//# sourceMappingURL=remediation.constants.js.map