import type {
  CreateActionPlanInput,
  CreateRemediationPlanInput,
  ListActionPlansQuery,
  UpdateActionPlanInput,
  UpdateRemediationPlanInput,
} from "./remediation.validators.js";

export type {
  CreateActionPlanInput,
  CreateRemediationPlanInput,
  ListActionPlansQuery,
  UpdateActionPlanInput,
  UpdateRemediationPlanInput,
};

export type ActionPlanStatusValue =
  | "NOT_STARTED"
  | "STARTED"
  | "WITH_PROGRESS"
  | "CONCLUDED";

export type ActionPlanDetail = {
  area: { id: string; name: string };
  areaResponsible: {
    email: string;
    id: string;
    jobTitle: string | null;
    name: string;
  };
  completedAt: string | null;
  createdAt: string;
  currentDueDate: string;
  description: string;
  evidenceCount: number;
  id: string;
  isOverdue: boolean;
  observation: {
    displayCode: string;
    id: string;
    observationNumber: number;
    reportNumber: string;
    title: string;
  };
  observationAreaId: string;
  originalDueDate: string;
  processOwner: {
    email: string;
    id: string;
    jobTitle: string | null;
    name: string;
  };
  progressEvaluationCount: number;
  progressPercent: number;
  responsibleUser: {
    email: string;
    id: string;
    jobTitle: string | null;
    name: string;
  };
  sortOrder: number;
  status: ActionPlanStatusValue;
  statusLabel: string;
  title: string;
  updatedAt: string;
};

export type ActionPlanListItem = ActionPlanDetail;

export type RemediationPlanDetail = {
  additionalComments: string | null;
  area: { id: string; name: string };
  createdAt: string;
  id: string;
  mitigationText: string | null;
  observationId: string;
  ownerUser: {
    email: string;
    id: string;
    jobTitle: string | null;
    name: string;
  } | null;
  returnReason: string | null;
  status: "DRAFT" | "SENT_TO_AUDIT" | "APPROVED" | "RETURNED" | "CLOSED";
  strategyText: string;
  updatedAt: string;
  workflowInstanceId: string | null;
};
