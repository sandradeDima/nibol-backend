import type { z } from "zod";

import type {
  ObservationActionItem,
  ObservationActionSummary,
} from "../observations/observation-completeness.service.js";
import type {
  auditReportQuerySchema,
  reportFiltersSchema,
  reportPreviewQuerySchema,
  reportTypeSchema,
} from "./reports.validators.js";

export type ReportType = z.infer<typeof reportTypeSchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type ReportPreviewQuery = z.infer<typeof reportPreviewQuerySchema>;

export type ReportChartItem = {
  colorToken?: string | null;
  href?: string;
  key: string;
  label: string;
  value: number;
};

export type ReportFilterCapabilities = {
  area: boolean;
  areaResponsible: boolean;
  auditReport: boolean;
  executor: boolean;
  processOwner: boolean;
};

export type ReportObservationRow = {
  actionSummary?: ObservationActionSummary;
  area: { id: string; name: string };
  code: string;
  createdAt: string;
  dueDate: string;
  effectiveStatus: { key: string; name: string };
  id: string;
  isOverdue: boolean;
  progressPercent: number;
  responsibleUser: { email: string; id: string; name: string } | null;
  riskLevel: {
    colorToken: string | null;
    id: string;
    key: string;
    name: string;
  };
  status: { isFinal: boolean; key: string; name: string };
  title: string;
  updatedAt: string;
};

export type ReportActionPlanRow = {
  actionPlanId: string;
  auditReportId: string;
  area: { id: string; name: string };
  areaResponsible: { email: string; id: string; name: string } | null;
  completedAt: string | null;
  createdAt: string;
  deadlineStatus: "VIGENTE" | "VENCIDO";
  description: string;
  effectiveDueDate: string;
  executor: { email: string; id: string; name: string } | null;
  href: string;
  observation: {
    code: string;
    id: string;
    status: { isFinal: boolean; key: string; name: string };
    title: string;
  };
  observationDueDate: string;
  observationId: string;
  officialProgress: {
    code: "NI" | "I" | "CA" | "CO";
    key: "NOT_STARTED" | "STARTED" | "WITH_PROGRESS" | "CONCLUDED";
    label: string;
    percent: number;
  };
  originalDueDate: string;
  processOwner: { email: string; id: string; name: string } | null;
  progressPercent: number;
  reportedProgressPercent: number | null;
  reprogrammed: boolean;
  riskLevel: {
    colorToken: string | null;
    id: string;
    key: string;
    name: string;
  };
  title: string;
  updatedAt: string;
};

export type ReportCriticalObservation = {
  area: { id: string; name: string };
  dueDate: string;
  href: string;
  id: string;
  progressPercent: number;
  riskLevel: { colorToken: string | null; name: string };
  status: { key: string; name: string };
  title: string;
};

export type ReportUpcomingActionPlan = {
  actionPlanId: string;
  effectiveDueDate: string;
  executorName: string;
  href: string;
  observationCode: string;
  progress: { code: "NI" | "I" | "CA" | "CO"; label: string; percent: number };
  status: string;
  title: string;
};

export type ReportOptions = {
  areas: Array<{ id: string; name: string }>;
  areaRelationships: Array<{
    areaId: string;
    areaResponsibleIds: string[];
    executorIds: string[];
    processOwnerIds: string[];
    responsibleExecutorIds: Array<{
      areaResponsibleId: string;
      executorIds: string[];
    }>;
  }>;
  hierarchyRelationships: Array<{
    areaId: string;
    areaResponsibleId: string | null;
    executorId: string | null;
    processOwnerId: string | null;
  }>;
  auditReports: Array<{ id: string; label: string }>;
  areaResponsibles: Array<{ email: string; id: string; name: string }>;
  executors: Array<{ email: string; id: string; name: string }>;
  filterCapabilities: ReportFilterCapabilities;
  observationStatuses: Array<{ id: string; key: string; name: string }>;
  processOwners: Array<{ email: string; id: string; name: string }>;
  progressStatuses: Array<{
    code: "NI" | "I" | "CA" | "CO";
    key: "NOT_STARTED" | "STARTED" | "WITH_PROGRESS" | "CONCLUDED";
    label: string;
    percent: number;
  }>;
  riskLevels: Array<{
    colorToken: string | null;
    id: string;
    key: string;
    name: string;
  }>;
  defaultCutoffDate: string;
};

export type ReportAreaSummary = {
  area: { id: string; name: string };
  averageResolutionDays: number;
  closed: number;
  compliancePercent: number;
  dueSoon: number;
  href: string;
  inProcess: number;
  open: number;
  overdue: number;
  total: number;
};

export type ReportDashboardData = {
  areaSummary: ReportAreaSummary[];
  charts: {
    areaPerformance: Array<ReportChartItem & { compliancePercent: number }>;
    areaDistribution: ReportChartItem[];
    areaResponsibleDistribution: ReportChartItem[];
    currentVsOverdue: ReportChartItem[];
    deadlineDistribution: ReportChartItem[];
    executorDistribution: ReportChartItem[];
    processOwnerDistribution: ReportChartItem[];
    progressDistribution: ReportChartItem[];
    reprogrammedDistribution: ReportChartItem[];
    riskDistribution: ReportChartItem[];
    statusDistribution: ReportChartItem[];
    topOverdueAreas?: ReportChartItem[];
    topResponsibleWorkload?: ReportChartItem[];
    trend: Array<{
      closed: number;
      created: number;
      label: string;
      monthKey: string;
    }>;
  };
  dueSoonDays: number;
  cutoffDate: string;
  generatedAt: string;
  insights: string[];
  operational: {
    criticalOrOverdueObservations: ReportCriticalObservation[];
    upcomingActionPlans: ReportUpcomingActionPlan[];
  };
  rows: ReportActionPlanRow[];
  summary: {
    averageResolutionDays: number;
    conAvance: number;
    concluido: number;
    closed: number;
    compliancePercent: number;
    dueSoon: number;
    iniciado: number;
    inProcess: number;
    noIniciado: number;
    open: number;
    overdue: number;
    predominantRisk: { count: number; key: string; label: string } | null;
    reprogramados: number;
    total: number;
    totalObservations: number;
    pendingObservations: number;
    closedObservations: number;
    vencidos: number;
    vigentes: number;
  };
};

export type ReportPreviewData = {
  charts: ReportDashboardData["charts"];
  columns: string[];
  filters: Record<string, string | number | boolean | null>;
  generatedAt: string;
  reportName: string;
  reportType: ReportType;
  rows: Array<Record<string, unknown>>;
  summary: ReportDashboardData["summary"];
  total: number;
};

export type AuditReportTemplate = z.infer<
  typeof auditReportQuerySchema
>["template"];

export type AuditReportData = {
  columns: string[];
  generatedAt: string;
  rows: Array<Record<string, unknown>>;
  summary: {
    overdue?: number;
    total: number;
  };
  template: AuditReportTemplate;
  timeline?: Array<{
    actor: string;
    area: string;
    date: string;
    description: string;
    result: string;
    title: string;
  }>;
};

export type ObservationActionItemsResponse = ObservationActionItem[];
