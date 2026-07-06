import type {
  CreateCommentInput,
  CreateProgressUpdateInput,
  ListProgressUpdatesQuery,
  ReviewProgressUpdateInput,
  UpdateCommentInput,
  UpdateProgressUpdateInput,
  UploadObservationEvidenceInput,
} from "./progress.validators.js";

export type ProgressUpdateTypeValue =
  | "ADVANCE"
  | "FINALIZATION"
  | "CORRECTION";

export type ProgressUpdateStatusValue =
  | "DRAFT"
  | "SENT_TO_AUDIT"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED";

export type CommentVisibilityValue =
  | "INTERNAL_AUDIT"
  | "AREA_VISIBLE"
  | "SYSTEM";

export type ProgressReviewActionValue =
  | "SENT"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED";

export interface ProgressUserSummary {
  email: string;
  id: string;
  name: string;
  roleLabel: string | null;
}

export interface ProgressAreaSummary {
  id: string;
  name: string;
}

export interface ProgressRiskLevelSummary {
  colorToken: string | null;
  id: string;
  key: string;
  name: string;
}

export interface ProgressPlanTarget {
  area: ProgressAreaSummary;
  id: string;
  ownerUser: ProgressUserSummary | null;
  responsibleUser: ProgressUserSummary | null;
  status: string;
}

export interface ProgressCommitmentTarget {
  id: string;
  progressPercent: number;
  remediationPlanId: string;
  responsibleUser: ProgressUserSummary | null;
  status: string;
  title: string;
}

export interface ProgressReviewHistoryEntry {
  action: ProgressReviewActionValue;
  comment: string | null;
  createdAt: string;
  fromStatus: ProgressUpdateStatusValue | null;
  id: string;
  toStatus: ProgressUpdateStatusValue;
  user: ProgressUserSummary;
}

export interface EvidenceFileItem {
  canDelete: boolean;
  commitmentId: string | null;
  createdAt: string;
  description: string | null;
  downloadPath: string;
  id: string;
  mimeType: string;
  originalName: string;
  progressUpdateId: string | null;
  remediationPlanId: string | null;
  sizeBytes: string;
  uploadedByUser: ProgressUserSummary;
}

export interface ObservationCommentItem {
  authorUser: ProgressUserSummary;
  body: string;
  canDelete: boolean;
  canEdit: boolean;
  commitmentId: string | null;
  createdAt: string;
  id: string;
  progressUpdateId: string | null;
  remediationPlanId: string | null;
  updatedAt: string;
  visibility: CommentVisibilityValue;
}

export interface ProgressUpdateItem {
  canApprove: boolean;
  canEdit: boolean;
  canReject: boolean;
  canReturn: boolean;
  canSendToAudit: boolean;
  comment: string;
  commitmentId: string | null;
  createdAt: string;
  evidences: EvidenceFileItem[];
  history: ProgressReviewHistoryEntry[];
  id: string;
  progressPercent: number | null;
  remediationPlanId: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewedByUser: ProgressUserSummary | null;
  status: ProgressUpdateStatusValue;
  submittedByUser: ProgressUserSummary;
  type: ProgressUpdateTypeValue;
  updatedAt: string;
}

export interface ObservationProgressWorkspace {
  canComment: boolean;
  canCreateProgress: boolean;
  canReview: boolean;
  canUploadEvidence: boolean;
  commitments: ProgressCommitmentTarget[];
  plans: ProgressPlanTarget[];
  progressUpdates: ProgressUpdateItem[];
}

export interface ObservationProgressListItem {
  area: ProgressAreaSummary;
  canEdit: boolean;
  canReview: boolean;
  canSendToAudit: boolean;
  createdAt: string;
  evidenceCount: number;
  evidencePending: boolean;
  id: string;
  observation: {
    code: string;
    id: string;
    title: string;
  };
  progressPercent: number | null;
  responsibleUser: ProgressUserSummary | null;
  riskLevel: ProgressRiskLevelSummary;
  sentToAuditAt: string | null;
  status: ProgressUpdateStatusValue;
  type: ProgressUpdateTypeValue;
}

export type {
  CreateCommentInput,
  CreateProgressUpdateInput,
  ListProgressUpdatesQuery,
  ReviewProgressUpdateInput,
  UpdateCommentInput,
  UpdateProgressUpdateInput,
  UploadObservationEvidenceInput,
};
