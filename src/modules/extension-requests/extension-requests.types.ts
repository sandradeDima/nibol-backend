import type {
  CreateExtensionRequestInput,
  ListExtensionRequestsQuery,
  ReviewExtensionRequestInput,
  UpdateExtensionRequestInput,
} from "./extension-requests.validators.js";

export type DeadlineExtensionStatusValue =
  | "DRAFT"
  | "SENT_TO_MANAGER"
  | "MANAGER_APPROVED"
  | "MANAGER_REJECTED"
  | "SENT_TO_AUDIT"
  | "AUDIT_APPROVED"
  | "AUDIT_REJECTED"
  | "CANCELLED";

export interface DeadlineExtensionUserSummary {
  email: string;
  id: string;
  name: string;
}

export interface DeadlineExtensionAreaSummary {
  id: string;
  managerUser: DeadlineExtensionUserSummary | null;
  name: string;
}

export interface DeadlineExtensionRiskLevelSummary {
  colorToken: string | null;
  id: string;
  key: string;
  name: string;
}

export interface DeadlineExtensionEffectiveStatus {
  key: string;
  name: string;
}

export interface DeadlineExtensionEvidenceItem {
  createdAt: string;
  description: string | null;
  downloadPath: string;
  id: string;
  mimeType: string;
  originalName: string;
  sizeBytes: string;
  uploadedByUser: DeadlineExtensionUserSummary;
}

export interface DeadlineExtensionObservationSummary {
  area: DeadlineExtensionAreaSummary;
  auditorUser: DeadlineExtensionUserSummary;
  code: string;
  dueDate: string;
  effectiveStatus: DeadlineExtensionEffectiveStatus;
  id: string;
  responsibleUser: DeadlineExtensionUserSummary | null;
  riskLevel: DeadlineExtensionRiskLevelSummary;
  title: string;
}

export interface DeadlineExtensionCommitmentSummary {
  dueDate: string;
  effectiveStatus: DeadlineExtensionEffectiveStatus;
  id: string;
  progressPercent: number;
  responsibleUser: DeadlineExtensionUserSummary | null;
  status: string;
  title: string;
}

export interface DeadlineExtensionRequestListItem {
  area: DeadlineExtensionAreaSummary;
  canCancel: boolean;
  canEdit: boolean;
  canReview: boolean;
  commitment: Pick<DeadlineExtensionCommitmentSummary, "id" | "title"> | null;
  currentDueDate: string;
  id: string;
  impactDays: number;
  isOverdue: boolean;
  observation: Pick<
    DeadlineExtensionObservationSummary,
    "code" | "id" | "riskLevel" | "title"
  >;
  pendingForCurrentUser: boolean;
  requestedByUser: DeadlineExtensionUserSummary;
  requestedDueDate: string;
  status: DeadlineExtensionStatusValue;
  updatedAt: string;
}

export interface DeadlineExtensionRequestDetail
  extends DeadlineExtensionRequestListItem {
  attachments: DeadlineExtensionEvidenceItem[];
  auditComment: string | null;
  auditReviewedAt: string | null;
  auditReviewer: DeadlineExtensionUserSummary | null;
  canAuditApprove: boolean;
  canAuditReject: boolean;
  canManagerApprove: boolean;
  canManagerReject: boolean;
  canSend: boolean;
  commitment: DeadlineExtensionCommitmentSummary | null;
  createdAt: string;
  finalApprovedAt: string | null;
  managerComment: string | null;
  managerReviewedAt: string | null;
  managerReviewer: DeadlineExtensionUserSummary | null;
  nextSubmissionTarget: "audit" | "auto" | "manager";
  observation: DeadlineExtensionObservationSummary;
  reason: string;
}

export interface DeadlineExtensionRequestMutationResult {
  current: DeadlineExtensionRequestDetail;
  previous: DeadlineExtensionRequestDetail | null;
}

export type {
  CreateExtensionRequestInput,
  ListExtensionRequestsQuery,
  ReviewExtensionRequestInput,
  UpdateExtensionRequestInput,
};
