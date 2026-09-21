import type { Prisma } from "../../../generated/prisma/client.js";

import {
  buildObservationScopeWhere as buildScopedObservationWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { officialProgressByStatus } from "../progress/progress.constants.js";

export const REPORT_DEFAULT_DUE_SOON_DAYS = 7;
export const REPORT_MAX_DUE_SOON_DAYS = 90;
export const REPORT_RESOLUTION_LOOKBACK_MONTHS = 12;

export const OFFICIAL_ACTION_PLAN_STATUSES = [
  "NOT_STARTED",
  "STARTED",
  "WITH_PROGRESS",
  "CONCLUDED",
] as const;

export type OfficialActionPlanStatus =
  (typeof OFFICIAL_ACTION_PLAN_STATUSES)[number];
export type DeadlineStatus = "VIGENTE" | "VENCIDO";

export const reportDeadlineStatusOptions: Array<{
  key: DeadlineStatus;
  label: string;
}> = [
  { key: "VIGENTE", label: "Vigente" },
  { key: "VENCIDO", label: "Vencido" },
];

export const officialActionPlanStatusMeta: Record<
  OfficialActionPlanStatus,
  { code: "NI" | "I" | "CA" | "CO"; label: string; percent: number }
> = {
  CONCLUDED: {
    code: "CO",
    label: "Concluido",
    percent: officialProgressByStatus.CONCLUDED,
  },
  NOT_STARTED: {
    code: "NI",
    label: "No iniciado",
    percent: officialProgressByStatus.NOT_STARTED,
  },
  STARTED: {
    code: "I",
    label: "Iniciado",
    percent: officialProgressByStatus.STARTED,
  },
  WITH_PROGRESS: {
    code: "CA",
    label: "Con avance",
    percent: officialProgressByStatus.WITH_PROGRESS,
  },
};

const toOfficialActionPlanStatus = (value: string): OfficialActionPlanStatus =>
  OFFICIAL_ACTION_PLAN_STATUSES.includes(value as OfficialActionPlanStatus)
    ? (value as OfficialActionPlanStatus)
    : "NOT_STARTED";

export const getOfficialActionPlanProgress = (status: string) => {
  const normalized = toOfficialActionPlanStatus(status);
  return {
    ...officialActionPlanStatusMeta[normalized],
    key: normalized,
  };
};

export const isApprovedDeadlineExtension = (
  extension?: {
    finalApprovedAt?: Date | null;
    status?: string | null;
  } | null,
): boolean => extension?.status === "MANAGER_APPROVED";

export const getEffectiveActionPlanDueDate = (plan: {
  currentDueDate: Date;
  deadlineExtensionRequests?: Array<{
    proposedDueDate: Date;
    status: string;
    finalApprovedAt?: Date | null;
  }>;
}): Date => {
  const approvedExtension = plan.deadlineExtensionRequests?.find(
    isApprovedDeadlineExtension,
  );
  return approvedExtension?.proposedDueDate ?? plan.currentDueDate;
};

export const getDateOnlyKey = (value: Date): string =>
  value.toISOString().slice(0, 10);

export const getBusinessDateKey = (
  now = new Date(),
  timeZone = "UTC",
): string => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    })
      .formatToParts(now)
      .reduce<Record<string, string>>((result, part) => {
        result[part.type] = part.value;
        return result;
      }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return getDateOnlyKey(now);
  }
};

export const getActionPlanDeadlineStatus = (
  plan: {
    currentDueDate: Date;
    status: string;
    deadlineExtensionRequests?: Array<{
      proposedDueDate: Date;
      status: string;
      finalApprovedAt?: Date | null;
    }>;
  },
  now = new Date(),
  timeZone = "UTC",
): DeadlineStatus => {
  const effectiveDueDate = getEffectiveActionPlanDueDate(plan);
  if (plan.status === "CONCLUDED") return "VIGENTE";
  return getDateOnlyKey(effectiveDueDate) < getBusinessDateKey(now, timeZone)
    ? "VENCIDO"
    : "VIGENTE";
};

export const isActionPlanOverdue = (
  plan: {
    currentDueDate: Date;
    status: string;
    deadlineExtensionRequests?: Array<{
      proposedDueDate: Date;
      status: string;
      finalApprovedAt?: Date | null;
    }>;
  },
  now = new Date(),
  timeZone = "UTC",
): boolean => getActionPlanDeadlineStatus(plan, now, timeZone) === "VENCIDO";

export const CLOSED_OBSERVATION_STATUS_KEYS = new Set(["CONCLUIDO"]);

export const OPEN_OBSERVATION_STATUS_KEYS = new Set([
  "NO_INICIADO",
  "INICIADO",
  "CON_AVANCE",
]);

export const hasGlobalBusinessAccess = (
  access: AuthorizationSummary,
): boolean => {
  return access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE";
};

export const buildObservationVisibilityCondition = (
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput | undefined => {
  if (hasGlobalBusinessAccess(access)) {
    return undefined;
  }

  return buildScopedObservationWhere(access);
};

export const buildObservationScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  const visibility = buildObservationVisibilityCondition(access);

  return {
    AND: [{ deletedAt: null }, ...(visibility ? [visibility] : [])],
  };
};

export const isObservationClosed = (status: {
  isFinal?: boolean;
  key: string;
}): boolean => {
  return (
    Boolean(status.isFinal) || CLOSED_OBSERVATION_STATUS_KEYS.has(status.key)
  );
};

export const isObservationOverdue = (
  dueDate: Date,
  status: { isFinal?: boolean; key: string },
  now = new Date(),
): boolean => {
  return !isObservationClosed(status) && dueDate.getTime() < now.getTime();
};

export const isObservationDueSoon = (
  dueDate: Date,
  status: { isFinal?: boolean; key: string },
  dueSoonDays = REPORT_DEFAULT_DUE_SOON_DAYS,
  now = new Date(),
): boolean => {
  if (
    isObservationClosed(status) ||
    isObservationOverdue(dueDate, status, now)
  ) {
    return false;
  }

  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() + dueSoonDays);

  return (
    dueDate.getTime() >= now.getTime() &&
    dueDate.getTime() <= threshold.getTime()
  );
};

export const getObservationStatusGroup = (
  status: { isFinal?: boolean; key: string; name: string },
  overdue: boolean,
): "OPEN" | "IN_PROGRESS" | "IN_REVIEW" | "CLOSED" | "OVERDUE" => {
  if (overdue) {
    return "OVERDUE";
  }

  if (isObservationClosed(status)) {
    return "CLOSED";
  }

  if (status.key === "CON_AVANCE") {
    return "IN_REVIEW";
  }

  if (status.key === "INICIADO") {
    return "IN_PROGRESS";
  }

  return "OPEN";
};

export const getRiskGroupLabel = (key: string, name: string): string => {
  const normalized = key.toUpperCase();

  if (normalized.includes("CRIT")) return "Crítico";
  if (normalized.includes("ALTO") || normalized.includes("HIGH")) return "Alto";
  if (normalized.includes("MEDIO") || normalized.includes("MEDIUM"))
    return "Medio";
  if (normalized.includes("BAJO") || normalized.includes("LOW")) return "Bajo";

  return name;
};

export const getDaysBetween = (from: Date, to: Date): number => {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / millisecondsPerDay),
  );
};
