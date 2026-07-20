export type DashboardScope = "auditoria" | "area";

export type DashboardViewerProfile =
  | "ADMIN"
  | "SYSTEMS"
  | "AUDIT"
  | "MANAGEMENT"
  | "EXECUTOR"
  | "GENERAL";

export type DashboardDistributionItem = {
  colorToken?: string | null;
  href?: string;
  key: string;
  label: string;
  value: number;
};

export type DashboardStatusDistributionItem = DashboardDistributionItem & {
  isFinal?: boolean;
};

export type DashboardTrendPoint = {
  closed: number;
  created: number;
  monthKey: string;
  monthLabel: string;
};

export type DashboardRankingItem = {
  href?: string;
  id: string | null;
  label: string;
  secondaryValue?: number;
  value: number;
};

export type DashboardUserSummary = {
  email?: string;
  id: string;
  name: string;
};

export type DashboardAreaSummary = {
  id: string;
  name: string;
};

export type DashboardRiskSummary = {
  colorToken: string | null;
  key: string;
  name: string;
};

export type DashboardStatusSummary = {
  key: string;
  name: string;
};

export type DashboardObservationRow = {
  area: DashboardAreaSummary;
  code: string;
  dueDate: string;
  href: string;
  id: string;
  isOverdue: boolean;
  progressPercent: number;
  responsibleUser: DashboardUserSummary | null;
  riskLevel: DashboardRiskSummary;
  status: DashboardStatusSummary;
  title: string;
  updatedAt: string;
};

export type DashboardCommitmentRow = {
  area: DashboardAreaSummary;
  dueDate: string;
  href: string;
  id: string;
  isOverdue: boolean;
  progressPercent: number;
  responsibleUser: DashboardUserSummary | null;
  status: DashboardStatusSummary;
  title: string;
  updatedAt: string;
  observation: {
    code: string;
    id: string;
    title: string;
  };
};

export type DashboardReviewQueueRow = {
  areaName: string;
  href: string;
  id: string;
  kind: "EXTENSION" | "PROGRESS";
  responsibleName: string | null;
  status: DashboardStatusSummary;
  subtitle: string;
  title: string;
  updatedAt: string;
};

export type DashboardActivityRow = {
  description: string;
  href: string;
  id: string;
  kind: "EXTENSION" | "OBSERVATION" | "PROGRESS";
  timestamp: string;
  title: string;
};

export type AuditDashboardData = {
  charts: {
    currentVsOverdue: DashboardDistributionItem[];
    monthlyTrend: DashboardTrendPoint[];
    observationsByArea: DashboardDistributionItem[];
    observationsByRisk: DashboardDistributionItem[];
    observationsByStatus: DashboardStatusDistributionItem[];
    topOverdueAreas: DashboardRankingItem[];
    topResponsibles: DashboardRankingItem[];
  };
  generatedAt: string;
  reminderDaysBeforeDue: number;
  scope: "auditoria";
  subtitle: string;
  summary: {
    averageProgress: number;
    closedObservations: number;
    openObservations: number;
    overdueObservations: number;
    pendingExtensions: number;
    pendingProgressReviews: number;
    pendingReviews: number;
    totalObservations: number;
    upcomingObservations: number;
  };
  tables: {
    criticalObservations: DashboardObservationRow[];
    latestUpdates: DashboardActivityRow[];
    pendingReviews: DashboardReviewQueueRow[];
    upcomingCommitments: DashboardCommitmentRow[];
  };
  viewerProfile: DashboardViewerProfile;
};

export type AreaDashboardData = {
  charts: {
    currentVsOverdue: DashboardDistributionItem[];
    observationsByArea: DashboardDistributionItem[];
    observationsByRisk: DashboardDistributionItem[];
    observationsByStatus: DashboardStatusDistributionItem[];
  };
  generatedAt: string;
  reminderDaysBeforeDue: number;
  scope: "area";
  subtitle: string;
  summary: {
    areaObservations: number;
    assignedObservations: number;
    averageProgress: number;
    extensionsInProcess: number;
    overdueCommitments: number;
    pendingCommitments: number;
    returnedProgressUpdates: number;
    upcomingCommitments: number;
  };
  tables: {
    criticalObservations: DashboardObservationRow[];
    latestUpdates: DashboardActivityRow[];
    reviewQueue: DashboardReviewQueueRow[];
    upcomingCommitments: DashboardCommitmentRow[];
  };
  viewerProfile: DashboardViewerProfile;
};

export type DashboardMySummary = {
  canViewAreaDashboard: boolean;
  canViewAuditDashboard: boolean;
  defaultRoute: "/dashboard/area" | "/dashboard/auditoria";
  preferredDashboard: DashboardScope;
  subtitle: string;
  viewerProfile: DashboardViewerProfile;
};
