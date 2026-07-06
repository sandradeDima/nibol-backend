import type {
  CreateCommitmentInput,
  ListCommitmentsQuery,
  ListRemediationPlansQuery,
  ObservationRemediationQuery,
  RemediationPlanMutationInput,
  RemediationPlanReturnInput,
  RemediationPlanUpdateInput,
  UpdateCommitmentInput,
} from "./remediation.validators.js";

export type RemediationPlanStatusValue =
  | "DRAFT"
  | "SENT_TO_AUDIT"
  | "APPROVED"
  | "RETURNED"
  | "CLOSED";

export type CommitmentStatusValue =
  | "PENDING"
  | "IN_PROGRESS"
  | "SENT_TO_AUDIT"
  | "APPROVED"
  | "RETURNED"
  | "COMPLETED"
  | "OVERDUE";

export interface RemediationUserSummary {
  email: string;
  id: string;
  name: string;
}

export interface RemediationAreaSummary {
  id: string;
  name: string;
}

export interface RemediationRiskLevelSummary {
  colorToken: string | null;
  id: string;
  key: string;
  name: string;
}

export interface RemediationEffectiveStatus {
  key: string;
  name: string;
}

export interface RemediationObservationSummary {
  area: RemediationAreaSummary;
  auditorUser: RemediationUserSummary;
  code: string;
  dueDate: string;
  effectiveStatus: RemediationEffectiveStatus;
  id: string;
  responsibleUser: RemediationUserSummary | null;
  riskLevel: RemediationRiskLevelSummary;
  title: string;
}

export interface RemediationPlanSummary {
  commitmentCount: number;
  id: string;
  nextDueDate: string | null;
  overdueCommitmentCount: number;
  progressPercent: number;
  status: RemediationPlanStatusValue;
  updatedAt: string;
}

export interface RemediationPlanDetail extends RemediationPlanSummary {
  additionalComments: string | null;
  approvedAt: string | null;
  approvedByUser: RemediationUserSummary | null;
  area: RemediationAreaSummary;
  canApprove: boolean;
  canEdit: boolean;
  canReturn: boolean;
  canSendToAudit: boolean;
  createdAt: string;
  createdByUser: RemediationUserSummary;
  mitigationText: string | null;
  observationId: string;
  ownerUser: RemediationUserSummary | null;
  responsibleUser: RemediationUserSummary | null;
  returnReason: string | null;
  returnedAt: string | null;
  returnedByUser: RemediationUserSummary | null;
  sentToAuditAt: string | null;
  strategyText: string;
}

export interface RemediationWorkspaceArea {
  area: RemediationAreaSummary;
  canManagePlan: boolean;
  isPrimary: boolean;
  managerUser: RemediationUserSummary | null;
  plan: RemediationPlanSummary | null;
  responsibleUser: RemediationUserSummary | null;
  roleInFinding: string | null;
}

export interface ObservationRemediationWorkspace {
  areas: RemediationWorkspaceArea[];
  canManageSelectedArea: boolean;
  canReview: boolean;
  observation: RemediationObservationSummary;
  plan: RemediationPlanDetail | null;
  selectedAreaId: string;
}

export interface CommitmentDetail {
  canDelete: boolean;
  canEditStructure: boolean;
  canMarkComplete: boolean;
  canReview: boolean;
  canSendToAudit: boolean;
  canUpdateProgress: boolean;
  completedAt: string | null;
  createdAt: string;
  description: string | null;
  dueDate: string;
  effectiveStatus: RemediationEffectiveStatus;
  id: string;
  isOverdue: boolean;
  observationId: string;
  progressPercent: number;
  remediationPlanId: string;
  responsibleUser: RemediationUserSummary | null;
  sortOrder: number;
  status: CommitmentStatusValue;
  title: string;
  updatedAt: string;
}

export interface RemediationPlanListItem {
  area: RemediationAreaSummary;
  canEdit: boolean;
  canReview: boolean;
  canSendToAudit: boolean;
  commitmentCount: number;
  id: string;
  nextDueDate: string | null;
  observation: Pick<RemediationObservationSummary, "code" | "id" | "title">;
  overdueCommitmentCount: number;
  progressPercent: number;
  responsibleUser: RemediationUserSummary | null;
  riskLevel: RemediationRiskLevelSummary;
  status: RemediationPlanStatusValue;
  updatedAt: string;
}

export interface CommitmentListItem {
  area: RemediationAreaSummary;
  canMarkComplete: boolean;
  canSendToAudit: boolean;
  completedAt: string | null;
  dueDate: string;
  effectiveStatus: RemediationEffectiveStatus;
  id: string;
  isOverdue: boolean;
  observation: Pick<RemediationObservationSummary, "code" | "id" | "title">;
  planStatus: RemediationPlanStatusValue;
  progressPercent: number;
  responsibleUser: RemediationUserSummary | null;
  status: CommitmentStatusValue;
  title: string;
  updatedAt: string;
}

export type {
  CreateCommitmentInput,
  ListCommitmentsQuery,
  ListRemediationPlansQuery,
  ObservationRemediationQuery,
  RemediationPlanMutationInput,
  RemediationPlanReturnInput,
  RemediationPlanUpdateInput,
  UpdateCommitmentInput,
};

