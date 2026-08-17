export const WORKFLOW_PROCESS_TYPE_CATALOG = "workflow_process_type";
export const WORKFLOW_PROCESS_TYPE_VALUES = [
    "DEADLINE_EXTENSION",
    "OBSERVATION_CLOSURE",
    "REMEDIATION_PLAN_APPROVAL",
    "EVIDENCE_REVIEW",
    "SPECIAL_REQUEST",
];
export const WORKFLOW_DEFINITION_STATUS_VALUES = [
    "DRAFT",
    "PUBLISHED",
    "INACTIVE",
    "ARCHIVED",
];
export const WORKFLOW_VERSION_STATUS_VALUES = [
    "DRAFT",
    "PUBLISHED",
    "INACTIVE",
    "ARCHIVED",
];
export const WORKFLOW_NODE_TYPE_VALUES = [
    "START",
    "STAGE",
    "APPROVAL",
    "REJECTION",
    "CONDITION",
    "SLA",
    "ESCALATION",
    "NOTIFICATION",
    "END",
];
export const WORKFLOW_ASSIGNMENT_STRATEGY_VALUES = [
    "FIXED_USER",
    "ROLE",
    "AREA",
    "RECORD_OWNER",
    "OBSERVATION_RESPONSIBLE",
    "REQUESTER",
    "SUPERVISOR",
    "FIELD_REFERENCE",
];
export const WORKFLOW_CONDITION_LOGIC_VALUES = ["AND", "OR"];
export const WORKFLOW_CONDITION_FIELD_VALUES = [
    "riskLevel",
    "observationStatus",
    "areaId",
    "processType",
    "responsibleUserId",
    "dueDate",
    "daysOverdue",
    "hasEvidence",
    "evidenceCount",
    "remediationPlanStatus",
    "requestType",
    "requestedExtensionDays",
    "previousDecision",
];
/**
 * Phase 2.3 stored these aliases in a few draft graphs. They remain accepted
 * at the API boundary and are normalized to the canonical registry keys
 * before evaluation or publication.
 */
export const WORKFLOW_CONDITION_FIELD_ALIASES = {
    area: "areaId",
    evidenceAttached: "hasEvidence",
    overdueDays: "daysOverdue",
    planStatus: "remediationPlanStatus",
    responsible: "responsibleUserId",
    requestedDays: "requestedExtensionDays",
};
export const WORKFLOW_CONDITION_FIELD_INPUT_VALUES = [
    ...WORKFLOW_CONDITION_FIELD_VALUES,
    ...Object.keys(WORKFLOW_CONDITION_FIELD_ALIASES),
];
export const WORKFLOW_CONDITION_OPERATOR_VALUES = [
    "EQUALS",
    "NOT_EQUALS",
    "GREATER_THAN",
    "LESS_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN_OR_EQUAL",
    "CONTAINS",
    "NOT_CONTAINS",
    "IS_EMPTY",
    "IS_NOT_EMPTY",
    "IN",
    "NOT_IN",
    "IS_OVERDUE",
    "DUE_WITHIN",
];
export const WORKFLOW_TRANSITION_TYPE_VALUES = [
    "DEFAULT",
    "FALLBACK",
    "CONDITION",
    "APPROVE",
    "REJECT",
    "OBSERVE",
    "REQUEST_CORRECTION",
    "COMPLETE",
    "REASSIGN",
    "RETURN",
    "CORRECTION",
    "ESCALATION",
    "ALTERNATE_ROUTE",
    "NOTIFICATION",
];
export const WORKFLOW_TIMER_TYPES = [
    "REMINDER",
    "DUE",
    "ESCALATION",
    "ALTERNATE_ROUTE",
];
export const WORKFLOW_TIMER_MAX_ATTEMPTS = 3;
export const WORKFLOW_TIMER_PROCESSOR_JOB_NAME = "workflow-timer-processor";
export const WORKFLOW_DEFAULT_DUE_SOON_HOURS = 48;
export const WORKFLOW_TIMER_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;
export const WORKFLOW_GRAPH_LIMITS = {
    maxConditionsPerGroup: 50,
    maxNodes: 200,
    maxPaths: 250,
    maxSimulationSteps: 100,
    maxTransitions: 500,
};
export const WORKFLOW_DEFINITION_ENTITY_TYPE = "workflow_definition";
export const WORKFLOW_VERSION_ENTITY_TYPE = "workflow_version";
export const WORKFLOW_ACTIVITY_ACTIONS = {
    archive: "workflows.archive",
    create: "workflows.create",
    duplicate: "workflows.duplicate",
    createVersion: "workflows.create_version",
    update: "workflows.edit",
    designerSaved: "workflow.version.designer_saved",
    designerValidated: "workflow.version.designer_validated",
    validationExecuted: "workflow.version.validation_executed",
    simulationExecuted: "workflow.version.simulation_executed",
    published: "workflow.version.published",
    previousDeactivated: "workflow.version.previous_deactivated",
};
export const WORKFLOW_PROCESS_TYPE_LABELS = {
    DEADLINE_EXTENSION: "Ampliación de plazo",
    EVIDENCE_REVIEW: "Revisión de evidencias",
    OBSERVATION_CLOSURE: "Cierre de observación",
    REMEDIATION_PLAN_APPROVAL: "Aprobación de plan de remediación",
    SPECIAL_REQUEST: "Solicitud especial",
};
//# sourceMappingURL=workflows.constants.js.map