/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { ACTIVE_EXTENSION_REQUEST_STATUSES } from "../extension-requests/extension-requests.constants.js";
import { AUDIT_ROLE_MARKERS, SYSTEM_WIDE_ROLE_NAMES, } from "../remediation/remediation.constants.js";
const dashboardPrisma = prisma;
const CRITICAL_RISK_KEYS = ["CRITICO", "ALTO"];
const DEFAULT_REMINDER_DAYS_BEFORE_DUE = 7;
const PENDING_EXTENSION_STATUSES = ["SENT_TO_MANAGER", "SENT_TO_AUDIT"];
const PENDING_PROGRESS_STATUS = "SENT_TO_AUDIT";
const RETURNED_PROGRESS_STATUS = "RETURNED";
const userSummarySelect = {
    email: true,
    id: true,
    name: true,
};
const areaSummarySelect = {
    id: true,
    name: true,
};
const observationRowSelect = {
    area: {
        select: areaSummarySelect,
    },
    code: true,
    dueDate: true,
    id: true,
    progressPercent: true,
    responsibleUser: {
        select: userSummarySelect,
    },
    riskLevel: {
        select: {
            colorToken: true,
            key: true,
            name: true,
            severityOrder: true,
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
};
const commitmentRowSelect = {
    dueDate: true,
    id: true,
    progressPercent: true,
    remediationPlan: {
        select: {
            area: {
                select: areaSummarySelect,
            },
        },
    },
    responsibleUser: {
        select: userSummarySelect,
    },
    status: true,
    title: true,
    updatedAt: true,
    observation: {
        select: {
            code: true,
            id: true,
            title: true,
        },
    },
    completedAt: true,
};
const progressReviewSelect = {
    id: true,
    progressPercent: true,
    status: true,
    type: true,
    updatedAt: true,
    submittedByUser: {
        select: userSummarySelect,
    },
    observation: {
        select: {
            area: {
                select: areaSummarySelect,
            },
            code: true,
            id: true,
            title: true,
        },
    },
};
const extensionReviewSelect = {
    area: {
        select: areaSummarySelect,
    },
    commitment: {
        select: {
            title: true,
        },
    },
    id: true,
    requestedByUser: {
        select: userSummarySelect,
    },
    status: true,
    updatedAt: true,
    observation: {
        select: {
            code: true,
            id: true,
            title: true,
        },
    },
};
const latestObservationSelect = {
    area: {
        select: areaSummarySelect,
    },
    code: true,
    id: true,
    title: true,
    updatedAt: true,
};
const latestProgressSelect = {
    id: true,
    status: true,
    type: true,
    updatedAt: true,
    observation: {
        select: {
            code: true,
            id: true,
            title: true,
        },
    },
};
const latestExtensionSelect = {
    id: true,
    status: true,
    updatedAt: true,
    observation: {
        select: {
            code: true,
            id: true,
            title: true,
        },
    },
};
const normalizeRoleName = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
const hasSystemWideRole = (access) => {
    if (access.isAdmin) {
        return true;
    }
    return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};
const hasAuditRole = (access) => {
    return access.roles.some((role) => {
        const normalizedRole = normalizeRoleName(role);
        return AUDIT_ROLE_MARKERS.some((marker) => normalizedRole.includes(marker));
    });
};
const hasManagementRole = (access) => {
    return access.roles.some((role) => {
        const normalizedRole = normalizeRoleName(role);
        return (normalizedRole.includes("gerencia") ||
            normalizedRole.includes("gerente") ||
            normalizedRole.includes("manager") ||
            normalizedRole.includes("responsable de area") ||
            normalizedRole.includes("responsable area"));
    });
};
const hasExecutorRole = (access) => {
    return access.roles.some((role) => {
        const normalizedRole = normalizeRoleName(role);
        return normalizedRole.includes("ejecutor") || normalizedRole.includes("executor");
    });
};
const hasAuditDashboardAccess = (access) => {
    return access.isAdmin || hasSystemWideRole(access) || hasAuditRole(access);
};
const resolveViewerProfile = (access) => {
    if (access.isAdmin) {
        return "ADMIN";
    }
    if (hasSystemWideRole(access)) {
        return "SYSTEMS";
    }
    if (hasAuditRole(access)) {
        return "AUDIT";
    }
    if (hasManagementRole(access)) {
        return "MANAGEMENT";
    }
    if (hasExecutorRole(access)) {
        return "EXECUTOR";
    }
    return "GENERAL";
};
const buildSubtitle = (scope, profile) => {
    if (scope === "auditoria") {
        switch (profile) {
            case "ADMIN":
                return "Vista global para control administrativo y seguimiento integral de observaciones.";
            case "SYSTEMS":
                return "Vista global para monitoreo operativo, soporte y trazabilidad corporativa.";
            case "AUDIT":
                return "Vista global de Auditoría para revisión de observaciones, avances y ampliaciones.";
            default:
                return "Vista global consolidada del seguimiento corporativo.";
        }
    }
    switch (profile) {
        case "MANAGEMENT":
            return "Vista acotada a su área y observaciones bajo responsabilidad gerencial.";
        case "EXECUTOR":
            return "Vista personal con observaciones, compromisos y avances asignados a su usuario.";
        default:
            return "Vista acotada a sus áreas y responsabilidades operativas.";
    }
};
const startOfDay = (value) => {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
};
const addDays = (value, days) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
};
const getMonthStart = (value) => {
    return new Date(value.getFullYear(), value.getMonth(), 1);
};
const getMonthKey = (value) => {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
};
const getMonthLabel = (value) => {
    return new Intl.DateTimeFormat("es-BO", {
        month: "short",
    }).format(value);
};
const formatPercent = (value) => {
    if (!Number.isFinite(value ?? NaN)) {
        return 0;
    }
    return Math.round(Number(value));
};
const buildObservationVisibilityCondition = (access) => {
    if (hasAuditDashboardAccess(access)) {
        return undefined;
    }
    return {
        OR: [
            {
                responsibleUserId: access.userId,
            },
            {
                auditorUserId: access.userId,
            },
            {
                area: {
                    active: true,
                    deletedAt: null,
                    managerUserId: access.userId,
                },
            },
            {
                areaAssignments: {
                    some: {
                        OR: [
                            {
                                responsibleUserId: access.userId,
                            },
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
                commitments: {
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
const buildCommitmentVisibilityCondition = (access) => {
    if (hasAuditDashboardAccess(access)) {
        return undefined;
    }
    return {
        OR: [
            {
                responsibleUserId: access.userId,
            },
            {
                remediationPlan: {
                    ownerUserId: access.userId,
                },
            },
            {
                remediationPlan: {
                    area: {
                        active: true,
                        deletedAt: null,
                        managerUserId: access.userId,
                    },
                },
            },
            {
                remediationPlan: {
                    observation: buildObservationVisibilityCondition(access) ?? {},
                },
            },
        ],
    };
};
const buildProgressVisibilityCondition = (access) => {
    if (hasAuditDashboardAccess(access)) {
        return undefined;
    }
    return {
        OR: [
            {
                submittedByUserId: access.userId,
            },
            {
                reviewedByUserId: access.userId,
            },
            {
                commitment: {
                    responsibleUserId: access.userId,
                },
            },
            {
                remediationPlan: {
                    ownerUserId: access.userId,
                },
            },
            {
                observation: buildObservationVisibilityCondition(access) ?? {},
            },
        ],
    };
};
const buildExtensionVisibilityCondition = (access) => {
    if (hasAuditDashboardAccess(access)) {
        return undefined;
    }
    return {
        OR: [
            {
                requestedByUserId: access.userId,
            },
            {
                area: {
                    active: true,
                    deletedAt: null,
                    managerUserId: access.userId,
                },
            },
            {
                observation: buildObservationVisibilityCondition(access) ?? {},
            },
            {
                commitment: {
                    responsibleUserId: access.userId,
                },
            },
            {
                commitment: {
                    remediationPlan: {
                        ownerUserId: access.userId,
                    },
                },
            },
        ],
    };
};
const buildObservationWhere = (access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    return {
        AND: [
            {
                deletedAt: null,
            },
            ...(visibilityCondition ? [visibilityCondition] : []),
        ],
    };
};
const buildCommitmentWhere = (access) => {
    const visibilityCondition = buildCommitmentVisibilityCondition(access);
    return {
        AND: [
            {
                deletedAt: null,
            },
            ...(visibilityCondition ? [visibilityCondition] : []),
        ],
    };
};
const buildProgressWhere = (access) => {
    const visibilityCondition = buildProgressVisibilityCondition(access);
    return {
        AND: [
            {
                deletedAt: null,
            },
            ...(visibilityCondition ? [visibilityCondition] : []),
        ],
    };
};
const buildExtensionWhere = (access) => {
    const visibilityCondition = buildExtensionVisibilityCondition(access);
    return {
        AND: [
            {
                deletedAt: null,
            },
            ...(visibilityCondition ? [visibilityCondition] : []),
        ],
    };
};
const isCommitmentCompleted = (commitment) => {
    return (commitment.status === "COMPLETED" ||
        commitment.completedAt !== null ||
        commitment.progressPercent >= 100);
};
const isObservationOverdue = (dueDate, isFinalStatus, today) => {
    return !isFinalStatus && dueDate.getTime() < today.getTime();
};
const isCommitmentOverdue = (commitment, today) => {
    return !isCommitmentCompleted(commitment) && commitment.dueDate.getTime() < today.getTime();
};
const isCommitmentUpcoming = (commitment, today, dueThreshold) => {
    return (!isCommitmentCompleted(commitment) &&
        commitment.dueDate.getTime() >= today.getTime() &&
        commitment.dueDate.getTime() <= dueThreshold.getTime());
};
const buildIncompleteCommitmentCondition = () => {
    return {
        NOT: {
            OR: [
                {
                    status: "COMPLETED",
                },
                {
                    completedAt: {
                        not: null,
                    },
                },
                {
                    progressPercent: {
                        gte: 100,
                    },
                },
            ],
        },
    };
};
const getCommitmentStatusLabel = (status) => {
    switch (status) {
        case "PENDING":
            return "Pendiente";
        case "IN_PROGRESS":
            return "En progreso";
        case "SENT_TO_AUDIT":
            return "Enviado a Auditoría";
        case "APPROVED":
            return "Aprobado";
        case "RETURNED":
            return "Devuelto";
        case "COMPLETED":
            return "Completado";
        case "OVERDUE":
            return "Vencido";
        default:
            return status;
    }
};
const getProgressStatusLabel = (status) => {
    switch (status) {
        case "DRAFT":
            return "Borrador";
        case "SENT_TO_AUDIT":
            return "Enviado a Auditoría";
        case "APPROVED":
            return "Aprobado";
        case "RETURNED":
            return "Devuelto";
        case "REJECTED":
            return "Rechazado";
        default:
            return status;
    }
};
const getProgressTypeLabel = (type) => {
    switch (type) {
        case "ADVANCE":
            return "Avance";
        case "FINALIZATION":
            return "Finalización";
        case "CORRECTION":
            return "Corrección";
        default:
            return type;
    }
};
const getExtensionStatusLabel = (status) => {
    switch (status) {
        case "DRAFT":
            return "Borrador";
        case "SENT_TO_MANAGER":
            return "En revisión de Gerencia";
        case "MANAGER_APPROVED":
            return "Aprobada por Gerencia";
        case "MANAGER_REJECTED":
            return "Rechazada por Gerencia";
        case "SENT_TO_AUDIT":
            return "En revisión de Auditoría";
        case "AUDIT_APPROVED":
            return "Aprobada";
        case "AUDIT_REJECTED":
            return "Rechazada por Auditoría";
        case "CANCELLED":
            return "Cancelada";
        default:
            return status;
    }
};
const getReminderDaysBeforeDue = async () => {
    const parameter = await dashboardPrisma.systemParameter.findFirst({
        select: {
            value: true,
        },
        where: {
            active: true,
            deletedAt: null,
            key: "reminder_days_before_due",
        },
    });
    const parsedValue = Number(parameter?.value ?? "");
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        return DEFAULT_REMINDER_DAYS_BEFORE_DUE;
    }
    return Math.round(parsedValue);
};
const mapObservationRow = (observation, today) => {
    return {
        area: observation.area,
        code: observation.code,
        dueDate: observation.dueDate.toISOString(),
        href: `/observaciones/${observation.id}`,
        id: observation.id,
        isOverdue: isObservationOverdue(observation.dueDate, observation.status.isFinal, today),
        progressPercent: observation.progressPercent,
        responsibleUser: observation.responsibleUser,
        riskLevel: {
            colorToken: observation.riskLevel.colorToken,
            key: observation.riskLevel.key,
            name: observation.riskLevel.name,
        },
        status: {
            key: observation.status.key,
            name: observation.status.name,
        },
        title: observation.title,
        updatedAt: observation.updatedAt.toISOString(),
    };
};
const mapCommitmentRow = (commitment, today) => {
    const overdue = isCommitmentOverdue(commitment, today);
    const effectiveStatusKey = overdue ? "OVERDUE" : isCommitmentCompleted(commitment) ? "COMPLETED" : commitment.status;
    return {
        area: commitment.remediationPlan.area,
        dueDate: commitment.dueDate.toISOString(),
        href: `/observaciones/${commitment.observation.id}`,
        id: commitment.id,
        isOverdue: overdue,
        progressPercent: commitment.progressPercent,
        responsibleUser: commitment.responsibleUser,
        status: {
            key: effectiveStatusKey,
            name: getCommitmentStatusLabel(effectiveStatusKey),
        },
        title: commitment.title,
        updatedAt: commitment.updatedAt.toISOString(),
        observation: {
            code: commitment.observation.code,
            id: commitment.observation.id,
            title: commitment.observation.title,
        },
    };
};
const buildCurrentVsOverdue = (openObservations, overdueObservations) => {
    return [
        {
            colorToken: "primary",
            key: "vigentes",
            label: "Vigentes",
            value: Math.max(0, openObservations - overdueObservations),
        },
        {
            colorToken: "critical",
            key: "vencidas",
            label: "Vencidas",
            value: overdueObservations,
        },
    ];
};
const buildDistributionHrefs = (permission) => {
    const canViewObservations = permission.includes("observations.view");
    return {
        area: (areaId) => canViewObservations ? `/observaciones?filter.areaId=${encodeURIComponent(areaId)}` : undefined,
        risk: (riskLevelId) => canViewObservations
            ? `/observaciones?filter.riskLevelId=${encodeURIComponent(riskLevelId)}`
            : undefined,
        status: (statusId) => canViewObservations
            ? `/observaciones?filter.statusId=${encodeURIComponent(statusId)}`
            : undefined,
    };
};
const getObservationRiskDistribution = async (access) => {
    const where = buildObservationWhere(access);
    const hrefs = buildDistributionHrefs(access.permissions);
    const grouped = await dashboardPrisma.observation.groupBy({
        _count: {
            _all: true,
        },
        by: ["riskLevelId"],
        where,
    });
    if (grouped.length === 0) {
        return [];
    }
    const riskLevels = await dashboardPrisma.riskLevel.findMany({
        select: {
            colorToken: true,
            id: true,
            key: true,
            name: true,
            severityOrder: true,
        },
        where: {
            id: {
                in: grouped.map((item) => item.riskLevelId),
            },
        },
    });
    const riskLevelMap = new Map(riskLevels.map((riskLevel) => [riskLevel.id, riskLevel]));
    return grouped
        .map((item) => {
        const riskLevel = riskLevelMap.get(item.riskLevelId);
        if (!riskLevel) {
            return null;
        }
        return {
            colorToken: riskLevel.colorToken,
            href: hrefs.risk(riskLevel.id),
            key: riskLevel.key,
            label: riskLevel.name,
            sortOrder: riskLevel.severityOrder,
            value: item._count._all,
        };
    })
        .filter(Boolean)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
        colorToken: item.colorToken,
        href: item.href,
        key: item.key,
        label: item.label,
        value: item.value,
    }));
};
const getObservationStatusDistribution = async (access) => {
    const where = buildObservationWhere(access);
    const hrefs = buildDistributionHrefs(access.permissions);
    const grouped = await dashboardPrisma.observation.groupBy({
        _count: {
            _all: true,
        },
        by: ["statusId"],
        where,
    });
    if (grouped.length === 0) {
        return [];
    }
    const statuses = await dashboardPrisma.observationStatus.findMany({
        select: {
            id: true,
            isFinal: true,
            key: true,
            name: true,
            sortOrder: true,
        },
        where: {
            id: {
                in: grouped.map((item) => item.statusId),
            },
        },
    });
    const statusMap = new Map(statuses.map((status) => [status.id, status]));
    return grouped
        .map((item) => {
        const status = statusMap.get(item.statusId);
        if (!status) {
            return null;
        }
        return {
            href: hrefs.status(status.id),
            isFinal: status.isFinal,
            key: status.key,
            label: status.name,
            sortOrder: status.sortOrder,
            value: item._count._all,
        };
    })
        .filter(Boolean)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
        href: item.href,
        isFinal: item.isFinal,
        key: item.key,
        label: item.label,
        value: item.value,
    }));
};
const getObservationAreaDistribution = async (access) => {
    const where = buildObservationWhere(access);
    const hrefs = buildDistributionHrefs(access.permissions);
    const grouped = await dashboardPrisma.observation.groupBy({
        _count: {
            _all: true,
        },
        by: ["areaId"],
        where,
    });
    if (grouped.length === 0) {
        return [];
    }
    const areas = await dashboardPrisma.area.findMany({
        select: {
            id: true,
            name: true,
        },
        where: {
            id: {
                in: grouped.map((item) => item.areaId),
            },
        },
    });
    const areaMap = new Map(areas.map((area) => [area.id, area]));
    return grouped
        .map((item) => {
        const area = areaMap.get(item.areaId);
        if (!area) {
            return null;
        }
        return {
            href: hrefs.area(area.id),
            key: area.id,
            label: area.name,
            value: item._count._all,
        };
    })
        .filter(Boolean)
        .sort((left, right) => right.value - left.value)
        .map((item) => ({
        href: item.href,
        key: item.key,
        label: item.label,
        value: item.value,
    }));
};
const getMonthlyTrend = async (access) => {
    const observationWhere = buildObservationWhere(access);
    const currentMonth = getMonthStart(new Date());
    const rangeStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5, 1);
    // The schema does not store a dedicated closedAt value, so the final-state updatedAt is
    // used as the closest persisted signal for closure timing.
    const [createdRows, closedRows] = await Promise.all([
        dashboardPrisma.observation.findMany({
            select: {
                createdAt: true,
            },
            where: {
                AND: [
                    observationWhere,
                    {
                        createdAt: {
                            gte: rangeStart,
                        },
                    },
                ],
            },
        }),
        dashboardPrisma.observation.findMany({
            select: {
                updatedAt: true,
            },
            where: {
                AND: [
                    observationWhere,
                    {
                        status: {
                            isFinal: true,
                        },
                        updatedAt: {
                            gte: rangeStart,
                        },
                    },
                ],
            },
        }),
    ]);
    const createdCounts = new Map();
    const closedCounts = new Map();
    createdRows.forEach((row) => {
        const key = getMonthKey(getMonthStart(row.createdAt));
        createdCounts.set(key, (createdCounts.get(key) ?? 0) + 1);
    });
    closedRows.forEach((row) => {
        const key = getMonthKey(getMonthStart(row.updatedAt));
        closedCounts.set(key, (closedCounts.get(key) ?? 0) + 1);
    });
    return Array.from({ length: 6 }, (_, index) => {
        const month = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1);
        const key = getMonthKey(month);
        return {
            closed: closedCounts.get(key) ?? 0,
            created: createdCounts.get(key) ?? 0,
            monthKey: key,
            monthLabel: getMonthLabel(month),
        };
    });
};
const getTopResponsibles = async (access) => {
    const where = buildObservationWhere(access);
    const grouped = await dashboardPrisma.observation.groupBy({
        _count: {
            _all: true,
        },
        by: ["responsibleUserId"],
        where: {
            AND: [
                where,
                {
                    responsibleUserId: {
                        not: null,
                    },
                    status: {
                        isFinal: false,
                    },
                },
            ],
        },
    });
    const sorted = grouped
        .filter((item) => Boolean(item.responsibleUserId))
        .sort((left, right) => right._count._all - left._count._all)
        .slice(0, 5);
    if (sorted.length === 0) {
        return [];
    }
    const users = await dashboardPrisma.user.findMany({
        select: {
            id: true,
            name: true,
        },
        where: {
            id: {
                in: sorted.map((item) => item.responsibleUserId),
            },
        },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return sorted.map((item) => {
        const user = userMap.get(item.responsibleUserId);
        return {
            href: access.permissions.includes("observations.view")
                ? `/observaciones?filter.responsibleUserId=${encodeURIComponent(item.responsibleUserId)}`
                : undefined,
            id: item.responsibleUserId,
            label: user?.name ?? "Sin responsable",
            value: item._count._all,
        };
    });
};
const getTopOverdueAreas = async (access, today) => {
    const where = buildObservationWhere(access);
    const grouped = await dashboardPrisma.observation.groupBy({
        _count: {
            _all: true,
        },
        by: ["areaId"],
        where: {
            AND: [
                where,
                {
                    dueDate: {
                        lt: today,
                    },
                    status: {
                        isFinal: false,
                    },
                },
            ],
        },
    });
    const sorted = grouped
        .sort((left, right) => right._count._all - left._count._all)
        .slice(0, 5);
    if (sorted.length === 0) {
        return [];
    }
    const areas = await dashboardPrisma.area.findMany({
        select: {
            id: true,
            name: true,
        },
        where: {
            id: {
                in: sorted.map((item) => item.areaId),
            },
        },
    });
    const areaMap = new Map(areas.map((area) => [area.id, area]));
    return sorted.map((item) => {
        const area = areaMap.get(item.areaId);
        return {
            href: access.permissions.includes("observations.view")
                ? `/observaciones?filter.areaId=${encodeURIComponent(item.areaId)}&filter.overdue=true`
                : undefined,
            id: item.areaId,
            label: area?.name ?? "Área sin nombre",
            value: item._count._all,
        };
    });
};
const getCriticalObservations = async (access, today) => {
    const where = buildObservationWhere(access);
    const rows = await dashboardPrisma.observation.findMany({
        orderBy: [
            {
                dueDate: "asc",
            },
            {
                riskLevel: {
                    severityOrder: "asc",
                },
            },
        ],
        select: observationRowSelect,
        take: 12,
        where: {
            AND: [
                where,
                {
                    status: {
                        isFinal: false,
                    },
                    OR: [
                        {
                            dueDate: {
                                lt: today,
                            },
                        },
                        {
                            riskLevel: {
                                key: {
                                    in: [...CRITICAL_RISK_KEYS],
                                },
                            },
                        },
                    ],
                },
            ],
        },
    });
    return rows
        .map((row) => mapObservationRow(row, today))
        .sort((left, right) => {
        if (left.isOverdue !== right.isOverdue) {
            return left.isOverdue ? -1 : 1;
        }
        return new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime();
    })
        .slice(0, 8);
};
const getUpcomingCommitments = async (access, today, dueThreshold) => {
    const where = buildCommitmentWhere(access);
    const rows = await dashboardPrisma.commitment.findMany({
        orderBy: [
            {
                dueDate: "asc",
            },
            {
                updatedAt: "desc",
            },
        ],
        select: commitmentRowSelect,
        take: 8,
        where: {
            AND: [
                where,
                {
                    dueDate: {
                        gte: today,
                        lte: dueThreshold,
                    },
                },
            ],
        },
    });
    return rows
        .filter((row) => isCommitmentUpcoming(row, today, dueThreshold))
        .map((row) => mapCommitmentRow(row, today));
};
const getPendingReviewRows = async (access) => {
    const [progressRows, extensionRows] = await Promise.all([
        dashboardPrisma.progressUpdate.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: progressReviewSelect,
            take: 8,
            where: {
                AND: [
                    buildProgressWhere(access),
                    {
                        status: PENDING_PROGRESS_STATUS,
                    },
                ],
            },
        }),
        dashboardPrisma.deadlineExtensionRequest.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: extensionReviewSelect,
            take: 8,
            where: {
                AND: [
                    buildExtensionWhere(access),
                    {
                        status: {
                            in: [...PENDING_EXTENSION_STATUSES],
                        },
                    },
                ],
            },
        }),
    ]);
    return [
        ...progressRows.map((row) => ({
            areaName: row.observation.area.name,
            href: `/observaciones/${row.observation.id}`,
            id: row.id,
            kind: "PROGRESS",
            responsibleName: row.submittedByUser?.name ?? null,
            sortDate: row.updatedAt.getTime(),
            status: {
                key: row.status,
                name: getProgressStatusLabel(row.status),
            },
            subtitle: `${row.observation.code} · ${getProgressTypeLabel(row.type)} · ${row.progressPercent ?? 0}%`,
            title: row.observation.title,
            updatedAt: row.updatedAt.toISOString(),
        })),
        ...extensionRows.map((row) => ({
            areaName: row.area.name,
            href: `/ampliaciones-plazo/${row.id}`,
            id: row.id,
            kind: "EXTENSION",
            responsibleName: row.requestedByUser?.name ?? null,
            sortDate: row.updatedAt.getTime(),
            status: {
                key: row.status,
                name: getExtensionStatusLabel(row.status),
            },
            subtitle: row.commitment?.title
                ? `${row.observation.code} · ${row.commitment.title}`
                : `${row.observation.code} · Solicitud de observación`,
            title: row.observation.title,
            updatedAt: row.updatedAt.toISOString(),
        })),
    ]
        .sort((left, right) => right.sortDate - left.sortDate)
        .slice(0, 8)
        .map((item) => ({
        areaName: item.areaName,
        href: item.href,
        id: item.id,
        kind: item.kind,
        responsibleName: item.responsibleName,
        status: item.status,
        subtitle: item.subtitle,
        title: item.title,
        updatedAt: item.updatedAt,
    }));
};
const getAreaReviewQueueRows = async (access) => {
    const [progressRows, extensionRows] = await Promise.all([
        dashboardPrisma.progressUpdate.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: progressReviewSelect,
            take: 8,
            where: {
                AND: [
                    buildProgressWhere(access),
                    {
                        status: RETURNED_PROGRESS_STATUS,
                    },
                ],
            },
        }),
        dashboardPrisma.deadlineExtensionRequest.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: extensionReviewSelect,
            take: 8,
            where: {
                AND: [
                    buildExtensionWhere(access),
                    {
                        status: {
                            in: [...ACTIVE_EXTENSION_REQUEST_STATUSES],
                        },
                    },
                ],
            },
        }),
    ]);
    return [
        ...progressRows.map((row) => ({
            areaName: row.observation.area.name,
            href: `/observaciones/${row.observation.id}`,
            id: row.id,
            kind: "PROGRESS",
            responsibleName: row.submittedByUser?.name ?? null,
            sortDate: row.updatedAt.getTime(),
            status: {
                key: row.status,
                name: getProgressStatusLabel(row.status),
            },
            subtitle: `${row.observation.code} · ${getProgressTypeLabel(row.type)}`,
            title: row.observation.title,
            updatedAt: row.updatedAt.toISOString(),
        })),
        ...extensionRows.map((row) => ({
            areaName: row.area.name,
            href: `/ampliaciones-plazo/${row.id}`,
            id: row.id,
            kind: "EXTENSION",
            responsibleName: row.requestedByUser?.name ?? null,
            sortDate: row.updatedAt.getTime(),
            status: {
                key: row.status,
                name: getExtensionStatusLabel(row.status),
            },
            subtitle: row.commitment?.title
                ? `${row.observation.code} · ${row.commitment.title}`
                : `${row.observation.code} · Solicitud activa`,
            title: row.observation.title,
            updatedAt: row.updatedAt.toISOString(),
        })),
    ]
        .sort((left, right) => right.sortDate - left.sortDate)
        .slice(0, 8)
        .map((item) => ({
        areaName: item.areaName,
        href: item.href,
        id: item.id,
        kind: item.kind,
        responsibleName: item.responsibleName,
        status: item.status,
        subtitle: item.subtitle,
        title: item.title,
        updatedAt: item.updatedAt,
    }));
};
const getLatestUpdates = async (access) => {
    const [observationRows, progressRows, extensionRows] = await Promise.all([
        dashboardPrisma.observation.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: latestObservationSelect,
            take: 6,
            where: buildObservationWhere(access),
        }),
        dashboardPrisma.progressUpdate.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: latestProgressSelect,
            take: 6,
            where: buildProgressWhere(access),
        }),
        dashboardPrisma.deadlineExtensionRequest.findMany({
            orderBy: {
                updatedAt: "desc",
            },
            select: latestExtensionSelect,
            take: 6,
            where: buildExtensionWhere(access),
        }),
    ]);
    return [
        ...observationRows.map((row) => ({
            description: `Observación ${row.code} actualizada en ${row.area.name}.`,
            href: `/observaciones/${row.id}`,
            id: row.id,
            kind: "OBSERVATION",
            sortDate: row.updatedAt.getTime(),
            timestamp: row.updatedAt.toISOString(),
            title: row.title,
        })),
        ...progressRows.map((row) => ({
            description: `${getProgressTypeLabel(row.type)} ${getProgressStatusLabel(row.status).toLowerCase()} para ${row.observation.code}.`,
            href: `/observaciones/${row.observation.id}`,
            id: row.id,
            kind: "PROGRESS",
            sortDate: row.updatedAt.getTime(),
            timestamp: row.updatedAt.toISOString(),
            title: row.observation.title,
        })),
        ...extensionRows.map((row) => ({
            description: `Ampliación ${getExtensionStatusLabel(row.status).toLowerCase()} para ${row.observation.code}.`,
            href: `/ampliaciones-plazo/${row.id}`,
            id: row.id,
            kind: "EXTENSION",
            sortDate: row.updatedAt.getTime(),
            timestamp: row.updatedAt.toISOString(),
            title: row.observation.title,
        })),
    ]
        .sort((left, right) => right.sortDate - left.sortDate)
        .slice(0, 8)
        .map((item) => ({
        description: item.description,
        href: item.href,
        id: item.id,
        kind: item.kind,
        timestamp: item.timestamp,
        title: item.title,
    }));
};
const getAssignedObservationCount = async (access) => {
    return dashboardPrisma.observation.count({
        where: {
            AND: [
                {
                    deletedAt: null,
                },
                {
                    OR: [
                        {
                            responsibleUserId: access.userId,
                        },
                        {
                            areaAssignments: {
                                some: {
                                    responsibleUserId: access.userId,
                                },
                            },
                        },
                        {
                            commitments: {
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
                },
            ],
        },
    });
};
const buildDashboardSummary = (preferredDashboard, viewerProfile) => {
    return {
        canViewAreaDashboard: true,
        canViewAuditDashboard: preferredDashboard === "auditoria",
        defaultRoute: preferredDashboard === "auditoria" ? "/dashboard/auditoria" : "/dashboard/area",
        preferredDashboard,
        subtitle: buildSubtitle(preferredDashboard, viewerProfile),
        viewerProfile,
    };
};
export const dashboardService = {
    async getAuditDashboard(access) {
        if (!hasAuditDashboardAccess(access)) {
            throw new AppError("No tiene acceso al dashboard global de Auditoría.", 403);
        }
        const viewerProfile = resolveViewerProfile(access);
        const reminderDaysBeforeDue = await getReminderDaysBeforeDue();
        const today = startOfDay(new Date());
        const dueThreshold = addDays(today, reminderDaysBeforeDue);
        const observationWhere = buildObservationWhere(access);
        const progressWhere = buildProgressWhere(access);
        const extensionWhere = buildExtensionWhere(access);
        const [totalObservations, closedObservations, overdueObservations, upcomingObservations, averageProgress, pendingProgressReviews, pendingExtensions, observationsByRisk, observationsByStatus, observationsByArea, monthlyTrend, topResponsibles, topOverdueAreas, criticalObservations, upcomingCommitments, pendingReviews, latestUpdates,] = await Promise.all([
            dashboardPrisma.observation.count({
                where: observationWhere,
            }),
            dashboardPrisma.observation.count({
                where: {
                    AND: [
                        observationWhere,
                        {
                            status: {
                                isFinal: true,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.observation.count({
                where: {
                    AND: [
                        observationWhere,
                        {
                            dueDate: {
                                lt: today,
                            },
                            status: {
                                isFinal: false,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.observation.count({
                where: {
                    AND: [
                        observationWhere,
                        {
                            dueDate: {
                                gte: today,
                                lte: dueThreshold,
                            },
                            status: {
                                isFinal: false,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.observation.aggregate({
                _avg: {
                    progressPercent: true,
                },
                where: observationWhere,
            }),
            dashboardPrisma.progressUpdate.count({
                where: {
                    AND: [
                        progressWhere,
                        {
                            status: PENDING_PROGRESS_STATUS,
                        },
                    ],
                },
            }),
            dashboardPrisma.deadlineExtensionRequest.count({
                where: {
                    AND: [
                        extensionWhere,
                        {
                            status: {
                                in: [...PENDING_EXTENSION_STATUSES],
                            },
                        },
                    ],
                },
            }),
            getObservationRiskDistribution(access),
            getObservationStatusDistribution(access),
            getObservationAreaDistribution(access),
            getMonthlyTrend(access),
            getTopResponsibles(access),
            getTopOverdueAreas(access, today),
            getCriticalObservations(access, today),
            getUpcomingCommitments(access, today, dueThreshold),
            getPendingReviewRows(access),
            getLatestUpdates(access),
        ]);
        const openObservations = Math.max(0, totalObservations - closedObservations);
        return {
            charts: {
                currentVsOverdue: buildCurrentVsOverdue(openObservations, overdueObservations),
                monthlyTrend,
                observationsByArea,
                observationsByRisk,
                observationsByStatus,
                topOverdueAreas,
                topResponsibles,
            },
            generatedAt: new Date().toISOString(),
            reminderDaysBeforeDue,
            scope: "auditoria",
            subtitle: buildSubtitle("auditoria", viewerProfile),
            summary: {
                averageProgress: formatPercent(averageProgress._avg.progressPercent),
                closedObservations,
                openObservations,
                overdueObservations,
                pendingExtensions,
                pendingProgressReviews,
                pendingReviews: pendingProgressReviews + pendingExtensions,
                totalObservations,
                upcomingObservations,
            },
            tables: {
                criticalObservations,
                latestUpdates,
                pendingReviews,
                upcomingCommitments,
            },
            viewerProfile,
        };
    },
    async getAreaDashboard(access) {
        const viewerProfile = resolveViewerProfile(access);
        const reminderDaysBeforeDue = await getReminderDaysBeforeDue();
        const today = startOfDay(new Date());
        const dueThreshold = addDays(today, reminderDaysBeforeDue);
        const observationWhere = buildObservationWhere(access);
        const commitmentWhere = buildCommitmentWhere(access);
        const progressWhere = buildProgressWhere(access);
        const extensionWhere = buildExtensionWhere(access);
        const [assignedObservations, areaObservations, openAreaObservations, pendingCommitments, overdueCommitments, upcomingCommitmentsCount, averageProgress, returnedProgressUpdates, extensionsInProcess, observationsByRisk, observationsByStatus, observationsByArea, criticalObservations, upcomingCommitments, reviewQueue, latestUpdates, overdueObservations,] = await Promise.all([
            getAssignedObservationCount(access),
            dashboardPrisma.observation.count({
                where: observationWhere,
            }),
            dashboardPrisma.observation.count({
                where: {
                    AND: [
                        observationWhere,
                        {
                            status: {
                                isFinal: false,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.commitment.count({
                where: {
                    AND: [
                        commitmentWhere,
                        buildIncompleteCommitmentCondition(),
                    ],
                },
            }),
            dashboardPrisma.commitment.count({
                where: {
                    AND: [
                        commitmentWhere,
                        buildIncompleteCommitmentCondition(),
                        {
                            dueDate: {
                                lt: today,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.commitment.count({
                where: {
                    AND: [
                        commitmentWhere,
                        buildIncompleteCommitmentCondition(),
                        {
                            dueDate: {
                                gte: today,
                                lte: dueThreshold,
                            },
                        },
                    ],
                },
            }),
            dashboardPrisma.observation.aggregate({
                _avg: {
                    progressPercent: true,
                },
                where: observationWhere,
            }),
            dashboardPrisma.progressUpdate.count({
                where: {
                    AND: [
                        progressWhere,
                        {
                            status: RETURNED_PROGRESS_STATUS,
                        },
                    ],
                },
            }),
            dashboardPrisma.deadlineExtensionRequest.count({
                where: {
                    AND: [
                        extensionWhere,
                        {
                            status: {
                                in: [...ACTIVE_EXTENSION_REQUEST_STATUSES],
                            },
                        },
                    ],
                },
            }),
            getObservationRiskDistribution(access),
            getObservationStatusDistribution(access),
            getObservationAreaDistribution(access),
            getCriticalObservations(access, today),
            getUpcomingCommitments(access, today, dueThreshold),
            getAreaReviewQueueRows(access),
            getLatestUpdates(access),
            dashboardPrisma.observation.count({
                where: {
                    AND: [
                        observationWhere,
                        {
                            dueDate: {
                                lt: today,
                            },
                            status: {
                                isFinal: false,
                            },
                        },
                    ],
                },
            }),
        ]);
        return {
            charts: {
                currentVsOverdue: buildCurrentVsOverdue(openAreaObservations, overdueObservations),
                observationsByArea,
                observationsByRisk,
                observationsByStatus,
            },
            generatedAt: new Date().toISOString(),
            reminderDaysBeforeDue,
            scope: "area",
            subtitle: buildSubtitle("area", viewerProfile),
            summary: {
                areaObservations,
                assignedObservations,
                averageProgress: formatPercent(averageProgress._avg.progressPercent),
                extensionsInProcess,
                overdueCommitments,
                pendingCommitments,
                returnedProgressUpdates,
                upcomingCommitments: upcomingCommitmentsCount,
            },
            tables: {
                criticalObservations,
                latestUpdates,
                reviewQueue,
                upcomingCommitments,
            },
            viewerProfile,
        };
    },
    async getMySummary(access) {
        const viewerProfile = resolveViewerProfile(access);
        return buildDashboardSummary(hasAuditDashboardAccess(access) ? "auditoria" : "area", viewerProfile);
    },
};
//# sourceMappingURL=dashboard.service.js.map