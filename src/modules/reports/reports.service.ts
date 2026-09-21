/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Prisma } from "../../../generated/prisma/client.js";

import {
  buildActionPlanScopeWhere,
  buildEvidenceScopeWhere,
  buildExtensionRequestScopeWhere,
  buildObservationAreaScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { prisma } from "../../utils/prisma.js";
import {
  buildObservationAttentionWhere,
  observationCompletenessService,
  type ObservationActionObservation,
} from "../observations/observation-completeness.service.js";
import {
  buildObservationScopeWhere,
  getActionPlanDeadlineStatus,
  getBusinessDateKey,
  getDateOnlyKey,
  getEffectiveActionPlanDueDate,
  getOfficialActionPlanProgress,
  reportDeadlineStatusOptions,
  isApprovedDeadlineExtension,
  OFFICIAL_ACTION_PLAN_STATUSES,
  getDaysBetween,
  getObservationStatusGroup,
  getRiskGroupLabel,
  hasGlobalBusinessAccess,
  isObservationClosed,
  isObservationDueSoon,
  isObservationOverdue,
  REPORT_DEFAULT_DUE_SOON_DAYS,
} from "./reporting-definitions.js";
import { AppError } from "../../utils/app-error.js";
import type {
  AuditReportData,
  ReportAreaSummary,
  ReportActionPlanRow,
  ReportChartItem,
  ReportDashboardData,
  ReportFilterCapabilities,
  ReportOptions,
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
  setting: any;
  user: any;
  workflowInstance: any;
  workflowTransitionLog: any;
};

export const getReportFilterCapabilities = (
  access: AuthorizationSummary,
): ReportFilterCapabilities => {
  const global =
    access.isAdmin ||
    access.dataScope === "AUDIT_SCOPE" ||
    access.roleCode === "AUDIT_CHIEF";
  return {
    area: global,
    areaResponsible: global || access.roleCode === "PROCESS_OWNER",
    auditReport: global,
    executor:
      global ||
      access.roleCode === "PROCESS_OWNER" ||
      access.roleCode === "AREA_RESPONSIBLE",
    processOwner: global,
  };
};

export const assertReportFilterAccess = (
  filters: ReportFilters,
  access: AuthorizationSummary,
): void => {
  const capabilities = getReportFilterCapabilities(access);
  const requested: Array<[boolean, boolean, string]> = [
    [Boolean(filters.areaId), capabilities.area, "Área"],
    [
      Boolean(filters.areaResponsibleId?.length),
      capabilities.areaResponsible,
      "Responsable de área",
    ],
    [
      Boolean(filters.auditReportId?.length),
      capabilities.auditReport,
      "Informe",
    ],
    [Boolean(filters.executorId?.length), capabilities.executor, "Ejecutor"],
    [
      Boolean(filters.processOwnerId?.length),
      capabilities.processOwner,
      "Dueño del proceso",
    ],
  ];

  if (
    requested.some(([isRequested, isAllowed]) => isRequested && !isAllowed) ||
    (filters.responsibleUserId &&
      !capabilities.executor &&
      filters.responsibleUserId !== access.userId)
  ) {
    throw new AppError(
      "Uno de los filtros no está disponible para su alcance.",
      403,
    );
  }
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

const buildObservationReportSelect = (access: AuthorizationSummary) => ({
  ...observationReportSelect,
  areaAssignments: {
    ...observationReportSelect.areaAssignments,
    where: buildObservationAreaScopeWhere(access),
  },
});

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
    conditions.push(
      filters.periodField === "reportDate"
        ? { auditReport: { reportDate: periodFilter } }
        : {
            [filters.periodField ?? "createdAt"]: periodFilter,
          },
    );
  }
  if (filters.areaId)
    conditions.push({ areaAssignments: { some: { areaId: filters.areaId } } });
  if (filters.auditReportId?.length)
    conditions.push({ auditReportId: { in: filters.auditReportId } });
  if (filters.activeOnly) conditions.push({ status: { isFinal: false } });
  if (filters.riskLevelId)
    conditions.push({ riskLevelId: filters.riskLevelId });
  if (filters.observationStatusIds?.length)
    conditions.push({ statusId: { in: filters.observationStatusIds } });
  else if (filters.statusId) conditions.push({ statusId: filters.statusId });
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
  if (filters.processOwnerId?.length)
    conditions.push({
      areaAssignments: {
        some: { processOwnerUserId: { in: filters.processOwnerId } },
      },
    });
  if (filters.executorId?.length)
    conditions.push({
      actionPlans: {
        some: { responsibleUserId: { in: filters.executorId } },
      },
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

const getReportingTimeZone = async (): Promise<string> => {
  const fallback = "America/La_Paz";
  try {
    const setting = await reportsPrisma.setting.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { timezone: true },
      where: { deletedAt: null },
    });
    const candidate = setting?.timezone?.trim() || fallback;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
      return candidate;
    } catch {
      return fallback;
    }
  } catch {
    return fallback;
  }
};

const approvedExtensionWhere = {
  deletedAt: null,
  status: "MANAGER_APPROVED" as const,
};

const effectiveDueDateWhere = (
  range: Prisma.DateTimeFilter,
): Prisma.ActionPlanWhereInput => ({
  OR: [
    {
      currentDueDate: range,
      deadlineExtensionRequests: { none: approvedExtensionWhere },
    },
    {
      deadlineExtensionRequests: {
        some: { ...approvedExtensionWhere, proposedDueDate: range },
      },
    },
  ],
});

const actionPlanReportSelect = {
  completedAt: true,
  createdAt: true,
  currentDueDate: true,
  deadlineExtensionRequests: {
    orderBy: { updatedAt: "desc" },
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
      auditReport: {
        select: { id: true, reportNumber: true, reportDate: true, title: true },
      },
      id: true,
      observationNumber: true,
      currentDueDate: true,
      riskLevel: {
        select: {
          colorToken: true,
          id: true,
          key: true,
          name: true,
        },
      },
      status: { select: { isFinal: true, key: true, name: true } },
      title: true,
    },
  },
  observationArea: {
    select: {
      area: { select: areaSummarySelect },
      areaResponsible: { select: userSummarySelect },
      processOwner: { select: userSummarySelect },
    },
  },
  progressEvaluations: {
    orderBy: { submittedAt: "desc" },
    select: { reportedProgressPercent: true },
    take: 1,
    where: { deletedAt: null },
  },
  progressPercent: true,
  responsibleUser: { select: userSummarySelect },
  status: true,
  title: true,
  updatedAt: true,
} as const;

const toDateAtUtc = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const getDateAtBusinessTimeZone = (value: string, timeZone: string): Date => {
  const utcDate = toDateAtUtc(value);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    }).formatToParts(utcDate);
    const values = Object.fromEntries(
      parts
        .filter(({ type }) => type !== "literal")
        .map(({ type, value: partValue }) => [type, partValue]),
    );
    const localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return new Date(utcDate.getTime() - (localAsUtc - utcDate.getTime()));
  } catch {
    return utcDate;
  }
};

const getNextDateKey = (value: string): string => {
  const date = toDateAtUtc(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return getDateOnlyKey(date);
};

const getCutoffAsOfDate = (cutoffDate: string, timeZone: string): Date =>
  new Date(
    getDateAtBusinessTimeZone(cutoffDate, timeZone).getTime() +
      12 * 60 * 60 * 1000,
  );

const actionPlanDateFilter = (
  periodField: ReportFilters["periodField"],
  dateFrom?: string,
  dateTo?: string,
): Record<string, unknown> | undefined => {
  const period = dateRange(dateFrom, dateTo);
  if (!period) return undefined;
  if (periodField === "reportDate") {
    return { observation: { auditReport: { reportDate: period } } };
  }
  return { [periodField ?? "createdAt"]: period };
};

export const buildActionPlanWhere = (
  filters: ReportFilters,
  access: AuthorizationSummary,
  now = new Date(),
  timeZone = "UTC",
): Prisma.ActionPlanWhereInput => {
  const cutoffDateKey = filters.cutoffDate ?? getBusinessDateKey(now, timeZone);
  const cutoffDate = toDateAtUtc(cutoffDateKey);
  const cutoffEnd = getDateAtBusinessTimeZone(
    getNextDateKey(cutoffDateKey),
    timeZone,
  );
  const conditions: Prisma.ActionPlanWhereInput[] = [
    buildActionPlanScopeWhere(access),
    { observation: { deletedAt: null } },
    { createdAt: { lt: cutoffEnd } },
    { observation: { createdAt: { lt: cutoffEnd } } },
  ];
  const period =
    filters.periodField === "currentDueDate"
      ? undefined
      : actionPlanDateFilter(
          filters.periodField,
          filters.dateFrom,
          filters.dateTo,
        );

  if (period) conditions.push(period as Prisma.ActionPlanWhereInput);
  const effectivePeriod =
    filters.periodField === "currentDueDate"
      ? dateRange(filters.dateFrom, filters.dateTo)
      : undefined;
  if (effectivePeriod) conditions.push(effectiveDueDateWhere(effectivePeriod));
  if (filters.auditReportId?.length)
    conditions.push({
      observation: { auditReportId: { in: filters.auditReportId } },
    });
  if (filters.areaId)
    conditions.push({ observationArea: { areaId: filters.areaId } });
  if (filters.areaResponsibleId?.length)
    conditions.push({
      observationArea: {
        areaResponsibleUserId: { in: filters.areaResponsibleId },
      },
    });
  if (filters.processOwnerId?.length)
    conditions.push({
      observationArea: {
        processOwnerUserId: { in: filters.processOwnerId },
      },
    });
  if (filters.executorId?.length || filters.responsibleUserId) {
    const executorIds = filters.executorId?.length
      ? filters.executorId
      : filters.responsibleUserId
        ? [filters.responsibleUserId]
        : [];
    if (executorIds.length)
      conditions.push({ responsibleUserId: { in: executorIds } });
  }
  if (filters.riskLevelId)
    conditions.push({ observation: { riskLevelId: filters.riskLevelId } });
  if (filters.observationStatusIds?.length)
    conditions.push({
      observation: { statusId: { in: filters.observationStatusIds } },
    });
  else if (filters.statusId)
    conditions.push({ observation: { statusId: filters.statusId } });
  if (filters.progressStatus)
    conditions.push({ status: filters.progressStatus });
  if (filters.activeOnly)
    conditions.push({ observation: { status: { isFinal: false } } });
  if (filters.progressMin !== undefined)
    conditions.push({ progressPercent: { gte: filters.progressMin } });
  if (filters.progressMax !== undefined)
    conditions.push({ progressPercent: { lte: filters.progressMax } });
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
  if (filters.reprogrammed !== undefined) {
    conditions.push(
      filters.reprogrammed
        ? { deadlineExtensionRequests: { some: approvedExtensionWhere } }
        : {
            deadlineExtensionRequests: {
              none: approvedExtensionWhere,
            },
          },
    );
  }
  if (filters.search) {
    conditions.push({
      OR: [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
        { observation: { title: { contains: filters.search } } },
        {
          observation: {
            auditReport: { reportNumber: { contains: filters.search } },
          },
        },
        { observationArea: { area: { name: { contains: filters.search } } } },
        {
          observationArea: {
            processOwner: { name: { contains: filters.search } },
          },
        },
        {
          observationArea: {
            areaResponsible: { name: { contains: filters.search } },
          },
        },
        { responsibleUser: { name: { contains: filters.search } } },
      ],
    });
  }

  const deadlineStatuses = filters.deadlineStatuses?.length
    ? new Set(filters.deadlineStatuses)
    : filters.deadlineStatus
      ? new Set([filters.deadlineStatus])
      : filters.overdue === true
        ? new Set(["VENCIDO"])
        : filters.overdue === false
          ? new Set(["VIGENTE"])
          : undefined;
  if (deadlineStatuses?.has("VENCIDO") && !deadlineStatuses.has("VIGENTE")) {
    conditions.push({
      AND: [
        { status: { not: "CONCLUDED" } },
        effectiveDueDateWhere({ lt: cutoffDate }),
      ],
    });
  } else if (
    deadlineStatuses?.has("VIGENTE") &&
    !deadlineStatuses.has("VENCIDO")
  ) {
    conditions.push({
      OR: [
        { status: "CONCLUDED" },
        {
          AND: [
            { status: { not: "CONCLUDED" } },
            effectiveDueDateWhere({ gte: cutoffDate }),
          ],
        },
      ],
    });
  }
  if (filters.dueSoon) {
    const end = new Date(cutoffDate);
    end.setUTCDate(end.getUTCDate() + (filters.dueSoonDays ?? 7));
    conditions.push({
      AND: [
        { status: { not: "CONCLUDED" } },
        effectiveDueDateWhere({ gte: cutoffDate, lte: end }),
      ],
    });
  }
  if (filters.hasPlan === false) conditions.push({ id: "__no_action_plan__" });

  return { AND: conditions };
};

const mapActionPlanRow = (
  record: any,
  asOf: Date,
  timeZone: string,
): ReportActionPlanRow => {
  const officialProgress = getOfficialActionPlanProgress(record.status);
  const effectiveDueDate = getEffectiveActionPlanDueDate(record);
  const approvedExtension = record.deadlineExtensionRequests?.find(
    isApprovedDeadlineExtension,
  );
  const observation = record.observation;
  const observationCode = observationDisplayCode(observation);
  return {
    actionPlanId: record.id,
    area: record.observationArea.area,
    areaResponsible: record.observationArea.areaResponsible,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    deadlineStatus: getActionPlanDeadlineStatus(record, asOf, timeZone),
    description: record.description,
    effectiveDueDate: effectiveDueDate.toISOString(),
    executor: record.responsibleUser,
    href: `/planes-accion/${record.id}`,
    auditReportId: observation.auditReport.id,
    observation: {
      code: observationCode,
      id: observation.id,
      status: observation.status,
      title: observation.title,
    },
    observationDueDate: observation.currentDueDate.toISOString(),
    observationId: observation.id,
    officialProgress,
    originalDueDate: record.originalDueDate.toISOString(),
    processOwner: record.observationArea.processOwner,
    progressPercent: officialProgress.percent,
    reportedProgressPercent:
      record.progressEvaluations?.[0]?.reportedProgressPercent ?? null,
    reprogrammed: Boolean(approvedExtension),
    riskLevel: observation.riskLevel,
    title: record.title || record.description,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const loadActionPlanRows = async (
  filters: ReportFilters,
  access: AuthorizationSummary,
): Promise<{
  cutoffDate: string;
  dueSoonDays: number;
  rows: ReportActionPlanRow[];
  timeZone: string;
}> => {
  const dueSoonDays = filters.dueSoonDays ?? (await getConfiguredDueSoonDays());
  const now = new Date();
  const timeZone = await getReportingTimeZone();
  const cutoffDate = filters.cutoffDate ?? getBusinessDateKey(now, timeZone);
  const where = buildActionPlanWhere(
    { ...filters, dueSoonDays },
    access,
    now,
    timeZone,
  );
  // ponytail: one scoped read feeds KPIs/charts/rows; use DB groupBy only when measured scale requires it.
  const records = await reportsPrisma.actionPlan.findMany({
    orderBy: [{ currentDueDate: "asc" }, { updatedAt: "desc" }],
    select: actionPlanReportSelect,
    where,
  });
  return {
    cutoffDate,
    dueSoonDays,
    rows: records.map((record: any) =>
      mapActionPlanRow(
        record,
        getCutoffAsOfDate(cutoffDate, timeZone),
        timeZone,
      ),
    ),
    timeZone,
  };
};

const distributionFromRows = (
  rows: ReportActionPlanRow[],
  getKey: (row: ReportActionPlanRow) => string,
  getLabel: (row: ReportActionPlanRow) => string,
  getHref?: (row: ReportActionPlanRow) => string | undefined,
): ReportChartItem[] => {
  const values = new Map<string, ReportChartItem>();
  rows.forEach((row) => {
    const key = getKey(row);
    const href = getHref?.(row);
    const current =
      values.get(key) ??
      ({
        key,
        label: getLabel(row),
        value: 0,
        ...(href ? { href } : {}),
      } satisfies ReportChartItem);
    current.value += 1;
    values.set(key, current);
  });
  return [...values.values()].sort(
    (left, right) =>
      right.value - left.value || left.label.localeCompare(right.label, "es"),
  );
};

export const buildPlanDistributions = (rows: ReportActionPlanRow[]) => ({
  area: distributionFromRows(
    rows,
    (row) => row.area.id,
    (row) => row.area.name,
    (row) => `/reportes?filter.areaId=${encodeURIComponent(row.area.id)}`,
  ),
  areaResponsible: distributionFromRows(
    rows,
    (row) => row.areaResponsible?.id ?? "unassigned",
    (row) => row.areaResponsible?.name ?? "Sin asignar",
    (row) =>
      row.areaResponsible
        ? `/reportes?filter.areaResponsibleId=${encodeURIComponent(row.areaResponsible.id)}`
        : undefined,
  ),
  executor: distributionFromRows(
    rows,
    (row) => row.executor?.id ?? "unassigned",
    (row) => row.executor?.name ?? "Sin asignar",
    (row) =>
      row.executor
        ? `/reportes?filter.executorId=${encodeURIComponent(row.executor.id)}`
        : undefined,
  ),
  processOwner: distributionFromRows(
    rows,
    (row) => row.processOwner?.id ?? "unassigned",
    (row) => row.processOwner?.name ?? "Sin asignar",
    (row) =>
      row.processOwner
        ? `/reportes?filter.processOwnerId=${encodeURIComponent(row.processOwner.id)}`
        : undefined,
  ),
});

const isCriticalRisk = (row: ReportActionPlanRow): boolean => {
  const value = `${row.riskLevel.key} ${row.riskLevel.name}`.toUpperCase();
  return (
    value.includes("CRIT") || value.includes("ALTO") || value.includes("HIGH")
  );
};

const buildOperationalRows = (
  rows: ReportActionPlanRow[],
  cutoffDateKey: string,
  dueSoonDays: number,
) => {
  const cutoffDate = toDateAtUtc(cutoffDateKey);
  const criticalOrOverdue = new Map<
    string,
    ReportDashboardData["operational"]["criticalOrOverdueObservations"][number]
  >();

  rows.forEach((row) => {
    const observationOverdue = isObservationOverdue(
      new Date(row.observationDueDate),
      row.observation.status,
      cutoffDate,
    );
    if (
      !isCriticalRisk(row) &&
      !observationOverdue &&
      row.deadlineStatus !== "VENCIDO"
    ) {
      return;
    }
    criticalOrOverdue.set(row.observationId, {
      area: row.area,
      deadlineStatus: observationOverdue ? "VENCIDO" : "VIGENTE",
      dueDate: row.observationDueDate,
      href: `/observaciones/${encodeURIComponent(row.observationId)}`,
      id: row.observationId,
      progressPercent: row.progressPercent,
      riskLevel: {
        colorToken: row.riskLevel.colorToken,
        name: row.riskLevel.name,
      },
      observationStatus: {
        key: row.observation.status.key,
        name: row.observation.status.name,
      },
      title: `${row.observation.code} · ${row.observation.title}`,
    });
  });

  const upcomingActionPlans = rows
    .filter((row) => {
      if (
        row.officialProgress.key === "CONCLUDED" ||
        row.deadlineStatus === "VENCIDO"
      ) {
        return false;
      }
      const diff = getDaysBetween(
        cutoffDate,
        toDateAtUtc(getDateOnlyKey(new Date(row.effectiveDueDate))),
      );
      return diff >= 0 && diff <= dueSoonDays;
    })
    .slice(0, 8)
    .map((row) => ({
      actionPlanId: row.actionPlanId,
      deadlineStatus: row.deadlineStatus,
      effectiveDueDate: row.effectiveDueDate,
      executorName: row.executor?.name ?? "Sin asignar",
      href: row.href,
      observationCode: row.observation.code,
      observationStatus: row.observation.status.name,
      progress: {
        code: row.officialProgress.code,
        label: row.officialProgress.label,
        percent: row.officialProgress.percent,
      },
      title: row.title,
    }));

  return {
    criticalOrOverdueObservations: [...criticalOrOverdue.values()].sort(
      (left, right) => left.dueDate.localeCompare(right.dueDate),
    ),
    upcomingActionPlans,
  };
};

const getActionPlanDashboard = async (
  filters: ReportFilters,
  access: AuthorizationSummary,
): Promise<ReportDashboardData> => {
  assertReportFilterAccess(filters, access);
  const loaded = await loadActionPlanRows(filters, access);
  const { rows } = loaded;
  const noIniciado = rows.filter(
    (row) => row.officialProgress.key === "NOT_STARTED",
  ).length;
  const iniciado = rows.filter(
    (row) => row.officialProgress.key === "STARTED",
  ).length;
  const conAvance = rows.filter(
    (row) => row.officialProgress.key === "WITH_PROGRESS",
  ).length;
  const concluido = rows.filter(
    (row) => row.officialProgress.key === "CONCLUDED",
  ).length;
  const vencidos = rows.filter(
    (row) => row.deadlineStatus === "VENCIDO",
  ).length;
  const vigentes = rows.length - vencidos;
  const reprogramados = rows.filter((row) => row.reprogrammed).length;
  const observations = new Map<
    string,
    { isFinal: boolean; key: string; name: string }
  >();
  rows.forEach((row) =>
    observations.set(row.observation.id, row.observation.status),
  );
  const totalObservations = observations.size;
  const closedObservations = [...observations.values()].filter(
    (status) => status.isFinal,
  ).length;
  const pendingObservations = totalObservations - closedObservations;
  const observationStatusDistribution = [...observations.values()]
    .reduce((groups, status) => {
      const current = groups.get(status.key) ?? {
        key: status.key,
        label: status.name,
        value: 0,
      };
      current.value += 1;
      groups.set(status.key, current);
      return groups;
    }, new Map<string, ReportChartItem>())
    .values();
  const statusDistribution = [...observationStatusDistribution].sort(
    (left, right) =>
      right.value - left.value || left.label.localeCompare(right.label, "es"),
  );
  const dueSoon = rows.filter((row) => {
    if (
      row.officialProgress.key === "CONCLUDED" ||
      row.deadlineStatus === "VENCIDO"
    )
      return false;
    const diff = getDaysBetween(
      toDateAtUtc(loaded.cutoffDate),
      toDateAtUtc(getDateOnlyKey(new Date(row.effectiveDueDate))),
    );
    return diff >= 0 && diff <= loaded.dueSoonDays;
  }).length;
  const resolutionDays = rows.flatMap((row) =>
    row.completedAt
      ? [getDaysBetween(new Date(row.createdAt), new Date(row.completedAt))]
      : [],
  );
  const compliantClosures = rows.filter(
    (row) =>
      row.completedAt &&
      getDateOnlyKey(new Date(row.completedAt)) <=
        getDateOnlyKey(new Date(row.effectiveDueDate)),
  ).length;
  const compliancePercent = concluido
    ? Math.round((compliantClosures / concluido) * 100)
    : 0;
  const riskDistribution = distributionFromRows(
    rows,
    (row) => row.riskLevel.key,
    (row) => row.riskLevel.name,
    (row) =>
      `/reportes?filter.riskLevelId=${encodeURIComponent(row.riskLevel.id)}`,
  );
  const progressDistribution = OFFICIAL_ACTION_PLAN_STATUSES.map((key) => {
    const meta = getOfficialActionPlanProgress(key);
    return {
      key,
      label: meta.label,
      value: rows.filter((row) => row.officialProgress.key === key).length,
    };
  });
  const deadlineDistribution = reportDeadlineStatusOptions.map(
    ({ key, label }) => ({
      key,
      label,
      value: key === "VENCIDO" ? vencidos : vigentes,
    }),
  );
  const reprogrammedDistribution = [
    { key: "SI", label: "Sí", value: reprogramados },
    { key: "NO", label: "No", value: rows.length - reprogramados },
  ];
  const planDistributions = buildPlanDistributions(rows);
  const areaMap = new Map<string, ReportAreaSummary>();
  rows.forEach((row) => {
    const current = areaMap.get(row.area.id) ?? {
      area: row.area,
      averageResolutionDays: 0,
      closed: 0,
      compliancePercent: 0,
      dueSoon: 0,
      href: `/reportes?filter.areaId=${encodeURIComponent(row.area.id)}`,
      inProcess: 0,
      open: 0,
      overdue: 0,
      total: 0,
    };
    current.total += 1;
    if (row.officialProgress.key === "CONCLUDED") current.closed += 1;
    else current.open += 1;
    if (["STARTED", "WITH_PROGRESS"].includes(row.officialProgress.key))
      current.inProcess += 1;
    if (row.deadlineStatus === "VENCIDO") current.overdue += 1;
    areaMap.set(row.area.id, current);
  });
  const areaSummary = [...areaMap.values()];
  const monthRows = rows.reduce((map, row) => {
    const key = getMonthKey(new Date(row.createdAt));
    const current = map.get(key) ?? { closed: 0, created: 0 };
    current.created += 1;
    if (row.completedAt) current.closed += 1;
    map.set(key, current);
    return map;
  }, new Map<string, { closed: number; created: number }>());
  const months = getMonthRange(
    filters.dateFrom,
    filters.dateTo,
    loaded.cutoffDate,
  );
  const trend = months.map((month) => {
    const monthKey = getMonthKey(month);
    const value = monthRows.get(monthKey) ?? { closed: 0, created: 0 };
    return { ...value, label: getMonthLabel(month), monthKey };
  });
  const topResponsibleWorkload = distributionFromRows(
    rows.filter(
      (row) => row.officialProgress.key !== "CONCLUDED" && row.areaResponsible,
    ),
    (row) => row.areaResponsible!.id,
    (row) => row.areaResponsible!.name,
  ).slice(0, 6);
  const topOverdueAreas = distributionFromRows(
    rows.filter((row) => row.deadlineStatus === "VENCIDO"),
    (row) => row.area.id,
    (row) => row.area.name,
  ).slice(0, 6);
  const predominantRisk = riskDistribution[0]
    ? {
        count: riskDistribution[0].value,
        key: riskDistribution[0].key,
        label: riskDistribution[0].label,
      }
    : null;
  const insights = rows.length
    ? vencidos
      ? [
          `${vencidos} plan${vencidos === 1 ? "" : "es"} de acción requiere${vencidos === 1 ? "" : "n"} atención por vencimiento.`,
        ]
      : [
          "No se identificaron planes de acción vencidos con los filtros seleccionados.",
        ]
    : [];
  return {
    areaSummary,
    charts: {
      areaDistribution: planDistributions.area,
      areaResponsibleDistribution: planDistributions.areaResponsible,
      areaPerformance: areaSummary.map((area) => ({
        compliancePercent: area.compliancePercent,
        href: area.href,
        key: area.area.id,
        label: area.area.name,
        value: area.total,
      })),
      currentVsOverdue: deadlineDistribution,
      deadlineDistribution,
      executorDistribution: planDistributions.executor,
      processOwnerDistribution: planDistributions.processOwner,
      progressDistribution,
      reprogrammedDistribution,
      riskDistribution,
      statusDistribution,
      topOverdueAreas,
      topResponsibleWorkload,
      trend,
    },
    cutoffDate: loaded.cutoffDate,
    dueSoonDays: loaded.dueSoonDays,
    generatedAt: new Date().toISOString(),
    insights,
    operational: buildOperationalRows(
      rows,
      loaded.cutoffDate,
      loaded.dueSoonDays,
    ),
    rows,
    summary: {
      averageResolutionDays: resolutionDays.length
        ? Math.round(
            resolutionDays.reduce((sum, value) => sum + value, 0) /
              resolutionDays.length,
          )
        : 0,
      conAvance,
      concluido,
      closed: concluido,
      compliancePercent,
      dueSoon,
      iniciado,
      inProcess: iniciado + conAvance,
      noIniciado,
      open: rows.length - concluido,
      overdue: vencidos,
      predominantRisk,
      reprogramados,
      total: rows.length,
      totalObservations,
      pendingObservations,
      closedObservations,
      vencidos,
      vigentes,
    },
  };
};

const EMPTY_REPORT_FILTERS: ReportFilters = {
  dueSoonDays: REPORT_DEFAULT_DUE_SOON_DAYS,
  periodField: "createdAt",
  search: "",
};

const getActionPlanRows = async (
  query: ReportQuery,
  access: AuthorizationSummary,
): Promise<{ data: ReportActionPlanRow[]; total: number }> => {
  assertReportFilterAccess(query, access);
  const dueSoonDays = query.dueSoonDays ?? (await getConfiguredDueSoonDays());
  const now = new Date();
  const timeZone = await getReportingTimeZone();
  const cutoffDate = query.cutoffDate ?? getBusinessDateKey(now, timeZone);
  const where = buildActionPlanWhere(
    { ...query, dueSoonDays },
    access,
    now,
    timeZone,
  );
  const [total, records] = await reportsPrisma.$transaction([
    reportsPrisma.actionPlan.count({ where }),
    reportsPrisma.actionPlan.findMany({
      orderBy: [{ currentDueDate: "asc" }, { updatedAt: "desc" }],
      select: actionPlanReportSelect,
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
      where,
    }),
  ]);
  return {
    data: records.map((record: any) =>
      mapActionPlanRow(
        record,
        getCutoffAsOfDate(cutoffDate, timeZone),
        timeZone,
      ),
    ),
    total,
  };
};

const toActionPlanFlatRow = (
  row: ReportActionPlanRow,
): Record<string, unknown> => ({
  Área: row.area.name,
  "Avance oficial": `${row.officialProgress.percent}%`,
  "Avance reportado":
    row.reportedProgressPercent === null
      ? "—"
      : `${row.reportedProgressPercent}%`,
  "Dueño del proceso": row.processOwner?.name ?? "Sin asignar",
  Ejecutor: row.executor?.name ?? "Sin asignar",
  "Estado del plan de acción": row.officialProgress.label,
  "Estado según plazo":
    row.deadlineStatus === "VENCIDO" ? "Vencido" : "Vigente",
  "Fecha actual": row.effectiveDueDate,
  "Fecha original": row.originalDueDate,
  Informe: row.observation.code.split(" / ")[0],
  "Nivel de riesgo": row.riskLevel.name,
  "Estado de observación": row.observation.status.name,
  Observación: `${row.observation.code} · ${row.observation.title}`,
  Plan: row.title,
  Reprogramado: row.reprogrammed ? "Sí" : "No",
});

const getActionPlanReportRows = (
  query: ReportPreviewQuery,
  dashboard: ReportDashboardData,
): {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
} => {
  const rows = dashboard.rows.map(toActionPlanFlatRow);
  const columns = [
    "Informe",
    "Observación",
    "Plan",
    "Área",
    "Nivel de riesgo",
    "Dueño del proceso",
    "Ejecutor",
    "Estado de observación",
    "Estado del plan de acción",
    "Avance oficial",
    "Avance reportado",
    "Fecha original",
    "Fecha actual",
    "Estado según plazo",
    "Reprogramado",
  ];
  if (query.type === "AREA_COMPLIANCE") {
    return {
      columns: [
        "Área",
        "Total de planes",
        "No iniciados",
        "Iniciados",
        "Con avance",
        "Concluidos",
        "Vencidos",
      ],
      rows: dashboard.areaSummary.map((area) => {
        const areaRows = dashboard.rows.filter(
          (row) => row.area.id === area.area.id,
        );
        return {
          Área: area.area.name,
          "Con avance": areaRows.filter(
            (row) => row.officialProgress.key === "WITH_PROGRESS",
          ).length,
          Concluidos: areaRows.filter(
            (row) => row.officialProgress.key === "CONCLUDED",
          ).length,
          Iniciados: areaRows.filter(
            (row) => row.officialProgress.key === "STARTED",
          ).length,
          "No iniciados": areaRows.filter(
            (row) => row.officialProgress.key === "NOT_STARTED",
          ).length,
          "Total de planes": areaRows.length,
          Vencidos: areaRows.filter((row) => row.deadlineStatus === "VENCIDO")
            .length,
        };
      }),
      total: dashboard.areaSummary.length,
    };
  }
  if (query.type === "RESPONSIBLES") {
    const groups = distributionFromRows(
      dashboard.rows,
      (row) => row.executor?.id ?? "unassigned",
      (row) => row.executor?.name ?? "Sin asignar",
    );
    return {
      columns: [
        "Ejecutor",
        "Total de planes",
        "Vigentes",
        "Vencidos",
        "Reprogramados",
      ],
      rows: groups.map((group) => ({
        Ejecutor: group.label,
        Reprogramados: dashboard.rows.filter(
          (row) =>
            (row.executor?.name ?? "Sin asignar") === group.label &&
            row.reprogrammed,
        ).length,
        "Total de planes": group.value,
        Vencidos: dashboard.rows.filter(
          (row) =>
            (row.executor?.name ?? "Sin asignar") === group.label &&
            row.deadlineStatus === "VENCIDO",
        ).length,
        Vigentes: dashboard.rows.filter(
          (row) =>
            (row.executor?.name ?? "Sin asignar") === group.label &&
            row.deadlineStatus === "VIGENTE",
        ).length,
      })),
      total: groups.length,
    };
  }
  if (query.type === "RISKS") {
    const groups = distributionFromRows(
      dashboard.rows,
      (row) => row.riskLevel.key,
      (row) => row.riskLevel.name,
    );
    return {
      columns: [
        "Nivel de riesgo",
        "Total de planes",
        "Vigentes",
        "Vencidos",
        "Reprogramados",
      ],
      rows: groups.map((group) => ({
        "Nivel de riesgo": group.label,
        Reprogramados: dashboard.rows.filter(
          (row) => row.riskLevel.name === group.label && row.reprogrammed,
        ).length,
        "Total de planes": group.value,
        Vencidos: dashboard.rows.filter(
          (row) =>
            row.riskLevel.name === group.label &&
            row.deadlineStatus === "VENCIDO",
        ).length,
        Vigentes: dashboard.rows.filter(
          (row) =>
            row.riskLevel.name === group.label &&
            row.deadlineStatus === "VIGENTE",
        ).length,
      })),
      total: groups.length,
    };
  }
  return { columns, rows, total: rows.length };
};

const getReportOptions = async (
  access: AuthorizationSummary,
): Promise<ReportOptions> => {
  const [{ cutoffDate, rows }, riskLevels, observationStatuses] =
    await Promise.all([
      loadActionPlanRows(EMPTY_REPORT_FILTERS, access),
      reportsPrisma.riskLevel.findMany({
        orderBy: [{ severityOrder: "asc" }, { name: "asc" }],
        select: {
          colorToken: true,
          id: true,
          key: true,
          name: true,
        },
        where: { active: true, deletedAt: null },
      }),
      reportsPrisma.observationStatus.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, isFinal: true, key: true, name: true },
        where: { active: true, deletedAt: null },
      }),
    ]);
  const unique = <T extends { id: string }>(items: T[]): T[] =>
    [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b), "es"),
    );
  const auditReports = unique(
    rows.map((row) => ({
      id: row.auditReportId,
      label: row.observation.code.split(" / ")[0]!,
    })),
  );
  const relationshipMap = new Map<
    string,
    {
      areaId: string;
      areaResponsibleIds: Set<string>;
      executorIds: Set<string>;
      processOwnerIds: Set<string>;
      responsibleExecutorIds: Map<string, Set<string>>;
    }
  >();
  rows.forEach((row) => {
    const relationship = relationshipMap.get(row.area.id) ?? {
      areaId: row.area.id,
      areaResponsibleIds: new Set<string>(),
      executorIds: new Set<string>(),
      processOwnerIds: new Set<string>(),
      responsibleExecutorIds: new Map<string, Set<string>>(),
    };
    if (row.areaResponsible) {
      relationship.areaResponsibleIds.add(row.areaResponsible.id);
      const executorIds =
        relationship.responsibleExecutorIds.get(row.areaResponsible.id) ??
        new Set<string>();
      if (row.executor) executorIds.add(row.executor.id);
      relationship.responsibleExecutorIds.set(
        row.areaResponsible.id,
        executorIds,
      );
    }
    if (row.executor) relationship.executorIds.add(row.executor.id);
    if (row.processOwner) relationship.processOwnerIds.add(row.processOwner.id);
    relationshipMap.set(row.area.id, relationship);
  });
  const areaRelationships = [...relationshipMap.values()].map(
    (relationship) => ({
      areaId: relationship.areaId,
      areaResponsibleIds: [...relationship.areaResponsibleIds],
      executorIds: [...relationship.executorIds],
      processOwnerIds: [...relationship.processOwnerIds],
      responsibleExecutorIds: [...relationship.responsibleExecutorIds].map(
        ([areaResponsibleId, executorIds]) => ({
          areaResponsibleId,
          executorIds: [...executorIds],
        }),
      ),
    }),
  );
  const hierarchyRelationships = [
    ...new Map(
      rows.map((row) => {
        const relationship = {
          areaId: row.area.id,
          areaResponsibleId: row.areaResponsible?.id ?? null,
          executorId: row.executor?.id ?? null,
          processOwnerId: row.processOwner?.id ?? null,
        };
        return [
          [
            relationship.areaId,
            relationship.processOwnerId,
            relationship.areaResponsibleId,
            relationship.executorId,
          ].join(":"),
          relationship,
        ] as const;
      }),
    ).values(),
  ];
  return {
    areas: unique(rows.map((row) => row.area)),
    areaRelationships,
    hierarchyRelationships,
    areaResponsibles: unique(
      rows.flatMap((row) => (row.areaResponsible ? [row.areaResponsible] : [])),
    ),
    auditReports,
    executors: unique(
      rows.flatMap((row) => (row.executor ? [row.executor] : [])),
    ),
    processOwners: unique(
      rows.flatMap((row) => (row.processOwner ? [row.processOwner] : [])),
    ),
    filterCapabilities: getReportFilterCapabilities(access),
    deadlineStatuses: reportDeadlineStatusOptions,
    observationStatuses,
    progressStatuses: OFFICIAL_ACTION_PLAN_STATUSES.map((key) => ({
      ...getOfficialActionPlanProgress(key),
    })),
    riskLevels,
    defaultCutoffDate: cutoffDate,
  };
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
      select: buildObservationReportSelect(access),
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

const formatReportDateKey = (value: string): string =>
  new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(toDateAtUtc(value));

const getMonthRange = (
  dateFrom?: string,
  dateTo?: string,
  cutoffDate?: string,
): Date[] => {
  const requestedEnd = dateTo
    ? new Date(`${dateTo}T00:00:00.000Z`)
    : cutoffDate
      ? new Date(`${cutoffDate}T00:00:00.000Z`)
      : new Date();
  const cutoff = cutoffDate
    ? new Date(`${cutoffDate}T00:00:00.000Z`)
    : undefined;
  const end = cutoff && requestedEnd > cutoff ? cutoff : requestedEnd;
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
  dashboard: ReportDashboardData,
): Record<string, string | number | boolean | null> => {
  const rows = Array.isArray(dashboard.rows) ? dashboard.rows : [];
  const cutoffDate = filters.cutoffDate ?? dashboard.cutoffDate;

  return {
    "Fecha de corte": cutoffDate ? formatReportDateKey(cutoffDate) : "Actual",
    Área: filters.areaId
      ? (rows.find((row) => row.area.id === filters.areaId)?.area.name ??
        "Área seleccionada")
      : "Todas",
    "Dueño del proceso": filters.processOwnerId?.length
      ? [
          ...new Set(
            rows
              .filter(
                (row) =>
                  row.processOwner &&
                  filters.processOwnerId?.includes(row.processOwner.id),
              )
              .map((row) => row.processOwner!.name),
          ),
        ].join(", ") || "Dueño seleccionado"
      : "Todos",
    Ejecutor:
      filters.executorId?.length || filters.responsibleUserId
        ? "Ejecutor seleccionado"
        : "Todos",
    "Estado de observación": filters.observationStatusIds?.length
      ? `${filters.observationStatusIds.length} estados seleccionados`
      : filters.statusId
        ? "Estado seleccionado"
        : "Todos",
    "Estado del plan de acción": filters.progressStatus
      ? {
          CONCLUDED: "Concluido",
          NOT_STARTED: "No iniciado",
          STARTED: "Iniciado",
          WITH_PROGRESS: "Con avance",
        }[filters.progressStatus]
      : "Todos",
    "Estado según plazo": filters.deadlineStatuses?.length
      ? filters.deadlineStatuses
          .map((status) => (status === "VENCIDO" ? "Vencido" : "Vigente"))
          .join(", ")
      : filters.deadlineStatus
        ? filters.deadlineStatus === "VENCIDO"
          ? "Vencido"
          : "Vigente"
        : "Todos",
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
    Riesgo: filters.riskLevelId ? "Nivel seleccionado" : "Todos",
    "Responsable de área": filters.areaResponsibleId?.length
      ? "Responsable seleccionado"
      : "Todos",
    Reprogramado:
      filters.reprogrammed === undefined
        ? "Todos"
        : filters.reprogrammed
          ? "Sí"
          : "No",
    Informe: filters.auditReportId?.length ? "Informe seleccionado" : "Todos",
    Búsqueda: filters.search || "Todas",
  };
};

// Observation-grain builder used by the dedicated report generator.
const getDashboard = async (
  filters: ReportFilters,
  access: AuthorizationSummary,
): Promise<any> => {
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
          where: buildObservationAreaScopeWhere(access),
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

// Observation-grain rows used by the dedicated report generator.
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
          deadlineExtensionRequests: {
            orderBy: { updatedAt: "desc" },
            select: { proposedDueDate: true, status: true },
            where: { deletedAt: null },
          },
          observation: { select: observationIdentitySelect },
          progressPercent: true,
          responsibleUser: { select: userSummarySelect },
          status: true,
          description: true,
        },
        where: {
          AND: [
            buildActionPlanScopeWhere(access),
            { observation: observationWhere },
          ],
        },
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
        rows: actionPlans.map((actionPlan: any) => {
          const effectiveDueDate = getEffectiveActionPlanDueDate(actionPlan);
          return {
            Avance: `${actionPlan.progressPercent}%`,
            "Plan de acción": actionPlan.description,
            "Fecha límite": effectiveDueDate.toISOString(),
            Estado: actionPlan.status,
            Observación: `${observationDisplayCode(actionPlan.observation)} · ${actionPlan.observation.title}`,
            Responsable: actionPlan.responsibleUser?.name ?? "Sin asignar",
          };
        }),
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
        where: {
          AND: [
            buildEvidenceScopeWhere(access),
            { observation: observationWhere },
          ],
        },
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
              currentDueDate: true,
              deadlineExtensionRequests: {
                orderBy: { updatedAt: "desc" },
                select: { proposedDueDate: true, status: true },
                where: { deletedAt: null },
              },
              observation: { select: observationIdentitySelect },
              title: true,
            },
          },
          observation: {
            select: { ...observationIdentitySelect, currentDueDate: true },
          },
          observationArea: { select: { area: { select: areaSummarySelect } } },
          previousDueDate: true,
          proposedDueDate: true,
          requestedByUser: { select: userSummarySelect },
          status: true,
          updatedAt: true,
        },
        where: {
          AND: [
            buildExtensionRequestScopeWhere(access),
            {
              OR: [
                { observation: observationWhere },
                { actionPlan: { observation: observationWhere } },
              ],
            },
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
        select: buildObservationReportSelect(access),
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
      where: { ...common, ...buildEvidenceScopeWhere(access) },
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
                currentDueDate: true,
                riskLevel: { select: { name: true } },
              },
            },
            currentDueDate: true,
            deadlineExtensionRequests: {
              orderBy: { updatedAt: "desc" },
              select: { proposedDueDate: true, status: true },
              where: { deletedAt: null },
            },
            title: true,
          },
        },
        observation: {
          select: {
            ...observationIdentitySelect,
            currentDueDate: true,
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
        AND: [
          buildExtensionRequestScopeWhere(access),
          {
            OR: [
              { observation: observationWhere },
              { actionPlan: { observation: observationWhere } },
            ],
          },
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
        const effectiveDueDate = request.actionPlan
          ? getEffectiveActionPlanDueDate(request.actionPlan)
          : (request.observation?.currentDueDate ?? request.proposedDueDate);
        return query.template === "DEADLINES"
          ? {
              Área: request.observationArea?.area.name ?? "Varias áreas",
              "Días de ampliación": extensionDays,
              "Días vencidos":
                effectiveDueDate.getTime() < Date.now()
                  ? Math.round(
                      (Date.now() - effectiveDueDate.getTime()) /
                        (1000 * 60 * 60 * 24),
                    )
                  : 0,
              Estado: request.status,
              "Fecha actual": effectiveDueDate.toISOString(),
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
  assertReportFilterAccess,
  buildActionPlanWhere,
  buildObservationWhere,
  getReportFilterCapabilities,

  async getDashboard(filters: ReportFilters, access: AuthorizationSummary) {
    return getActionPlanDashboard(filters, access);
  },

  async getOptions(access: AuthorizationSummary) {
    return getReportOptions(access);
  },

  async listActionPlans(query: ReportQuery, access: AuthorizationSummary) {
    return getActionPlanRows(query, access);
  },

  async listObservations(query: ReportQuery, access: AuthorizationSummary) {
    return getObservationRows(query, access);
  },

  async getPreview(
    query: ReportPreviewQuery,
    access: AuthorizationSummary,
  ): Promise<ReportPreviewData> {
    const dashboard =
      query.type === "ACTION_PLANS"
        ? await getActionPlanDashboard(query, access)
        : await getDashboard(query, access);
    const report =
      query.type === "ACTION_PLANS"
        ? getActionPlanReportRows(query, dashboard)
        : await getReportRows(query, access, dashboard);
    return {
      charts: dashboard.charts,
      columns: report.columns,
      filters: buildFilterLabelMap(query, dashboard),
      generatedAt: dashboard.generatedAt,
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
