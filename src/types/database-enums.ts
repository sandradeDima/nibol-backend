// SQL Server stores these values as NVARCHAR; keep application literals validated at the service boundary.

export const NotificationType = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationPriority = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type NotificationPriority =
  (typeof NotificationPriority)[keyof typeof NotificationPriority];

export const NotificationDeliveryChannel = {
  IN_APP: "IN_APP",
  EMAIL: "EMAIL",
} as const;
export type NotificationDeliveryChannel =
  (typeof NotificationDeliveryChannel)[keyof typeof NotificationDeliveryChannel];

export const NotificationDeliveryStatus = {
  PENDING: "PENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type NotificationDeliveryStatus =
  (typeof NotificationDeliveryStatus)[keyof typeof NotificationDeliveryStatus];

export const ScheduledJobExecutionStatus = {
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
} as const;
export type ScheduledJobExecutionStatus =
  (typeof ScheduledJobExecutionStatus)[keyof typeof ScheduledJobExecutionStatus];

export const ScheduledJobTrigger = {
  CRON: "CRON",
  USER: "USER",
  SYSTEM: "SYSTEM",
} as const;
export type ScheduledJobTrigger =
  (typeof ScheduledJobTrigger)[keyof typeof ScheduledJobTrigger];

export const RemediationPlanStatus = {
  DRAFT: "DRAFT",
  SENT_TO_AUDIT: "SENT_TO_AUDIT",
  APPROVED: "APPROVED",
  RETURNED: "RETURNED",
  CLOSED: "CLOSED",
} as const;
export type RemediationPlanStatus =
  (typeof RemediationPlanStatus)[keyof typeof RemediationPlanStatus];

export const ActionPlanStatus = {
  NOT_STARTED: "NOT_STARTED",
  STARTED: "STARTED",
  WITH_PROGRESS: "WITH_PROGRESS",
  CONCLUDED: "CONCLUDED",
} as const;
export type ActionPlanStatus =
  (typeof ActionPlanStatus)[keyof typeof ActionPlanStatus];

export const ProgressEvaluationType = {
  ADVANCE: "ADVANCE",
  FINALIZATION: "FINALIZATION",
} as const;
export type ProgressEvaluationType =
  (typeof ProgressEvaluationType)[keyof typeof ProgressEvaluationType];

export const ProgressEvaluationReviewStatus = {
  DRAFT: "DRAFT",
  SENT_TO_AUDIT: "SENT_TO_AUDIT",
  APPROVED: "APPROVED",
  RETURNED: "RETURNED",
} as const;
export type ProgressEvaluationReviewStatus =
  (typeof ProgressEvaluationReviewStatus)[keyof typeof ProgressEvaluationReviewStatus];

export const CommentVisibility = {
  INTERNAL_AUDIT: "INTERNAL_AUDIT",
  AREA_VISIBLE: "AREA_VISIBLE",
  SYSTEM: "SYSTEM",
} as const;
export type CommentVisibility =
  (typeof CommentVisibility)[keyof typeof CommentVisibility];

export const ProgressReviewAction = {
  SENT: "SENT",
  APPROVED: "APPROVED",
  RETURNED: "RETURNED",
} as const;
export type ProgressReviewAction =
  (typeof ProgressReviewAction)[keyof typeof ProgressReviewAction];

export const DeadlineExtensionStatus = {
  DRAFT: "DRAFT",
  SENT_TO_MANAGER: "SENT_TO_MANAGER",
  MANAGER_APPROVED: "MANAGER_APPROVED",
  MANAGER_REJECTED: "MANAGER_REJECTED",
  CANCELLED: "CANCELLED",
} as const;
export type DeadlineExtensionStatus =
  (typeof DeadlineExtensionStatus)[keyof typeof DeadlineExtensionStatus];

export const DeadlineExtensionTarget = {
  OBSERVATION: "OBSERVATION",
  ACTION_PLAN: "ACTION_PLAN",
} as const;
export type DeadlineExtensionTarget =
  (typeof DeadlineExtensionTarget)[keyof typeof DeadlineExtensionTarget];

export const EvidenceContext = {
  FINDING: "FINDING",
  ACTION_PLAN: "ACTION_PLAN",
  PROGRESS_EVALUATION: "PROGRESS_EVALUATION",
  CLOSURE: "CLOSURE",
} as const;
export type EvidenceContext =
  (typeof EvidenceContext)[keyof typeof EvidenceContext];

export const EvidenceReviewStatus = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  RETURNED: "RETURNED",
  REJECTED: "REJECTED",
} as const;
export type EvidenceReviewStatus =
  (typeof EvidenceReviewStatus)[keyof typeof EvidenceReviewStatus];

export const WorkflowDefinitionStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type WorkflowDefinitionStatus =
  (typeof WorkflowDefinitionStatus)[keyof typeof WorkflowDefinitionStatus];

export const WorkflowVersionStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  INACTIVE: "INACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;
export type WorkflowVersionStatus =
  (typeof WorkflowVersionStatus)[keyof typeof WorkflowVersionStatus];

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
} as const;
export type WorkflowNodeType =
  (typeof WorkflowNodeType)[keyof typeof WorkflowNodeType];

export const WorkflowInstanceStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  WAITING: "WAITING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
} as const;
export type WorkflowInstanceStatus =
  (typeof WorkflowInstanceStatus)[keyof typeof WorkflowInstanceStatus];

export const WorkflowTaskStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  OBSERVED: "OBSERVED",
  CORRECTION_REQUESTED: "CORRECTION_REQUESTED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;
export type WorkflowTaskStatus =
  (typeof WorkflowTaskStatus)[keyof typeof WorkflowTaskStatus];

export const WorkflowTimerStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type WorkflowTimerStatus =
  (typeof WorkflowTimerStatus)[keyof typeof WorkflowTimerStatus];

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
} as const;
export type WorkflowAssignmentStrategy =
  (typeof WorkflowAssignmentStrategy)[keyof typeof WorkflowAssignmentStrategy];

export const WorkflowConditionLogicOperator = {
  AND: "AND",
  OR: "OR",
} as const;
export type WorkflowConditionLogicOperator =
  (typeof WorkflowConditionLogicOperator)[keyof typeof WorkflowConditionLogicOperator];

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
} as const;
export type WorkflowConditionOperator =
  (typeof WorkflowConditionOperator)[keyof typeof WorkflowConditionOperator];

export const isDatabaseEnumValue = <T extends Record<string, string>>(
  values: T,
  value: unknown,
): value is T[keyof T] => Object.values(values).some((item) => item === value);

export const parseDatabaseEnum = <T extends Record<string, string>>(
  values: T,
  value: unknown,
  field: string,
): T[keyof T] => {
  if (isDatabaseEnumValue(values, value)) return value;
  throw new Error(`Invalid value stored in ${field}.`);
};
