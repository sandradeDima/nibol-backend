import type { Prisma } from "../../../generated/prisma/client.js";
import { buildObservationUrl } from "../../utils/observation-links.js";
import {
  buildActionPlanScopeWhere,
  buildExtensionRequestScopeWhere,
  buildObservationAreaScopeWhere,
  buildObservationScopeWhere,
  buildProgressEvaluationScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { prisma } from "../../utils/prisma.js";
import type {
  AreaDashboardData,
  AuditDashboardData,
  DashboardActionPlanRow,
  DashboardActivityRow,
  DashboardActionPlanReporting,
  DashboardDistributionItem,
  DashboardMySummary,
  DashboardObservationRow,
  DashboardReviewQueueRow,
  DashboardViewerProfile,
  OperationalDashboardData,
} from "./dashboard.types.js";
import {
  getActionPlanDeadlineStatus,
  getBusinessDateKey,
  getDateOnlyKey,
  getEffectiveActionPlanDueDate,
  getOfficialActionPlanProgress,
  isApprovedDeadlineExtension,
} from "../reports/reporting-definitions.js";

const DAY = 86_400_000;
const userSelect = { email: true, id: true, name: true } as const;

const viewerProfile = (
  access: AuthorizationSummary,
): DashboardViewerProfile => {
  if (access.roleCode === "SYSTEM_ADMIN") return "ADMIN";
  if (access.roleCode === "AUDITOR") return "AUDIT";
  if (access.roleCode === "PROCESS_OWNER") return "MANAGEMENT";
  if (access.roleCode === "AREA_RESPONSIBLE" || access.roleCode === "EXECUTOR")
    return "EXECUTOR";
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

const buildObservationInclude = (access: AuthorizationSummary) => ({
  ...observationInclude,
  areaAssignments: {
    ...observationInclude.areaAssignments,
    where: buildObservationAreaScopeWhere(access),
  },
});

type ObservationRecord = Prisma.ObservationGetPayload<{
  include: typeof observationInclude;
}>;

const actionPlanSelect = {
  completedAt: true,
  currentDueDate: true,
  deadlineExtensionRequests: {
    select: {
      finalApprovedAt: true,
      proposedDueDate: true,
      status: true,
    },
    where: { deletedAt: null },
  },
  description: true,
  id: true,
  originalDueDate: true,
  observation: {
    select: {
      auditReport: { select: { reportNumber: true } },
      id: true,
      observationNumber: true,
      riskLevel: { select: { colorToken: true, key: true, name: true } },
      title: true,
    },
  },
  observationArea: {
    select: {
      area: { select: { id: true, name: true } },
      processOwner: { select: userSelect },
    },
  },
  progressPercent: true,
  responsibleUser: { select: userSelect },
  status: true,
  updatedAt: true,
} satisfies Prisma.ActionPlanSelect;
type ActionPlanRecord = Prisma.ActionPlanGetPayload<{
  select: typeof actionPlanSelect;
}>;

const observationRow = (
  record: ObservationRecord,
  now: Date,
): DashboardObservationRow => ({
  area: record.areaAssignments[0]?.area ?? { id: "", name: "Sin área" },
  code: displayCode(record),
  dueDate: record.currentDueDate.toISOString(),
  href: buildObservationUrl(record.id),
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
  timeZone: string,
): DashboardActionPlanRow => {
  const officialProgress = getOfficialActionPlanProgress(record.status);
  const effectiveDueDate = getEffectiveActionPlanDueDate(record);
  const deadlineStatus = getActionPlanDeadlineStatus(record, now, timeZone);
  return {
    area: record.observationArea.area,
    deadlineStatus,
    dueDate: effectiveDueDate.toISOString(),
    effectiveDueDate: effectiveDueDate.toISOString(),
    href: `/planes-accion/${record.id}`,
    id: record.id,
    isOverdue: deadlineStatus === "VENCIDO",
    officialProgressCode: officialProgress.code,
    officialProgressPercent: officialProgress.percent,
    progressPercent: officialProgress.percent,
    reprogrammed: Boolean(
      record.deadlineExtensionRequests.find(isApprovedDeadlineExtension),
    ),
    responsibleUser: record.responsibleUser,
    status: {
      key: record.status,
      name: officialProgress.label,
    },
    title: record.description,
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
  const observationWhere = buildObservationScopeWhere(access);
  const [observations, actionPlans, evaluations, extensions, setting] =
    await Promise.all([
      prisma.observation.findMany({
        include: buildObservationInclude(access),
        orderBy: { updatedAt: "desc" },
        where: observationWhere,
      }),
      prisma.actionPlan.findMany({
        orderBy: { currentDueDate: "asc" },
        select: actionPlanSelect,
        where: {
          ...buildActionPlanScopeWhere(access),
          observation: { deletedAt: null },
        },
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
          ...buildProgressEvaluationScopeWhere(access),
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
          ...buildExtensionRequestScopeWhere(access),
        },
      }),
      prisma.setting.findFirst({
        select: { timezone: true },
        where: { deletedAt: null },
      }),
    ]);
  return {
    actionPlans,
    days,
    evaluations,
    extensions,
    now,
    observations,
    timeZone: setting?.timezone || "UTC",
  };
};

const buildReviewRows = (
  data: Awaited<ReturnType<typeof load>>,
): DashboardReviewQueueRow[] =>
  [
    ...data.evaluations
      .filter((item) => item.reviewStatus === "SENT_TO_AUDIT")
      .map((item) => ({
        areaName: item.actionPlan.observationArea.area.name,
        href: buildObservationUrl(item.actionPlan.observation.id, {
          advanceId: item.id,
          planId: item.actionPlan.id,
          tab: "plans",
        }),
        id: item.id,
        kind: "PROGRESS" as const,
        responsibleName: item.submittedByUser.name,
        status: { key: item.reviewStatus, name: "Pendiente de Auditoría" },
        subtitle: `${displayCode(item.actionPlan.observation)} · ${item.actionPlan.progressPercent}%`,
        title: item.actionPlan.description,
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
          href: buildObservationUrl(observation.id, {
            extensionId: item.id,
            ...(item.actionPlan?.id ? { planId: item.actionPlan.id } : {}),
            tab: "plans",
          }),
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
          title: item.actionPlan?.description ?? observation.title,
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
      href: buildObservationUrl(item.id),
      id: item.id,
      kind: "OBSERVATION" as const,
      timestamp: item.updatedAt.toISOString(),
      title: displayCode(item),
    })),
    ...data.evaluations.slice(0, 6).map((item) => ({
      description: `Evaluación ${statusLabel(item.reviewStatus).toLowerCase()} para el plan de acción.`,
      href: buildObservationUrl(item.actionPlan.observation.id, {
        advanceId: item.id,
        planId: item.actionPlan.id,
        tab: "plans",
      }),
      id: item.id,
      kind: "PROGRESS" as const,
      timestamp: item.updatedAt.toISOString(),
      title: `${displayCode(item.actionPlan.observation)} · ${item.actionPlan.progressPercent}%`,
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
  const planRowsById = new Map(
    data.actionPlans.map((item) => [
      item.id,
      actionPlanRow(item, data.now, data.timeZone),
    ]),
  );
  const todayKey = getBusinessDateKey(data.now, data.timeZone);
  const planDueSoonEnd = new Date(`${todayKey}T00:00:00.000Z`);
  planDueSoonEnd.setUTCDate(planDueSoonEnd.getUTCDate() + data.days);
  const planDueSoonEndKey = getDateOnlyKey(planDueSoonEnd);
  const upcomingPlans = openPlans.filter((item) => {
    const row = planRowsById.get(item.id)!;
    const dueDateKey = getDateOnlyKey(new Date(row.effectiveDueDate));
    return (
      row.deadlineStatus === "VIGENTE" &&
      dueDateKey >= todayKey &&
      dueDateKey <= planDueSoonEndKey
    );
  });
  const overduePlans = openPlans.filter(
    (item) => planRowsById.get(item.id)?.deadlineStatus === "VENCIDO",
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
    .map((item) => planRowsById.get(item.id)!);
  const planReporting: DashboardActionPlanReporting = {
    charts: {
      byArea: distribution(
        data.actionPlans,
        (item) => item.observationArea.area.id,
        (item) => item.observationArea.area.name,
      ),
      byDeadline: [
        {
          key: "VIGENTE",
          label: "Vigentes",
          value: data.actionPlans.length - overduePlans.length,
        },
        { key: "VENCIDO", label: "Vencidos", value: overduePlans.length },
      ],
      byExecutor: distribution(
        data.actionPlans,
        (item) => item.responsibleUser.id,
        (item) => item.responsibleUser.name,
      ),
      byProcessOwner: distribution(
        data.actionPlans,
        (item) => item.observationArea.processOwner?.id ?? "unassigned",
        (item) => item.observationArea.processOwner?.name ?? "Sin asignar",
      ),
      byProgress: ["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"].map(
        (status) => ({
          key: status,
          label: getOfficialActionPlanProgress(status).label,
          value: data.actionPlans.filter((item) => item.status === status)
            .length,
        }),
      ),
      byReprogrammed: [
        {
          key: "SI",
          label: "Sí",
          value: data.actionPlans.filter((item) =>
            item.deadlineExtensionRequests.some(isApprovedDeadlineExtension),
          ).length,
        },
        {
          key: "NO",
          label: "No",
          value: data.actionPlans.filter(
            (item) =>
              !item.deadlineExtensionRequests.some(isApprovedDeadlineExtension),
          ).length,
        },
      ],
      byRisk: distribution(
        data.actionPlans,
        (item) => item.observation.riskLevel.key,
        (item) => item.observation.riskLevel.name,
      ),
    },
    summary: {
      conAvance: data.actionPlans.filter(
        (item) => item.status === "WITH_PROGRESS",
      ).length,
      concluido: data.actionPlans.filter((item) => item.status === "CONCLUDED")
        .length,
      iniciado: data.actionPlans.filter((item) => item.status === "STARTED")
        .length,
      noIniciado: data.actionPlans.filter(
        (item) => item.status === "NOT_STARTED",
      ).length,
      reprogramados: data.actionPlans.filter((item) =>
        item.deadlineExtensionRequests.some(isApprovedDeadlineExtension),
      ).length,
      total: data.actionPlans.length,
      vencidos: overduePlans.length,
      vigentes: data.actionPlans.length - overduePlans.length,
    },
  };
  return {
    averageProgress,
    actionPlanReporting: planReporting,
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

const operationalAttention = (
  value: Awaited<ReturnType<typeof common>>,
): DashboardObservationRow[] =>
  [...value.data.observations]
    .filter((item) => !item.status.isFinal)
    .sort((a, b) => {
      const rank = (item: (typeof value.data.observations)[number]) => {
        if (item.currentDueDate < value.data.now) return 0;
        if (
          item.currentDueDate >= value.data.now &&
          item.currentDueDate <=
            new Date(value.data.now.getTime() + value.data.days * DAY)
        )
          return 1;
        if (["INICIADO", "CON_AVANCE"].includes(item.status.key)) return 2;
        return 3;
      };
      return (
        rank(a) - rank(b) ||
        a.currentDueDate.getTime() - b.currentDueDate.getTime() ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
    })
    .slice(0, 4)
    .map((item) => observationRow(item, value.data.now));

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
  async getOperationalDashboard(
    access: AuthorizationSummary,
  ): Promise<OperationalDashboardData> {
    const value = await common(access);
    const todayKey = getBusinessDateKey(value.data.now, value.data.timeZone);
    const dueSoonEnd = new Date(`${todayKey}T00:00:00.000Z`);
    dueSoonEnd.setUTCDate(dueSoonEnd.getUTCDate() + value.data.days);
    const dueSoonEndKey = getDateOnlyKey(dueSoonEnd);
    const pendingProgress = value.data.evaluations.filter(
      (item) => item.reviewStatus === "SENT_TO_AUDIT",
    ).length;
    const pendingExtensions = value.data.extensions.filter((item) =>
      ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status),
    ).length;

    return {
      attention: operationalAttention(value),
      generatedAt: value.data.now.toISOString(),
      links: {
        allObservations: "/observaciones",
        inProgressObservations: "/observaciones",
        overdueObservations: "/observaciones?filter.overdue=true",
        pendingApprovals: "/aprobaciones/pendientes",
        pendingExtensions: "/ampliaciones-plazo",
        upcomingObservations: `/observaciones?filter.currentDueDateFrom=${todayKey}&filter.currentDueDateTo=${dueSoonEndKey}`,
      },
      reminderDaysBeforeDue: value.data.days,
      summary: {
        inProgressObservations: value.data.observations.filter(
          (item) =>
            !item.status.isFinal &&
            ["INICIADO", "CON_AVANCE"].includes(item.status.key),
        ).length,
        overdueObservations: value.overdue.length,
        pendingApprovals: pendingProgress + pendingExtensions,
        pendingExtensions,
        totalObservations: value.data.observations.length,
        upcomingObservations: value.upcomingObservations.length,
      },
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
      actionPlanReporting: value.actionPlanReporting,
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
      actionPlanReporting: value.actionPlanReporting,
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
