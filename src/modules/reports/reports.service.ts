/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Prisma } from "../../../generated/prisma/client.js";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { prisma } from "../../utils/prisma.js";
import {
  buildObservationAttentionWhere,
  observationCompletenessService,
  type ObservationActionObservation,
} from "../observations/observation-completeness.service.js";
import {
  buildObservationScopeWhere,
  getDaysBetween,
  getObservationStatusGroup,
  getRiskGroupLabel,
  hasGlobalBusinessAccess,
  isObservationClosed,
  isObservationDueSoon,
  isObservationOverdue,
  REPORT_DEFAULT_DUE_SOON_DAYS,
} from "./reporting-definitions.js";
import type {
  AuditReportData,
  ReportAreaSummary,
  ReportChartItem,
  ReportDashboardData,
  ReportObservationRow,
  ReportPreviewData,
} from "./reports.types.js";
import type {
  AuditReportQuery,
  ReportFilters,
  ReportPreviewQuery,
  ReportQuery,
} from "./reports.validators.js";

const reportsPrisma = prisma as typeof prisma & {
  area: any;
  auditLog: any;
  actionPlan: any;
  deadlineExtensionRequest: any;
  entityActivity: any;
  evidenceFile: any;
  observation: any;
  progressReviewHistory: any;
  progressEvaluation: any;
  remediationPlan: any;
  systemParameter: any;
  user: any;
  workflowInstance: any;
  workflowTransitionLog: any;
};

const userSummarySelect = {
  email: true,
  id: true,
  name: true,
} as const;

const areaSummarySelect = {
  id: true,
  name: true,
} as const;

const observationIdentitySelect = {
  auditReport: { select: { reportNumber: true } },
  id: true,
  observationNumber: true,
  title: true,
} as const;

const observationDisplayCode = (observation: {
  auditReport: { reportNumber: string };
  observationNumber: number;
}): string =>
  `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`;

const observationReportSelect = {
  areaAssignments: {
    select: {
      area: { select: areaSummarySelect },
      areaResponsible: { select: userSummarySelect },
      areaResponsibleUserId: true,
      areaId: true,
      processOwnerUserId: true,
    },
  },
  auditReport: { select: { reportNumber: true } },
  createdAt: true,
  currentDueDate: true,
  id: true,
  observationNumber: true,
  progressPercent: true,
  risks: { select: { id: true } },
  riskLevel: {
    select: {
      colorToken: true,
      id: true,
      key: true,
      name: true,
    },
  },
  status: {
    select: {
      isFinal: true,
      key: true,
      name: true,
    },
  },
  title: true,
  updatedAt: true,
} as const;

const dateRange = (
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined => {
  if (!dateFrom && !dateTo) return undefined;

  const result: Prisma.DateTimeFilter = {};
  if (dateFrom) result.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) {
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    result.lt = end;
  }
  return result;
};

const buildObservationWhere = (
  filters: ReportFilters,
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  const conditions: Prisma.ObservationWhereInput[] = [
    buildObservationScopeWhere(access),
  ];
  const periodFilter = dateRange(filters.dateFrom, filters.dateTo);

  if (periodFilter) {
    conditions.push({
      [filters.periodField]: periodFilter,
    } as Prisma.ObservationWhereInput);
  }
  if (filters.areaId)
    conditions.push({ areaAssignments: { some: { areaId: filters.areaId } } });
  if (filters.activeOnly) conditions.push({ status: { isFinal: false } });
  if (filters.riskLevelId)
    conditions.push({ riskLevelId: filters.riskLevelId });
  if (filters.statusId) conditions.push({ statusId: filters.statusId });
  if (filters.responsibleUserId)
    conditions.push({
      OR: [
        {
          areaAssignments: {
            some: { areaResponsibleUserId: filters.responsibleUserId },
          },
        },
        {
          areaAssignments: {
            some: { processOwnerUserId: filters.responsibleUserId },
          },
        },
        {
          actionPlans: {
            some: { responsibleUserId: filters.responsibleUserId },
          },
        },
      ],
    });
  if (filters.progressMin !== undefined)
    conditions.push({ progressPercent: { gte: filters.progressMin } });
  if (filters.progressMax !== undefined)
    conditions.push({ progressPercent: { lte: filters.progressMax } });
  if (filters.hasPlan !== undefined) {
    conditions.push(
      filters.hasPlan
        ? { remediationPlans: { some: { deletedAt: null } } }
        : { remediationPlans: { none: { deletedAt: null } } },
    );
  }
  if (filters.hasEvidence !== undefined) {
    conditions.push(
      filters.hasEvidence
        ? { evidenceFiles: { some: { deletedAt: null } } }
        : { evidenceFiles: { none: { deletedAt: null } } },
    );
  }
  if (filters.hasExtension !== undefined) {
    conditions.push(
      filters.hasExtension
        ? { deadlineExtensionRequests: { some: { deletedAt: null } } }
        : { deadlineExtensionRequests: { none: { deletedAt: null } } },
    );
  }
  if (filters.search) {
    conditions.push({
      OR: [
        { auditReport: { reportNumber: { contains: filters.search } } },
        { title: { contains: filters.search } },
        {
          areaAssignments: {
            some: { area: { name: { contains: filters.search } } },
          },
        },
        {
          areaAssignments: {
            some: { areaResponsible: { name: { contains: filters.search } } },
          },
        },
      ],
    });
  }
  if (filters.overdue) {
    conditions.push(
      buildObservationAttentionWhere("OVERDUE", filters.dueSoonDays),
    );
  }
  if (filters.dueSoon) {
    conditions.push(
      buildObservationAttentionWhere("DUE_SOON", filters.dueSoonDays),
    );
  }

  return { AND: conditions };
};

const getConfiguredDueSoonDays = async (): Promise<number> => {
  try {
    const parameter = await reportsPrisma.systemParameter.findFirst({
      select: { value: true },
      where: {
        active: true,
        deletedAt: null,
        key: "reminder_days_before_due",
      },
    });
    const value = Number(parameter?.value);
    return Number.isFinite(value) && value > 0
      ? Math.min(90, Math.round(value))
      : REPORT_DEFAULT_DUE_SOON_DAYS;
  } catch {
    return REPORT_DEFAULT_DUE_SOON_DAYS;
  }
};

const buildObservationActionInput = (
  observation: any,
): ObservationActionObservation => ({
  areaAssignments: observation.areaAssignments.map((assignment: any) => ({
    areaId: assignment.areaId,
    areaName: assignment.area.name,
    areaResponsibleUserId: assignment.areaResponsibleUserId,
    processOwnerUserId: assignment.processOwnerUserId,
  })),
  currentDueDate: observation.currentDueDate,
  id: observation.id,
  progressPercent: observation.progressPercent,
  riskCount: observation.risks.length,
  status: {
    isFinal: observation.status.isFinal,
    key: observation.status.key,
  },
});

const mapObservationRow = (
  observation: any,
  actionSummary?: ReportObservationRow["actionSummary"],
  now = new Date(),
): ReportObservationRow => {
  const overdue = isObservationOverdue(
    observation.currentDueDate,
    observation.status,
    now,
  );

  return {
    area: observation.areaAssignments[0]?.area ?? { id: "", name: "Sin área" },
    code: `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`,
    createdAt: observation.createdAt.toISOString(),
    dueDate: observation.currentDueDate.toISOString(),
    effectiveStatus: overdue
      ? { key: "VENCIDA", name: "Vencida" }
      : { key: observation.status.key, name: observation.status.name },
    id: observation.id,
    isOverdue: overdue,
    progressPercent: observation.progressPercent,
    responsibleUser: observation.areaAssignments[0]?.areaResponsible ?? null,
    riskLevel: observation.riskLevel,
    status: observation.status,
    title: observation.title,
    updatedAt: observation.updatedAt.toISOString(),
    ...(actionSummary ? { actionSummary } : {}),
  };
};

const mapObservationRows = async (
  observations: any[],
  access: AuthorizationSummary,
  now = new Date(),
): Promise<ReportObservationRow[]> => {
  const actionSummaryById = await observationCompletenessService.getSummaries(
    observations.map(buildObservationActionInput),
    access,
  );

  return observations.map((observation) =>
    mapObservationRow(observation, actionSummaryById.get(observation.id), now),
  );
};

const getObservationRows = async (
  query: ReportQuery | ReportPreviewQuery,
  access: AuthorizationSummary,
  options?: { limit?: number },
): Promise<{ data: ReportObservationRow[]; total: number }> => {
  const dueSoonDays = query.dueSoonDays ?? (await getConfiguredDueSoonDays());
  const normalizedQuery = { ...query, dueSoonDays };
  const where = buildObservationWhere(normalizedQuery, access);
  const limit = options?.limit ?? query.perPage;
  const [total, observations] = await reportsPrisma.$transaction([
    reportsPrisma.observation.count({ where }),
    reportsPrisma.observation.findMany({
      orderBy: [{ currentDueDate: "asc" }, { updatedAt: "desc" }],
      select: observationReportSelect,
      skip: options?.limit ? 0 : (query.page - 1) * query.perPage,
      take: limit,
      where,
    }),
  ]);

  return {
    data: await mapObservationRows(observations, access, new Date()),
    total,
  };
};

const buildClosureMap = async (
  where: Prisma.ObservationWhereInput,
): Promise<Map<string, Date>> => {
  const closureEvents = await reportsPrisma.entityActivity.findMany({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, observationId: true },
    where: {
      activityType: "OBSERVATION_CLOSED",
      observation: where,
    },
  });
  const result = new Map<string, Date>();
  closureEvents.forEach((event: any) => {
    if (event.observationId && !result.has(event.observationId)) {
      result.set(event.observationId, event.createdAt);
    }
  });
  return result;
};

const getMonthKey = (value: Date): string => {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
};

const getMonthLabel = (value: Date): string => {
  return new Intl.DateTimeFormat("es-BO", {
    month: "short",
    timeZone: "UTC",
  }).format(value);
};

const getMonthRange = (dateFrom?: string, dateTo?: string): Date[] => {
  const end = dateTo ? new Date(`${dateTo}T00:00:00.000Z`) : new Date();
  const start = dateFrom
    ? new Date(`${dateFrom}T00:00:00.000Z`)
    : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const first = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: Date[] = [];
  for (
    const current = first;
    current <= last;
    current.setUTCMonth(current.getUTCMonth() + 1)
  ) {
    months.push(new Date(current));
  }
  return months.slice(-12);
};

const buildFilterLabelMap = (
  filters: ReportFilters,
): Record<string, string | number | boolean | null> => ({
  Área: filters.areaId ?? "Todas",
  Estado: filters.statusId ?? "Todos",
  Evidencia:
    filters.hasEvidence === undefined
      ? "Todas"
      : filters.hasEvidence
        ? "Con evidencia"
        : "Sin evidencia",
  Período:
    filters.dateFrom || filters.dateTo
      ? `${filters.dateFrom ?? "Inicio"} – ${filters.dateTo ?? "Hoy"}`
      : "Período actual",
  Riesgo: filters.riskLevelId ?? "Todos",
  Responsable: filters.responsibleUserId ?? "Todos",
  Vencidas: filters.overdue ?? false,
});

const getDashboard = async (
  filters: ReportFilters,
  access: AuthorizationSummary,
): Promise<ReportDashboardData> => {
  const dueSoonDays = filters.dueSoonDays || (await getConfiguredDueSoonDays());
  const normalizedFilters = { ...filters, dueSoonDays };
  const where = buildObservationWhere(normalizedFilters, access);
  const now = new Date();
  const overdueWhere = {
    AND: [where, buildObservationAttentionWhere("OVERDUE", dueSoonDays)],
  };
  const dueSoonWhere = {
    AND: [where, buildObservationAttentionWhere("DUE_SOON", dueSoonDays)],
  };
  const inProcessWhere = {
    AND: [where, { status: { key: { in: ["INICIADO", "CON_AVANCE"] } } }],
  };
  const closedWhere = { AND: [where, { status: { isFinal: true } }] };

  const [
    total,
    open,
    closed,
    overdue,
    dueSoon,
    inProcess,
    observations,
    closureMap,
  ] = await Promise.all([
    reportsPrisma.observation.count({ where }),
    reportsPrisma.observation.count({
      where: { AND: [where, { status: { isFinal: false } }] },
    }),
    reportsPrisma.observation.count({ where: closedWhere }),
    reportsPrisma.observation.count({ where: overdueWhere }),
    reportsPrisma.observation.count({ where: dueSoonWhere }),
    reportsPrisma.observation.count({ where: inProcessWhere }),
    reportsPrisma.observation.findMany({
      select: {
        areaAssignments: {
          select: { area: { select: areaSummarySelect }, areaId: true },
        },
        createdAt: true,
        currentDueDate: true,
        id: true,
        progressPercent: true,
        riskLevel: {
          select: { colorToken: true, id: true, key: true, name: true },
        },
        status: { select: { isFinal: true, key: true, name: true } },
        updatedAt: true,
      },
      where,
    }),
    buildClosureMap(where),
  ]);

  const riskCounts = new Map<string, ReportChartItem>();
  const statusCounts = new Map<string, ReportChartItem>();
  const areaMap = new Map<
    string,
    ReportAreaSummary & { complianceCount: number; resolutionCount: number }
  >();
  const resolutionDurations: number[] = [];
  let complianceCount = 0;
  let complianceDenominator = 0;

  observations.forEach((observation: any) => {
    const observationOverdue = isObservationOverdue(
      observation.currentDueDate,
      observation.status,
      now,
    );
    const observationDueSoon = isObservationDueSoon(
      observation.currentDueDate,
      observation.status,
      dueSoonDays,
      now,
    );
    const statusGroup = getObservationStatusGroup(
      observation.status,
      observationOverdue,
    );
    const riskLabel = getRiskGroupLabel(
      observation.riskLevel.key,
      observation.riskLevel.name,
    );
    const currentRisk = riskCounts.get(riskLabel) ?? {
      colorToken: observation.riskLevel.colorToken,
      href: `/observaciones?filter.riskLevelId=${encodeURIComponent(observation.riskLevel.id)}`,
      key: observation.riskLevel.key,
      label: riskLabel,
      value: 0,
    };
    currentRisk.value += 1;
    riskCounts.set(riskLabel, currentRisk);

    const currentStatus = statusCounts.get(statusGroup) ?? {
      key: statusGroup,
      label:
        statusGroup === "IN_PROGRESS"
          ? "En proceso"
          : statusGroup === "IN_REVIEW"
            ? "En revisión"
            : statusGroup === "CLOSED"
              ? "Cerradas"
              : statusGroup === "OVERDUE"
                ? "Vencidas"
                : "Abiertas",
      value: 0,
      ...(statusGroup === "OVERDUE"
        ? { href: "/observaciones?filter.overdue=true" }
        : {}),
    };
    currentStatus.value += 1;
    statusCounts.set(statusGroup, currentStatus);

    for (const assignment of observation.areaAssignments) {
      const currentArea = areaMap.get(assignment.areaId) ?? {
        area: assignment.area,
        averageResolutionDays: 0,
        closed: 0,
        compliancePercent: 0,
        dueSoon: 0,
        href: `/observaciones?filter.areaId=${encodeURIComponent(assignment.areaId)}`,
        inProcess: 0,
        open: 0,
        complianceCount: 0,
        resolutionCount: 0,
        overdue: 0,
        total: 0,
      };
      currentArea.total += 1;
      if (isObservationClosed(observation.status)) {
        currentArea.closed += 1;
        const closedAt = closureMap.get(observation.id);
        if (closedAt) {
          const days = getDaysBetween(observation.createdAt, closedAt);
          currentArea.averageResolutionDays += days;
          currentArea.resolutionCount += 1;
          resolutionDurations.push(days);
          complianceDenominator += 1;
          if (closedAt.getTime() <= observation.currentDueDate.getTime()) {
            complianceCount += 1;
            currentArea.complianceCount += 1;
          }
        }
      } else {
        currentArea.open += 1;
      }
      if (
        observation.status.key === "INICIADO" ||
        observation.status.key === "CON_AVANCE"
      )
        currentArea.inProcess += 1;
      if (observationOverdue) currentArea.overdue += 1;
      if (observationDueSoon) currentArea.dueSoon += 1;
      areaMap.set(assignment.areaId, currentArea);
    }
  });

  const areaSummary = [...areaMap.values()].map(
    ({ complianceCount: areaComplianceCount, resolutionCount, ...area }) => ({
      ...area,
      averageResolutionDays:
        resolutionCount > 0
          ? Math.round(area.averageResolutionDays / resolutionCount)
          : 0,
      compliancePercent:
        resolutionCount > 0
          ? Math.round((areaComplianceCount / resolutionCount) * 100)
          : 0,
    }),
  );

  const months = getMonthRange(filters.dateFrom, filters.dateTo);
  const trend = months.map((month) => {
    const monthKey = getMonthKey(month);
    const created = observations.filter(
      (observation: any) => getMonthKey(observation.createdAt) === monthKey,
    ).length;
    const closedCount = [...closureMap.entries()].filter(
      ([observationId, closedAt]) => {
        return (
          getMonthKey(closedAt) === monthKey &&
          observations.some(
            (observation: any) => observation.id === observationId,
          )
        );
      },
    ).length;
    return {
      closed: closedCount,
      created,
      label: getMonthLabel(month),
      monthKey,
    };
  });

  const riskDistribution = [...riskCounts.values()].sort(
    (left, right) => right.value - left.value,
  );
  const statusDistribution = [...statusCounts.values()].sort(
    (left, right) => right.value - left.value,
  );
  const predominantRisk = riskDistribution[0]
    ? {
        count: riskDistribution[0].value,
        key: riskDistribution[0].key,
        label: riskDistribution[0].label,
      }
    : null;
  const areaPerformance = areaSummary.map((area) => ({
    compliancePercent: area.compliancePercent,
    href: area.href,
    key: area.area.id,
    label: area.area.name,
    value: area.compliancePercent,
  }));
  const currentVsOverdue: ReportChartItem[] = [
    {
      key: "vigentes",
      label: "Vigentes",
      value: Math.max(0, total - overdue - dueSoon),
    },
    { key: "proximas", label: "Próximas a vencer", value: dueSoon },
    { key: "vencidas", label: "Vencidas", value: overdue },
  ];
  const averageResolutionDays =
    resolutionDurations.length > 0
      ? Math.round(
          resolutionDurations.reduce((sum, value) => sum + value, 0) /
            resolutionDurations.length,
        )
      : 0;
  const compliancePercent =
    complianceDenominator > 0
      ? Math.round((complianceCount / complianceDenominator) * 100)
      : 0;
  const insights: string[] = [];
  const overdueArea = [...areaSummary].sort(
    (left, right) => right.overdue - left.overdue,
  )[0];
  if (overdueArea && overdueArea.overdue > 0) {
    insights.push(
      `${overdueArea.area.name} concentra el mayor número de observaciones vencidas (${overdueArea.overdue}).`,
    );
  }
  const slowestArea = [...areaSummary].sort(
    (left, right) => right.averageResolutionDays - left.averageResolutionDays,
  )[0];
  if (slowestArea && slowestArea.averageResolutionDays > 0) {
    insights.push(
      `${slowestArea.area.name} presenta el mayor tiempo promedio de resolución: ${slowestArea.averageResolutionDays} días.`,
    );
  }
  const highRiskDueSoon = observations.filter((observation: any) => {
    const risk = getRiskGroupLabel(
      observation.riskLevel.key,
      observation.riskLevel.name,
    );
    return (
      ["Crítico", "Alto"].includes(risk) &&
      isObservationDueSoon(
        observation.currentDueDate,
        observation.status,
        dueSoonDays,
        now,
      )
    );
  }).length;
  if (highRiskDueSoon > 0) {
    insights.push(
      `${highRiskDueSoon} observación${highRiskDueSoon === 1 ? "" : "es"} de riesgo Alto o Crítico vence${highRiskDueSoon === 1 ? "" : "n"} en los próximos ${dueSoonDays} días.`,
    );
  }
  if (insights.length === 0 && total > 0) {
    insights.push(
      "No se identificaron concentraciones críticas con los filtros seleccionados.",
    );
  }

  return {
    areaSummary,
    charts: {
      areaPerformance,
      currentVsOverdue,
      riskDistribution,
      statusDistribution,
      trend,
    },
    dueSoonDays,
    generatedAt: new Date().toISOString(),
    insights,
    summary: {
      averageResolutionDays,
      closed,
      compliancePercent,
      dueSoon,
      inProcess,
      open,
      overdue,
      predominantRisk,
      total,
    },
  };
};

const toObservationFlatRow = (
  row: ReportObservationRow,
): Record<string, unknown> => ({
  Área: row.area.name,
  Avance: `${row.progressPercent}%`,
  Código: row.code,
  Estado: row.effectiveStatus.name,
  Fecha: row.dueDate,
  Observación: row.title,
  Responsable: row.responsibleUser?.name ?? "Sin asignar",
  Riesgo: row.riskLevel.name,
});

const getReportRows = async (
  query: ReportPreviewQuery,
  access: AuthorizationSummary,
  dashboard: ReportDashboardData,
): Promise<{
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
}> => {
  const observationWhere = buildObservationWhere(query, access);
  switch (query.type) {
    case "ACTION_PLANS": {
      const actionPlans = await reportsPrisma.actionPlan.findMany({
        orderBy: { currentDueDate: "asc" },
        select: {
          completedAt: true,
          currentDueDate: true,
          observation: { select: observationIdentitySelect },
          progressPercent: true,
          responsibleUser: { select: userSummarySelect },
          status: true,
          title: true,
        },
        where: { deletedAt: null, observation: observationWhere },
      });
      return {
        columns: [
          "Plan de acción",
          "Observación",
          "Responsable",
          "Fecha límite",
          "Avance",
          "Estado",
        ],
        rows: actionPlans.map((actionPlan: any) => ({
          Avance: `${actionPlan.progressPercent}%`,
          "Plan de acción": actionPlan.title,
          "Fecha límite": actionPlan.currentDueDate.toISOString(),
          Estado: actionPlan.status,
          Observación: `${observationDisplayCode(actionPlan.observation)} · ${actionPlan.observation.title}`,
          Responsable: actionPlan.responsibleUser?.name ?? "Sin asignar",
        })),
        total: actionPlans.length,
      };
    }
    case "PROGRESS_EVIDENCE": {
      const evidences = await reportsPrisma.evidenceFile.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          description: true,
          mimeType: true,
          originalName: true,
          observation: { select: observationIdentitySelect },
          context: true,
          uploadedByUser: { select: userSummarySelect },
        },
        where: { deletedAt: null, observation: observationWhere },
      });
      return {
        columns: [
          "Observación",
          "Evidencia",
          "Tipo",
          "Cargada por",
          "Fecha",
          "Descripción",
        ],
        rows: evidences.map((evidence: any) => ({
          Descripción: evidence.description ?? "",
          "Cargada por": evidence.uploadedByUser.name,
          Evidencia: evidence.originalName,
          Fecha: evidence.createdAt.toISOString(),
          Observación: `${observationDisplayCode(evidence.observation)} · ${evidence.observation.title}`,
          Tipo: `${evidence.context} · ${evidence.mimeType}`,
        })),
        total: evidences.length,
      };
    }
    case "EXTENSIONS": {
      const requests = await reportsPrisma.deadlineExtensionRequest.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          actionPlan: {
            select: {
              observation: { select: observationIdentitySelect },
              title: true,
            },
          },
          observation: { select: observationIdentitySelect },
          observationArea: { select: { area: { select: areaSummarySelect } } },
          previousDueDate: true,
          proposedDueDate: true,
          requestedByUser: { select: userSummarySelect },
          status: true,
          updatedAt: true,
        },
        where: {
          deletedAt: null,
          OR: [
            { observation: observationWhere },
            { actionPlan: { observation: observationWhere } },
          ],
        },
      });
      return {
        columns: [
          "Observación",
          "Área",
          "Solicitante",
          "Fecha original",
          "Fecha solicitada",
          "Estado",
        ],
        rows: requests.map((request: any) => {
          const observation =
            request.observation ?? request.actionPlan?.observation;
          return {
            Área: request.observationArea?.area.name ?? "Varias áreas",
            Estado: request.status,
            "Fecha original": request.previousDueDate.toISOString(),
            "Fecha solicitada": request.proposedDueDate.toISOString(),
            Observación: observation
              ? `${observationDisplayCode(observation)} · ${observation.title}`
              : "—",
            Solicitante: request.requestedByUser.name,
          };
        }),
        total: requests.length,
      };
    }
    case "AREA_COMPLIANCE":
      return {
        columns: [
          "Área",
          "Total",
          "Abiertas",
          "En proceso",
          "Vencidas",
          "Cerradas",
          "Cumplimiento",
          "Tiempo promedio",
        ],
        rows: dashboard.areaSummary.map((area) => ({
          Área: area.area.name,
          Abiertas: area.open,
          Cerradas: area.closed,
          Cumplimiento: `${area.compliancePercent}%`,
          "En proceso": area.inProcess,
          "Tiempo promedio": `${area.averageResolutionDays} días`,
          Total: area.total,
          Vencidas: area.overdue,
        })),
        total: dashboard.areaSummary.length,
      };
    case "RESPONSIBLES": {
      const observations = await reportsPrisma.observation.findMany({
        select: observationReportSelect,
        where: observationWhere,
      });
      const groups = new Map<
        string,
        { open: number; overdue: number; total: number; name: string }
      >();
      observations.forEach((observation: any) => {
        const name =
          observation.areaAssignments[0]?.areaResponsible?.name ??
          "Sin asignar";
        const group = groups.get(name) ?? {
          name,
          open: 0,
          overdue: 0,
          total: 0,
        };
        group.total += 1;
        if (!isObservationClosed(observation.status)) group.open += 1;
        if (
          isObservationOverdue(observation.currentDueDate, observation.status)
        )
          group.overdue += 1;
        groups.set(name, group);
      });
      return {
        columns: ["Responsable", "Total", "Abiertas", "Vencidas"],
        rows: [...groups.values()]
          .sort((left, right) => right.total - left.total)
          .map((group) => ({
            Abiertas: group.open,
            Responsable: group.name,
            Total: group.total,
            Vencidas: group.overdue,
          })),
        total: groups.size,
      };
    }
    case "RISKS":
      return {
        columns: ["Riesgo", "Observaciones"],
        rows: dashboard.charts.riskDistribution.map((risk) => ({
          Riesgo: risk.label,
          Observaciones: risk.value,
        })),
        total: dashboard.charts.riskDistribution.length,
      };
    case "OBSERVATIONS":
    default: {
      const result = await getObservationRows(query, access, { limit: 5000 });
      return {
        columns: [
          "Código",
          "Observación",
          "Área",
          "Responsable",
          "Riesgo",
          "Estado",
          "Fecha",
          "Avance",
        ],
        rows: result.data.map(toObservationFlatRow),
        total: result.total,
      };
    }
  }
};

const getActivityLabel = (activityType: string, action: string): string => {
  const normalized = activityType.toUpperCase();
  const labels: Record<string, string> = {
    ACTION_PLAN_COMPLETED: "Plan de acción completado",
    ACTION_PLAN_CREATED: "Plan de acción registrado",
    EVIDENCE_DELETED: "Evidencia eliminada",
    EVIDENCE_UPLOADED: "Evidencia adjuntada",
    EXTENSION_AUDIT_APPROVED: "Ampliación aprobada por Auditoría",
    EXTENSION_AUDIT_REJECTED: "Ampliación rechazada por Auditoría",
    EXTENSION_CREATED: "Solicitud de ampliación creada",
    EXTENSION_MANAGER_APPROVED: "Ampliación aprobada por Gerencia",
    EXTENSION_MANAGER_REJECTED: "Ampliación rechazada por Gerencia",
    PLAN_APPROVED: "Plan de acción aprobado",
    PLAN_CREATED: "Plan de acción registrado",
    PLAN_RETURNED: "Plan devuelto para corrección",
    PROGRESS_APPROVED: "Avance aprobado",
    PROGRESS_CREATED: "Avance registrado",
    PROGRESS_REJECTED: "Avance rechazado",
    PROGRESS_RETURNED: "Corrección solicitada",
    PROGRESS_SENT: "Avance enviado a revisión",
    REVIEW_APPROVED: "Aprobación realizada",
    OBSERVATION_ASSIGNED: "Responsable asignado",
    OBSERVATION_CLOSED: "Observación cerrada",
    OBSERVATION_CREATED: "Observación creada",
    OBSERVATION_DUE_DATE_CHANGED: "Fecha límite actualizada",
    OBSERVATION_STATUS_CHANGED: "Estado actualizado",
  };
  return (
    labels[normalized] ?? labels[action.toUpperCase()] ?? "Actividad registrada"
  );
};

const getActivityResult = (activityType: string): string => {
  const normalized = activityType.toUpperCase();
  if (normalized.includes("APPROVED")) return "Aprobado";
  if (normalized.includes("REJECTED")) return "Rechazado";
  if (normalized.includes("RETURNED")) return "Corrección solicitada";
  if (normalized.includes("CLOSED") || normalized.includes("COMPLETED"))
    return "Completado";
  return "Registrado";
};

const getBusinessProcessLabel = (value: string): string => {
  const labels: Record<string, string> = {
    EXTENSION_REVIEW: "Revisión de ampliación",
    OBSERVATION_REVIEW: "Revisión de observación",
    PROGRESS_REVIEW: "Revisión de avance",
    REMEDIATION_PLAN_REVIEW: "Revisión de plan de acción",
  };
  return (
    labels[value] ??
    value
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/^\w/, (letter) => letter.toUpperCase())
  );
};

const getBusinessWorkflowResult = (value: string | null): string => {
  if (!value) return "Registrado";
  const normalized = value.toUpperCase();
  if (normalized.includes("APPROV")) return "Aprobado";
  if (normalized.includes("REJECT")) return "Rechazado";
  if (normalized.includes("RETURN") || normalized.includes("CORRECT")) {
    return "Corrección solicitada";
  }
  if (normalized.includes("COMPLETE")) return "Completado";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
};

const buildAuditObservationWhere = (
  query: AuditReportQuery,
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  const where = buildObservationScopeWhere(access);
  const conditions: Prisma.ObservationWhereInput[] = [where];
  if (query.observationId) conditions.push({ id: query.observationId });
  if (query.areaId)
    conditions.push({ areaAssignments: { some: { areaId: query.areaId } } });
  if (query.riskLevelId) conditions.push({ riskLevelId: query.riskLevelId });
  if (query.status) conditions.push({ status: { key: query.status } });
  return { AND: conditions };
};

const getAuditHistory = async (
  query: AuditReportQuery,
  access: AuthorizationSummary,
): Promise<AuditReportData> => {
  const observationWhere = buildAuditObservationWhere(query, access);
  const dateFilter = dateRange(query.dateFrom, query.dateTo);
  const activities = await reportsPrisma.entityActivity.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      action: true,
      activityType: true,
      actorUser: { select: userSummarySelect },
      createdAt: true,
      description: true,
      entityId: true,
      observation: {
        select: {
          area: { select: areaSummarySelect },
          code: true,
          title: true,
        },
      },
      title: true,
    },
    where: {
      ...(query.eventType ? { activityType: query.eventType } : {}),
      ...(query.userId ? { actorUserId: query.userId } : {}),
      ...(dateFilter ? { createdAt: dateFilter } : {}),
      observation: observationWhere,
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search } },
              { description: { contains: query.search } },
              { observation: { code: { contains: query.search } } },
            ],
          }
        : {}),
    },
  });
  const normalizedRows = activities.map((activity: any) => ({
    action: activity.action,
    actor: activity.actorUser?.name ?? "Sistema",
    area: activity.observation?.area.name ?? "—",
    date: activity.createdAt.toISOString(),
    description: activity.description ?? activity.title,
    event: getActivityLabel(activity.activityType, activity.action),
    observation: activity.observation?.code ?? "—",
    result: getActivityResult(activity.activityType),
  }));
  const filteredRows = normalizedRows.filter((row: any) => {
    if (
      query.result &&
      !row.result.toLowerCase().includes(query.result.toLowerCase())
    ) {
      return false;
    }
    if (query.template === "APPROVALS") {
      return ["Aprobado", "Rechazado", "Corrección solicitada"].includes(
        row.result,
      );
    }
    return true;
  });
  if (query.template === "ACTIVITY_AREA") {
    filteredRows.sort(
      (left: any, right: any) =>
        left.area.localeCompare(right.area, "es") ||
        left.date.localeCompare(right.date),
    );
  }
  if (query.template === "ACTIVITY_USER") {
    filteredRows.sort(
      (left: any, right: any) =>
        left.actor.localeCompare(right.actor, "es") ||
        left.date.localeCompare(right.date),
    );
  }
  const start = (query.page - 1) * query.perPage;
  const pageRows = filteredRows.slice(start, start + query.perPage);
  const timeline = query.observationId
    ? pageRows.map((row: any) => ({
        actor: row.actor,
        area: row.area,
        date: row.date,
        description: row.description,
        result: row.result,
        title: row.event,
      }))
    : undefined;

  return {
    columns: [
      "Fecha",
      "Observación",
      "Área",
      "Responsable",
      "Acción",
      "Resultado",
    ],
    generatedAt: new Date().toISOString(),
    rows: pageRows,
    summary: { total: filteredRows.length },
    template: query.template,
    timeline,
  };
};

const getAuditStructuredRows = async (
  query: AuditReportQuery,
  access: AuthorizationSummary,
): Promise<AuditReportData> => {
  const observationWhere = buildAuditObservationWhere(query, access);
  const dateFilter = dateRange(query.dateFrom, query.dateTo);
  const common = {
    ...(dateFilter ? { createdAt: dateFilter } : {}),
    observation: observationWhere,
  };

  if (query.template === "EVIDENCE") {
    const evidences = await reportsPrisma.evidenceFile.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        mimeType: true,
        originalName: true,
        observation: { select: observationIdentitySelect },
        context: true,
        uploadedByUser: { select: userSummarySelect },
      },
      where: { ...common, deletedAt: null },
    });
    return {
      columns: [
        "Observación",
        "Evidencia",
        "Tipo",
        "Cargado por",
        "Fecha",
        "Revisión",
      ],
      generatedAt: new Date().toISOString(),
      rows: evidences.map((evidence: any) => ({
        "Cargado por": evidence.uploadedByUser.name,
        Evidencia: evidence.originalName,
        Fecha: evidence.createdAt.toISOString(),
        Observación: `${observationDisplayCode(evidence.observation)} · ${evidence.observation.title}`,
        Revisión: "Pendiente de revisión documental",
        Tipo: `${evidence.context} · ${evidence.mimeType}`,
      })),
      summary: { total: evidences.length },
      template: query.template,
    };
  }

  if (query.template === "EXTENSIONS" || query.template === "DEADLINES") {
    const requests = await reportsPrisma.deadlineExtensionRequest.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        actionPlan: {
          select: {
            observation: {
              select: {
                ...observationIdentitySelect,
                riskLevel: { select: { name: true } },
              },
            },
            title: true,
          },
        },
        observation: {
          select: {
            ...observationIdentitySelect,
            riskLevel: { select: { name: true } },
          },
        },
        observationArea: { select: { area: { select: areaSummarySelect } } },
        previousDueDate: true,
        proposedDueDate: true,
        requestedByUser: { select: userSummarySelect },
        status: true,
      },
      where: {
        deletedAt: null,
        OR: [
          { observation: observationWhere },
          { actionPlan: { observation: observationWhere } },
        ],
      },
    });
    return {
      columns:
        query.template === "DEADLINES"
          ? [
              "Observación",
              "Área",
              "Responsable",
              "Riesgo",
              "Fecha original",
              "Fecha actual",
              "Días de ampliación",
              "Estado",
              "Días vencidos",
            ]
          : [
              "Observación",
              "Área",
              "Solicitante",
              "Fecha original",
              "Fecha solicitada",
              "Estado",
            ],
      generatedAt: new Date().toISOString(),
      rows: requests.map((request: any) => {
        const observation =
          request.observation ?? request.actionPlan?.observation;
        const extensionDays = Math.max(
          0,
          Math.round(
            (request.proposedDueDate.getTime() -
              request.previousDueDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        return query.template === "DEADLINES"
          ? {
              Área: request.observationArea?.area.name ?? "Varias áreas",
              "Días de ampliación": extensionDays,
              "Días vencidos":
                request.proposedDueDate.getTime() < Date.now()
                  ? Math.round(
                      (Date.now() - request.proposedDueDate.getTime()) /
                        (1000 * 60 * 60 * 24),
                    )
                  : 0,
              Estado: request.status,
              "Fecha actual": request.proposedDueDate.toISOString(),
              "Fecha original": request.previousDueDate.toISOString(),
              Observación: observation
                ? observationDisplayCode(observation)
                : "—",
              Responsable: request.requestedByUser.name,
              Riesgo: observation?.riskLevel.name ?? "—",
            }
          : {
              Área: request.observationArea?.area.name ?? "Varias áreas",
              Estado: request.status,
              "Fecha original": request.previousDueDate.toISOString(),
              "Fecha solicitada": request.proposedDueDate.toISOString(),
              Observación: observation
                ? observationDisplayCode(observation)
                : "—",
              Solicitante: request.requestedByUser.name,
            };
      }),
      summary: { total: requests.length },
      template: query.template,
    };
  }

  if (query.template === "INCUMPLIMIENTOS") {
    const overdueWhere = {
      AND: [observationWhere, buildObservationAttentionWhere("OVERDUE")],
    };
    const observations = await reportsPrisma.observation.findMany({
      orderBy: { currentDueDate: "asc" },
      select: {
        areaAssignments: {
          select: {
            area: { select: areaSummarySelect },
            areaResponsible: { select: userSummarySelect },
          },
          take: 1,
        },
        auditReport: { select: { reportNumber: true } },
        currentDueDate: true,
        id: true,
        observationNumber: true,
        riskLevel: { select: { name: true } },
        title: true,
      },
      where: overdueWhere,
    });
    return {
      columns: [
        "Observación",
        "Área",
        "Responsable",
        "Riesgo",
        "Fecha límite",
        "Días vencidos",
        "Estado",
      ],
      generatedAt: new Date().toISOString(),
      rows: observations.map((observation: any) => ({
        Área: observation.areaAssignments[0]?.area.name ?? "Sin área",
        "Días vencidos": Math.max(
          0,
          Math.round(
            (Date.now() - observation.currentDueDate.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        ),
        "Fecha límite": observation.currentDueDate.toISOString(),
        Estado: "Vencida",
        Observación: `${observationDisplayCode(observation)} · ${observation.title}`,
        Responsable:
          observation.areaAssignments[0]?.areaResponsible.name ?? "Sin asignar",
        Riesgo: observation.riskLevel.name,
      })),
      summary: { overdue: observations.length, total: observations.length },
      template: query.template,
    };
  }

  if (query.template === "WORKFLOW_HISTORY") {
    const shouldScopeEntities =
      !hasGlobalBusinessAccess(access) ||
      Boolean(
        query.observationId ||
        query.areaId ||
        query.riskLevelId ||
        query.status,
      );
    let entityIds: string[] | undefined;
    if (shouldScopeEntities) {
      const scopedObservations = await reportsPrisma.observation.findMany({
        select: {
          id: true,
          deadlineExtensionRequests: {
            select: { id: true },
            where: { deletedAt: null },
          },
          progressEvaluations: {
            select: { id: true },
            where: { deletedAt: null },
          },
          remediationPlans: {
            select: { id: true },
            where: { deletedAt: null },
          },
        },
        where: observationWhere,
      });
      entityIds = scopedObservations.flatMap((observation: any) => [
        observation.id,
        ...observation.deadlineExtensionRequests.map((item: any) => item.id),
        ...observation.progressEvaluations.map((item: any) => item.id),
        ...observation.remediationPlans.map((item: any) => item.id),
      ]);
    }
    const transitions = await reportsPrisma.workflowTransitionLog.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        decision: true,
        eventType: true,
        instance: {
          select: { entityId: true, entityType: true, processType: true },
        },
        performedBy: { select: userSummarySelect },
        sourceNode: { select: { name: true } },
        targetNode: { select: { name: true } },
      },
      where: {
        ...(query.dateFrom || query.dateTo ? { createdAt: dateFilter } : {}),
        ...(query.eventType ? { eventType: query.eventType } : {}),
        instance: {
          ...(query.observationId ? { entityId: query.observationId } : {}),
          ...(entityIds ? { entityId: { in: entityIds } } : {}),
          entityType: {
            in: [
              "OBSERVATION",
              "PROGRESS_EVALUATION",
              "REMEDIATION_PLAN",
              "DEADLINE_EXTENSION_REQUEST",
            ],
          },
        },
      },
    });
    return {
      columns: [
        "Fecha",
        "Proceso",
        "Etapa",
        "Responsable",
        "Acción",
        "Resultado",
        "Tiempo de atención",
      ],
      generatedAt: new Date().toISOString(),
      rows: transitions.map((transition: any) => ({
        Acción: transition.eventType ?? "Transición registrada",
        Etapa:
          transition.targetNode?.name ??
          transition.sourceNode?.name ??
          "Etapa registrada",
        Fecha: transition.createdAt.toISOString(),
        Proceso: getBusinessProcessLabel(transition.instance.processType),
        Responsable: transition.performedBy?.name ?? "Sistema",
        Resultado: getBusinessWorkflowResult(transition.decision),
        "Tiempo de atención": "—",
      })),
      summary: { total: transitions.length },
      template: query.template,
    };
  }

  return getAuditHistory({ ...query, template: "HISTORY" }, access);
};

export const reportsService = {
  buildObservationWhere,

  async getDashboard(filters: ReportFilters, access: AuthorizationSummary) {
    return getDashboard(filters, access);
  },

  async listObservations(query: ReportQuery, access: AuthorizationSummary) {
    return getObservationRows(query, access);
  },

  async getPreview(
    query: ReportPreviewQuery,
    access: AuthorizationSummary,
  ): Promise<ReportPreviewData> {
    const dashboard = await getDashboard(query, access);
    const report = await getReportRows(query, access, dashboard);
    return {
      columns: report.columns,
      filters: buildFilterLabelMap(query),
      generatedAt: new Date().toISOString(),
      reportName: query.reportName,
      reportType: query.type,
      rows: report.rows,
      summary: dashboard.summary,
      total: report.total,
    };
  },

  async getAuditReport(
    query: AuditReportQuery,
    access: AuthorizationSummary,
  ): Promise<AuditReportData> {
    if (
      query.template === "HISTORY" ||
      query.template === "ACTIVITY_AREA" ||
      query.template === "ACTIVITY_USER" ||
      query.template === "APPROVALS"
    ) {
      return getAuditHistory(query, access);
    }
    return getAuditStructuredRows(query, access);
  },

  async getAuditOptions(access: AuthorizationSummary) {
    const [areas, observations, users] = await Promise.all([
      reportsPrisma.area.findMany({
        orderBy: { name: "asc" },
        select: areaSummarySelect,
        where: { active: true, deletedAt: null },
      }),
      reportsPrisma.observation.findMany({
        orderBy: [
          { auditReport: { reportNumber: "asc" } },
          { observationNumber: "asc" },
        ],
        select: observationIdentitySelect,
        take: 500,
        where: buildObservationScopeWhere(access),
      }),
      reportsPrisma.user.findMany({
        orderBy: { name: "asc" },
        select: userSummarySelect,
        where: { deletedAt: null, isActive: true },
      }),
    ]);
    return {
      areas,
      eventTypes: [
        { key: "OBSERVATION_CREATED", label: "Observación creada" },
        { key: "OBSERVATION_STATUS_CHANGED", label: "Cambio de estado" },
        { key: "PLAN_CREATED", label: "Plan registrado" },
        { key: "PROGRESS_APPROVED", label: "Avance aprobado" },
        { key: "PROGRESS_RETURNED", label: "Corrección solicitada" },
        { key: "EVIDENCE_UPLOADED", label: "Evidencia adjuntada" },
        { key: "EXTENSION_AUDIT_APPROVED", label: "Ampliación aprobada" },
      ],
      observations: observations.map((observation: any) => ({
        code: observationDisplayCode(observation),
        id: observation.id,
        title: observation.title,
      })),
      users,
    };
  },
};
