import type { AuthorizationSummary } from "../../services/authorization-service.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../utils/prisma.js";
import { buildObservationAccessWhere } from "../observations/observations.service.js";
import type {
  AreaDashboardData,
  AuditDashboardData,
  DashboardActionPlanRow,
  DashboardActivityRow,
  DashboardDistributionItem,
  DashboardMySummary,
  DashboardObservationRow,
  DashboardReviewQueueRow,
  DashboardViewerProfile,
} from "./dashboard.types.js";

const DAY = 86_400_000;
const userSelect = { email: true, id: true, name: true } as const;

const viewerProfile = (
  access: AuthorizationSummary,
): DashboardViewerProfile => {
  const roles = access.roles.join(" ").toLowerCase();
  if (access.isAdmin) return "ADMIN";
  if (/sistema|system/.test(roles)) return "SYSTEMS";
  if (/audit/.test(roles)) return "AUDIT";
  if (/geren|manager|jef/.test(roles)) return "MANAGEMENT";
  if (/responsable|ejecutor/.test(roles)) return "EXECUTOR";
  return "GENERAL";
};

const canViewAudit = (access: AuthorizationSummary) => {
  const profile = viewerProfile(access);
  return (
    ["ADMIN", "SYSTEMS", "AUDIT"].includes(profile) ||
    access.permissions.includes("reports.view")
  );
};

const displayCode = (record: {
  auditReport: { reportNumber: string };
  observationNumber: number;
}) =>
  `${record.auditReport.reportNumber} / OBS-${String(record.observationNumber).padStart(3, "0")}`;

const statusLabel = (value: string) =>
  ({
    NOT_STARTED: "No iniciado",
    STARTED: "Iniciado",
    WITH_PROGRESS: "Con avance",
    CONCLUDED: "Concluido",
    SENT_TO_AUDIT: "En revisión",
    RETURNED: "Devuelto",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
  })[value as "NOT_STARTED"] ?? value.replaceAll("_", " ");

const reminderDays = async () => {
  const record = await prisma.systemParameter.findFirst({
    select: { value: true },
    where: { active: true, deletedAt: null, key: "reminder_days_before_due" },
  });
  const value = Number(record?.value ?? 7);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 7;
};

const observationInclude = {
  areaAssignments: {
    include: {
      area: { select: { id: true, name: true } },
      areaResponsible: { select: userSelect },
      processOwner: { select: userSelect },
    },
  },
  auditReport: { select: { reportNumber: true } },
  riskLevel: { select: { colorToken: true, key: true, name: true } },
  status: { select: { isFinal: true, key: true, name: true } },
} as const;

type ObservationRecord = Prisma.ObservationGetPayload<{
  include: typeof observationInclude;
}>;

const actionPlanInclude = {
  observation: {
    select: {
      auditReport: { select: { reportNumber: true } },
      id: true,
      observationNumber: true,
      title: true,
    },
  },
  observationArea: { select: { area: { select: { id: true, name: true } } } },
  responsibleUser: { select: userSelect },
} as const;
type ActionPlanRecord = Prisma.ActionPlanGetPayload<{
  include: typeof actionPlanInclude;
}>;

const observationRow = (
  record: ObservationRecord,
  now: Date,
): DashboardObservationRow => ({
  area: record.areaAssignments[0]?.area ?? { id: "", name: "Sin área" },
  code: displayCode(record),
  dueDate: record.currentDueDate.toISOString(),
  href: `/observaciones/${record.id}`,
  id: record.id,
  isOverdue:
    !record.status.isFinal && record.currentDueDate.getTime() < now.getTime(),
  progressPercent: record.progressPercent,
  responsibleUser: record.areaAssignments[0]?.areaResponsible ?? null,
  riskLevel: record.riskLevel,
  status: { key: record.status.key, name: record.status.name },
  title: record.title,
  updatedAt: record.updatedAt.toISOString(),
});

const actionPlanRow = (
  record: ActionPlanRecord,
  now: Date,
): DashboardActionPlanRow => {
  const overdue =
    record.status !== "CONCLUDED" &&
    record.currentDueDate.getTime() < now.getTime();
  return {
    area: record.observationArea.area,
    dueDate: record.currentDueDate.toISOString(),
    href: `/planes-accion/${record.id}`,
    id: record.id,
    isOverdue: overdue,
    progressPercent: record.progressPercent,
    responsibleUser: record.responsibleUser,
    status: {
      key: overdue ? "OVERDUE" : record.status,
      name: overdue ? "Vencido" : statusLabel(record.status),
    },
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
    observation: {
      code: displayCode(record.observation),
      id: record.observation.id,
      title: record.observation.title,
    },
  };
};

const distribution = <T>(
  records: T[],
  getKey: (record: T) => string,
  getLabel: (record: T) => string,
): DashboardDistributionItem[] => {
  const values = new Map<string, { label: string; value: number }>();
  for (const record of records) {
    const key = getKey(record);
    const current = values.get(key);
    values.set(key, {
      label: getLabel(record),
      value: (current?.value ?? 0) + 1,
    });
  }
  return [...values.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.value - a.value);
};

const load = async (access: AuthorizationSummary) => {
  const now = new Date();
  const days = await reminderDays();
  const observationWhere = {
    deletedAt: null,
    ...buildObservationAccessWhere(access),
  };
  const [observations, actionPlans, evaluations, extensions] =
    await Promise.all([
      prisma.observation.findMany({
        include: observationInclude,
        orderBy: { updatedAt: "desc" },
        where: observationWhere,
      }),
      prisma.actionPlan.findMany({
        include: actionPlanInclude,
        orderBy: { currentDueDate: "asc" },
        where: { deletedAt: null, observation: observationWhere },
      }),
      prisma.progressEvaluation.findMany({
        include: {
          actionPlan: {
            include: {
              observation: {
                select: {
                  auditReport: { select: { reportNumber: true } },
                  id: true,
                  observationNumber: true,
                  title: true,
                },
              },
              observationArea: { select: { area: { select: { name: true } } } },
              responsibleUser: { select: userSelect },
            },
          },
          submittedByUser: { select: userSelect },
        },
        orderBy: { updatedAt: "desc" },
        where: {
          actionPlan: { observation: observationWhere },
          deletedAt: null,
        },
      }),
      prisma.deadlineExtensionRequest.findMany({
        include: {
          actionPlan: {
            include: {
              observation: {
                select: {
                  auditReport: { select: { reportNumber: true } },
                  id: true,
                  observationNumber: true,
                  title: true,
                },
              },
            },
          },
          observation: {
            select: {
              auditReport: { select: { reportNumber: true } },
              id: true,
              observationNumber: true,
              title: true,
            },
          },
          observationArea: { select: { area: { select: { name: true } } } },
          requestedByUser: { select: userSelect },
        },
        orderBy: { updatedAt: "desc" },
        where: {
          deletedAt: null,
          OR: [
            { observation: observationWhere },
            { actionPlan: { observation: observationWhere } },
          ],
        },
      }),
    ]);
  return { actionPlans, days, evaluations, extensions, now, observations };
};

const buildReviewRows = (
  data: Awaited<ReturnType<typeof load>>,
): DashboardReviewQueueRow[] =>
  [
    ...data.evaluations
      .filter((item) => item.reviewStatus === "SENT_TO_AUDIT")
      .map((item) => ({
        areaName: item.actionPlan.observationArea.area.name,
        href: `/observaciones/${item.actionPlan.observation.id}#colaboracion`,
        id: item.id,
        kind: "PROGRESS" as const,
        responsibleName: item.submittedByUser.name,
        status: { key: item.reviewStatus, name: "Pendiente de Auditoría" },
        subtitle: `${displayCode(item.actionPlan.observation)} · ${item.progressPercent}%`,
        title: item.actionPlan.title,
        updatedAt: item.updatedAt.toISOString(),
      })),
    ...data.extensions
      .filter((item) =>
        ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status),
      )
      .map((item) => {
        const observation = item.observation ?? item.actionPlan!.observation;
        return {
          areaName: item.observationArea?.area.name ?? "Varias áreas",
          href: `/ampliaciones-plazo/${item.id}`,
          id: item.id,
          kind: "EXTENSION" as const,
          responsibleName: item.requestedByUser.name,
          status: {
            key: item.status,
            name:
              item.status === "SENT_TO_MANAGER"
                ? "Pendiente de Gerencia"
                : "Pendiente de Auditoría",
          },
          subtitle: `${displayCode(observation)} · +${Math.round((item.proposedDueDate.getTime() - item.previousDueDate.getTime()) / DAY)} días`,
          title: item.actionPlan?.title ?? observation.title,
          updatedAt: item.updatedAt.toISOString(),
        };
      }),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 12);

const latestRows = (
  data: Awaited<ReturnType<typeof load>>,
): DashboardActivityRow[] =>
  [
    ...data.observations.slice(0, 6).map((item) => ({
      description: `Observación ${item.status.name.toLowerCase()} con ${item.progressPercent}% de avance.`,
      href: `/observaciones/${item.id}`,
      id: item.id,
      kind: "OBSERVATION" as const,
      timestamp: item.updatedAt.toISOString(),
      title: displayCode(item),
    })),
    ...data.evaluations.slice(0, 6).map((item) => ({
      description: `Evaluación ${statusLabel(item.reviewStatus).toLowerCase()} para ${item.actionPlan.title}.`,
      href: `/observaciones/${item.actionPlan.observation.id}#colaboracion`,
      id: item.id,
      kind: "PROGRESS" as const,
      timestamp: item.updatedAt.toISOString(),
      title: `${displayCode(item.actionPlan.observation)} · ${item.progressPercent}%`,
    })),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

const common = async (access: AuthorizationSummary) => {
  const data = await load(access);
  const dueThreshold = new Date(data.now.getTime() + data.days * DAY);
  const open = data.observations.filter((item) => !item.status.isFinal);
  const overdue = open.filter((item) => item.currentDueDate < data.now);
  const upcomingObservations = open.filter(
    (item) =>
      item.currentDueDate >= data.now && item.currentDueDate <= dueThreshold,
  );
  const openPlans = data.actionPlans.filter(
    (item) => item.status !== "CONCLUDED",
  );
  const upcomingPlans = openPlans.filter(
    (item) =>
      item.currentDueDate >= data.now && item.currentDueDate <= dueThreshold,
  );
  const overduePlans = openPlans.filter(
    (item) => item.currentDueDate < data.now,
  );
  const averageProgress = data.observations.length
    ? Math.round(
        data.observations.reduce((sum, item) => sum + item.progressPercent, 0) /
          data.observations.length,
      )
    : 0;
  const byArea = distribution(
    data.observations.flatMap((item) =>
      item.areaAssignments.map((area) => ({ area })),
    ),
    (item) => item.area.area.id,
    (item) => item.area.area.name,
  );
  const byRisk = distribution(
    data.observations,
    (item) => item.riskLevel.key,
    (item) => item.riskLevel.name,
  );
  const byStatus = distribution(
    data.observations,
    (item) => item.status.key,
    (item) => item.status.name,
  );
  const critical = data.observations
    .filter((item) => item.riskLevel.key === "ALTO" && !item.status.isFinal)
    .sort((a, b) => a.currentDueDate.getTime() - b.currentDueDate.getTime())
    .slice(0, 10)
    .map((item) => observationRow(item, data.now));
  const planRows = upcomingPlans
    .slice(0, 10)
    .map((item) => actionPlanRow(item, data.now));
  return {
    averageProgress,
    byArea,
    byRisk,
    byStatus,
    critical,
    data,
    open,
    overdue,
    overduePlans,
    planRows,
    upcomingObservations,
    upcomingPlans,
  };
};

export const dashboardService = {
  async getMySummary(
    access: AuthorizationSummary,
  ): Promise<DashboardMySummary> {
    const profile = viewerProfile(access);
    const audit = canViewAudit(access);
    return {
      canViewAreaDashboard: true,
      canViewAuditDashboard: audit,
      defaultRoute: audit ? "/dashboard/auditoria" : "/dashboard/area",
      preferredDashboard: audit ? "auditoria" : "area",
      subtitle: audit
        ? "Visión corporativa del ciclo de hallazgos."
        : "Seguimiento de sus áreas y planes asignados.",
      viewerProfile: profile,
    };
  },
  async getAuditDashboard(
    access: AuthorizationSummary,
  ): Promise<AuditDashboardData> {
    const value = await common(access);
    const closed = value.data.observations.filter(
      (item) => item.status.isFinal,
    ).length;
    const reviews = buildReviewRows(value.data);
    const topResponsibles = distribution(
      value.data.actionPlans,
      (item) => item.responsibleUser.id,
      (item) => item.responsibleUser.name,
    )
      .slice(0, 8)
      .map((item) => ({ id: item.key, label: item.label, value: item.value }));
    const months = new Map<string, { closed: number; created: number }>();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() - offset);
      months.set(date.toISOString().slice(0, 7), { closed: 0, created: 0 });
    }
    for (const item of value.data.observations) {
      const key = item.createdAt.toISOString().slice(0, 7);
      const month = months.get(key);
      if (month) {
        month.created += 1;
        if (item.status.isFinal) month.closed += 1;
      }
    }
    return {
      charts: {
        currentVsOverdue: [
          {
            key: "current",
            label: "Vigentes",
            value: value.open.length - value.overdue.length,
          },
          { key: "overdue", label: "Vencidas", value: value.overdue.length },
        ],
        monthlyTrend: [...months.entries()].map(([monthKey, item]) => ({
          ...item,
          monthKey,
          monthLabel: monthKey,
        })),
        observationsByArea: value.byArea,
        observationsByRisk: value.byRisk,
        observationsByStatus: value.byStatus,
        topOverdueAreas: value.byArea.slice(0, 8).map((item) => ({
          id: item.key,
          label: item.label,
          value: item.value,
        })),
        topResponsibles,
      },
      generatedAt: new Date().toISOString(),
      reminderDaysBeforeDue: value.data.days,
      scope: "auditoria",
      subtitle:
        "Panorama corporativo normalizado por informe, observación, área y plan.",
      summary: {
        averageProgress: value.averageProgress,
        closedObservations: closed,
        openObservations: value.open.length,
        overdueObservations: value.overdue.length,
        pendingExtensions: value.data.extensions.filter((item) =>
          ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status),
        ).length,
        pendingProgressReviews: value.data.evaluations.filter(
          (item) => item.reviewStatus === "SENT_TO_AUDIT",
        ).length,
        pendingReviews: reviews.length,
        totalObservations: value.data.observations.length,
        upcomingObservations: value.upcomingObservations.length,
      },
      tables: {
        criticalObservations: value.critical,
        latestUpdates: latestRows(value.data),
        pendingReviews: reviews,
        upcomingActionPlans: value.planRows,
      },
      viewerProfile: viewerProfile(access),
    };
  },
  async getAreaDashboard(
    access: AuthorizationSummary,
  ): Promise<AreaDashboardData> {
    const value = await common(access);
    const reviews = buildReviewRows(value.data);
    return {
      charts: {
        currentVsOverdue: [
          {
            key: "current",
            label: "Vigentes",
            value: value.open.length - value.overdue.length,
          },
          { key: "overdue", label: "Vencidas", value: value.overdue.length },
        ],
        observationsByArea: value.byArea,
        observationsByRisk: value.byRisk,
        observationsByStatus: value.byStatus,
      },
      generatedAt: new Date().toISOString(),
      reminderDaysBeforeDue: value.data.days,
      scope: "area",
      subtitle: "Hallazgos y planes bajo su responsabilidad.",
      summary: {
        areaObservations: value.data.observations.length,
        assignedObservations: value.data.observations.length,
        averageProgress: value.averageProgress,
        extensionsInProcess: value.data.extensions.filter((item) =>
          ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status),
        ).length,
        overdueActionPlans: value.overduePlans.length,
        pendingActionPlans: value.data.actionPlans.filter(
          (item) => item.status === "NOT_STARTED",
        ).length,
        returnedProgressEvaluations: value.data.evaluations.filter(
          (item) => item.reviewStatus === "RETURNED",
        ).length,
        upcomingActionPlans: value.upcomingPlans.length,
      },
      tables: {
        criticalObservations: value.critical,
        latestUpdates: latestRows(value.data),
        reviewQueue: reviews,
        upcomingActionPlans: value.planRows,
      },
      viewerProfile: viewerProfile(access),
    };
  },
};
