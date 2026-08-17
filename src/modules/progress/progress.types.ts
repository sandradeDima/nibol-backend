export type {
  CreateCommentInput,
  CreateProgressEvaluationInput,
  ListProgressEvaluationsQuery,
  ReviewProgressEvaluationInput,
  UpdateCommentInput,
  UpdateProgressEvaluationInput,
  UploadEvidenceInput,
} from "./progress.validators.js";

export type ProgressEvaluationReviewStatusValue =
  | "DRAFT"
  | "SENT_TO_AUDIT"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED";
