import type {
  CreateObservationInput,
  ListObservationsQuery,
  UpdateObservationInput,
} from "./observations.validators.js";

export type {
  CreateObservationInput,
  ListObservationsQuery,
  UpdateObservationInput,
};

export type UserSummary = {
  email: string;
  id: string;
  jobTitle: string | null;
  name: string;
};

export type ObservationListItem = {
  actionPlanCount: number;
  areas: Array<{
    area: { id: string; name: string };
    areaResponsible: UserSummary;
    id: string;
    processOwner: UserSummary;
    progressPercent: number;
  }>;
  auditReport: {
    id: string;
    reportDate: string;
    reportNumber: string;
    title: string;
  };
  currentDueDate: string;
  displayCode: string;
  id: string;
  isOverdue: boolean;
  mainObservation: { id: string; name: string };
  observationNumber: number;
  originalDueDate: string;
  progressPercent: number;
  risks: Array<{ id: string; name: string }>;
  riskLevel: {
    colorToken: string | null;
    defaultDeadlineDays: number | null;
    id: string;
    key: string;
    name: string;
  };
  status: { id: string; isFinal: boolean; key: string; name: string };
  title: string;
  updatedAt: string;
};

export type ObservationDetail = ObservationListItem & {
  auditRecommendation: string;
  auditorUser: UserSummary;
  category: string | null;
  currentStage: string | null;
  description: string;
  process: string | null;
  source: string | null;
};

export type ObservationFormOptions = {
  areas: Array<{
    code: string | null;
    id: string;
    managerUser: UserSummary | null;
    name: string;
  }>;
  auditReports: Array<{
    id: string;
    reportDate: string;
    reportNumber: string;
    title: string;
  }>;
  mainObservations: Array<{
    description: string | null;
    id: string;
    name: string;
  }>;
  risks: Array<{ description: string | null; id: string; name: string }>;
  riskLevels: Array<{
    colorToken: string | null;
    defaultDeadlineDays: number | null;
    id: string;
    key: string;
    name: string;
  }>;
  users: UserSummary[];
};
