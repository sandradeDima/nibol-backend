import { buildObservationScopeWhere as buildScopedObservationWhere, } from "../../services/authorization-service.js";
import { officialProgressByStatus } from "../progress/progress.constants.js";
export const REPORT_DEFAULT_DUE_SOON_DAYS = 7;
export const REPORT_MAX_DUE_SOON_DAYS = 90;
export const REPORT_RESOLUTION_LOOKBACK_MONTHS = 12;
export const OFFICIAL_ACTION_PLAN_STATUSES = [
    "NOT_STARTED",
    "STARTED",
    "WITH_PROGRESS",
    "CONCLUDED",
];
export const reportDeadlineStatusOptions = [
    { key: "VIGENTE", label: "Vigente" },
    { key: "VENCIDO", label: "Vencido" },
];
export const officialActionPlanStatusMeta = {
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
const toOfficialActionPlanStatus = (value) => OFFICIAL_ACTION_PLAN_STATUSES.includes(value)
    ? value
    : "NOT_STARTED";
export const getOfficialActionPlanProgress = (status) => {
    const normalized = toOfficialActionPlanStatus(status);
    return {
        ...officialActionPlanStatusMeta[normalized],
        key: normalized,
    };
};
export const isApprovedDeadlineExtension = (extension) => extension?.status === "MANAGER_APPROVED";
export const getEffectiveActionPlanDueDate = (plan) => {
    const approvedExtension = plan.deadlineExtensionRequests?.find(isApprovedDeadlineExtension);
    return approvedExtension?.proposedDueDate ?? plan.currentDueDate;
};
export const getDateOnlyKey = (value) => value.toISOString().slice(0, 10);
export const getBusinessDateKey = (now = new Date(), timeZone = "UTC") => {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            day: "2-digit",
            month: "2-digit",
            timeZone,
            year: "numeric",
        })
            .formatToParts(now)
            .reduce((result, part) => {
            result[part.type] = part.value;
            return result;
        }, {});
        return `${parts.year}-${parts.month}-${parts.day}`;
    }
    catch {
        return getDateOnlyKey(now);
    }
};
export const getActionPlanDeadlineStatus = (plan, now = new Date(), timeZone = "UTC") => {
    const effectiveDueDate = getEffectiveActionPlanDueDate(plan);
    if (plan.status === "CONCLUDED")
        return "VIGENTE";
    return getDateOnlyKey(effectiveDueDate) < getBusinessDateKey(now, timeZone)
        ? "VENCIDO"
        : "VIGENTE";
};
export const isActionPlanOverdue = (plan, now = new Date(), timeZone = "UTC") => getActionPlanDeadlineStatus(plan, now, timeZone) === "VENCIDO";
export const CLOSED_OBSERVATION_STATUS_KEYS = new Set(["CONCLUIDO"]);
export const OPEN_OBSERVATION_STATUS_KEYS = new Set([
    "NO_INICIADO",
    "INICIADO",
    "CON_AVANCE",
]);
export const hasGlobalBusinessAccess = (access) => {
    return access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE";
};
export const buildObservationVisibilityCondition = (access) => {
    if (hasGlobalBusinessAccess(access)) {
        return undefined;
    }
    return buildScopedObservationWhere(access);
};
export const buildObservationScopeWhere = (access) => {
    const visibility = buildObservationVisibilityCondition(access);
    return {
        AND: [{ deletedAt: null }, ...(visibility ? [visibility] : [])],
    };
};
export const isObservationClosed = (status) => {
    return (Boolean(status.isFinal) || CLOSED_OBSERVATION_STATUS_KEYS.has(status.key));
};
export const isObservationOverdue = (dueDate, status, now = new Date()) => {
    return !isObservationClosed(status) && dueDate.getTime() < now.getTime();
};
export const isObservationDueSoon = (dueDate, status, dueSoonDays = REPORT_DEFAULT_DUE_SOON_DAYS, now = new Date()) => {
    if (isObservationClosed(status) ||
        isObservationOverdue(dueDate, status, now)) {
        return false;
    }
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + dueSoonDays);
    return (dueDate.getTime() >= now.getTime() &&
        dueDate.getTime() <= threshold.getTime());
};
export const getObservationStatusGroup = (status, overdue) => {
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
export const getRiskGroupLabel = (key, name) => {
    const normalized = key.toUpperCase();
    if (normalized.includes("CRIT"))
        return "Crítico";
    if (normalized.includes("ALTO") || normalized.includes("HIGH"))
        return "Alto";
    if (normalized.includes("MEDIO") || normalized.includes("MEDIUM"))
        return "Medio";
    if (normalized.includes("BAJO") || normalized.includes("LOW"))
        return "Bajo";
    return name;
};
export const getDaysBetween = (from, to) => {
    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / millisecondsPerDay));
};
//# sourceMappingURL=reporting-definitions.js.map