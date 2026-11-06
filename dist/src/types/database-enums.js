// SQL Server stores these values as NVARCHAR; keep application literals validated at the service boundary.
export const NotificationType = {
    INFO: "info",
    SUCCESS: "success",
    WARNING: "warning",
    ERROR: "error",
};
export const NotificationPriority = {
    LOW: "LOW",
    NORMAL: "NORMAL",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL",
};
export const NotificationDeliveryChannel = {
    IN_APP: "IN_APP",
    EMAIL: "EMAIL",
};
export const NotificationDeliveryStatus = {
    PENDING: "PENDING",
    SENT: "SENT",
    FAILED: "FAILED",
    SKIPPED: "SKIPPED",
};
export const ScheduledJobExecutionStatus = {
    RUNNING: "RUNNING",
    SUCCESS: "SUCCESS",
    PARTIAL: "PARTIAL",
    FAILED: "FAILED",
};
export const ScheduledJobTrigger = {
    CRON: "CRON",
    USER: "USER",
    SYSTEM: "SYSTEM",
};
export const RemediationPlanStatus = {
    DRAFT: "DRAFT",
    SENT_TO_AUDIT: "SENT_TO_AUDIT",
    APPROVED: "APPROVED",
    RETURNED: "RETURNED",
    CLOSED: "CLOSED",
};
export const ActionPlanStatus = {
    NOT_STARTED: "NOT_STARTED",
    STARTED: "STARTED",
    WITH_PROGRESS: "WITH_PROGRESS",
    CONCLUDED: "CONCLUDED",
};
export const ProgressEvaluationType = {
    ADVANCE: "ADVANCE",
    FINALIZATION: "FINALIZATION",
};
export const ProgressEvaluationReviewStatus = {
    DRAFT: "DRAFT",
    SENT_TO_AUDIT: "SENT_TO_AUDIT",
    APPROVED: "APPROVED",
    RETURNED: "RETURNED",
};
export const CommentVisibility = {
    INTERNAL_AUDIT: "INTERNAL_AUDIT",
    AREA_VISIBLE: "AREA_VISIBLE",
    SYSTEM: "SYSTEM",
};
export const ProgressReviewAction = {
    SENT: "SENT",
    APPROVED: "APPROVED",
    RETURNED: "RETURNED",
};
export const DeadlineExtensionStatus = {
    DRAFT: "DRAFT",
    SENT_TO_MANAGER: "SENT_TO_MANAGER",
    MANAGER_APPROVED: "MANAGER_APPROVED",
    MANAGER_REJECTED: "MANAGER_REJECTED",
    CANCELLED: "CANCELLED",
};
export const DeadlineExtensionTarget = {
    OBSERVATION: "OBSERVATION",
    ACTION_PLAN: "ACTION_PLAN",
};
export const EvidenceContext = {
    FINDING: "FINDING",
    ACTION_PLAN: "ACTION_PLAN",
    PROGRESS_EVALUATION: "PROGRESS_EVALUATION",
    CLOSURE: "CLOSURE",
};
export const EvidenceReviewStatus = {
    DRAFT: "DRAFT",
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    RETURNED: "RETURNED",
    REJECTED: "REJECTED",
};
export const WorkflowDefinitionStatus = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    INACTIVE: "INACTIVE",
    ARCHIVED: "ARCHIVED",
};
export const WorkflowVersionStatus = {
    DRAFT: "DRAFT",
    PUBLISHED: "PUBLISHED",
    INACTIVE: "INACTIVE",
    ARCHIVED: "ARCHIVED",
};
export const WorkflowNodeType = {
    START: "START",
    STAGE: "STAGE",
    APPROVAL: "APPROVAL",
    SUBFLOW: "SUBFLOW",
    REJECTION: "REJECTION",
    CONDITION: "CONDITION",
    SLA: "SLA",
    ESCALATION: "ESCALATION",
    NOTIFICATION: "NOTIFICATION",
    END: "END",
};
export const WorkflowInstanceStatus = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    WAITING: "WAITING",
    COMPLETED: "COMPLETED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
};
export const WorkflowTaskStatus = {
    PENDING: "PENDING",
    IN_PROGRESS: "IN_PROGRESS",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    OBSERVED: "OBSERVED",
    CORRECTION_REQUESTED: "CORRECTION_REQUESTED",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
};
export const WorkflowTimerStatus = {
    PENDING: "PENDING",
    PROCESSING: "PROCESSING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
};
export const WorkflowAssignmentStrategy = {
    FIXED_USER: "FIXED_USER",
    ROLE: "ROLE",
    AREA: "AREA",
    MANAGEMENT: "MANAGEMENT",
    RECORD_OWNER: "RECORD_OWNER",
    OBSERVATION_RESPONSIBLE: "OBSERVATION_RESPONSIBLE",
    REQUESTER: "REQUESTER",
    SUPERVISOR: "SUPERVISOR",
    FIELD_REFERENCE: "FIELD_REFERENCE",
};
export const WorkflowConditionLogicOperator = {
    AND: "AND",
    OR: "OR",
};
export const WorkflowConditionOperator = {
    EQUALS: "EQUALS",
    NOT_EQUALS: "NOT_EQUALS",
    GREATER_THAN: "GREATER_THAN",
    LESS_THAN: "LESS_THAN",
    GREATER_THAN_OR_EQUAL: "GREATER_THAN_OR_EQUAL",
    LESS_THAN_OR_EQUAL: "LESS_THAN_OR_EQUAL",
    CONTAINS: "CONTAINS",
    NOT_CONTAINS: "NOT_CONTAINS",
    IS_EMPTY: "IS_EMPTY",
    IS_NOT_EMPTY: "IS_NOT_EMPTY",
    IN: "IN",
    NOT_IN: "NOT_IN",
    IS_OVERDUE: "IS_OVERDUE",
    DUE_WITHIN: "DUE_WITHIN",
};
export const isDatabaseEnumValue = (values, value) => Object.values(values).some((item) => item === value);
export const parseDatabaseEnum = (values, value, field) => {
    if (isDatabaseEnumValue(values, value))
        return value;
    throw new Error(`El valor almacenado en ${field} no es válido.`);
};
//# sourceMappingURL=database-enums.js.map