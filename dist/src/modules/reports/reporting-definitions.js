import { AUDIT_ROLE_MARKERS, SYSTEM_WIDE_ROLE_NAMES, } from "../remediation/remediation.constants.js";
export const REPORT_DEFAULT_DUE_SOON_DAYS = 7;
export const REPORT_MAX_DUE_SOON_DAYS = 90;
export const REPORT_RESOLUTION_LOOKBACK_MONTHS = 12;
export const CLOSED_OBSERVATION_STATUS_KEYS = new Set(["CONCLUIDO"]);
export const OPEN_OBSERVATION_STATUS_KEYS = new Set([
    "NO_INICIADO",
    "INICIADO",
    "CON_AVANCE",
]);
export const normalizeBusinessRole = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
export const hasGlobalBusinessAccess = (access) => {
    if (access.isAdmin) {
        return true;
    }
    return access.roles.some((role) => {
        const normalized = normalizeBusinessRole(role);
        return (SYSTEM_WIDE_ROLE_NAMES.has(normalized) ||
            AUDIT_ROLE_MARKERS.some((marker) => normalized.includes(marker)));
    });
};
export const buildObservationVisibilityCondition = (access) => {
    if (hasGlobalBusinessAccess(access)) {
        return undefined;
    }
    return {
        OR: [
            { auditorUserId: access.userId },
            {
                areaAssignments: {
                    some: {
                        OR: [
                            { areaResponsibleUserId: access.userId },
                            { processOwnerUserId: access.userId },
                            {
                                area: {
                                    active: true,
                                    deletedAt: null,
                                    managerUserId: access.userId,
                                },
                            },
                        ],
                    },
                },
            },
            {
                actionPlans: {
                    some: {
                        deletedAt: null,
                        responsibleUserId: access.userId,
                    },
                },
            },
            {
                remediationPlans: {
                    some: {
                        deletedAt: null,
                        ownerUserId: access.userId,
                    },
                },
            },
        ],
    };
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