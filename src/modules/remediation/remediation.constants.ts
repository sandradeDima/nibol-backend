export const remediationPlanStatusValues = [
  "DRAFT",
  "SENT_TO_AUDIT",
  "APPROVED",
  "RETURNED",
  "CLOSED",
] as const;

export const actionPlanStatusValues = [
  "NOT_STARTED",
  "STARTED",
  "WITH_PROGRESS",
  "CONCLUDED",
] as const;

export const REMEDIATION_ENTITY_TYPES = {
  actionPlan: "actionPlan",
  remediationPlan: "remediation_plan",
} as const;

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
} as const;

export const PLAN_EDITABLE_STATUSES = new Set([
  "DRAFT",
  "RETURNED",
] satisfies ReadonlyArray<(typeof remediationPlanStatusValues)[number]>);

export const PLAN_PROGRESS_EVALUATION_STATUSES = new Set([
  "APPROVED",
] satisfies ReadonlyArray<(typeof remediationPlanStatusValues)[number]>);

export const SYSTEM_WIDE_ROLE_NAMES = new Set([
  "admin",
  "sistema",
  "sistemas",
  "system",
  "systems",
]);

export const AUDIT_ROLE_MARKERS = ["audit", "auditor", "auditoria"] as const;
