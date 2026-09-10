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
export const RECOMMENDED_ACTION_PLAN_PERMISSIONS = {
    create: "recommended_action_plans.create",
    delete: "recommended_action_plans.delete",
    edit: "recommended_action_plans.edit",
    submit: "recommended_action_plans.submit_to_audit",
    view: "recommended_action_plans.view",
};
export const PLAN_EDITABLE_STATUSES = new Set([
    "DRAFT",
    "RETURNED",
]);
export const PLAN_PROGRESS_EVALUATION_STATUSES = new Set([
    "APPROVED",
]);
//# sourceMappingURL=remediation.constants.js.map