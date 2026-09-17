import { buildObservationUrl } from "../../utils/observation-links.js";
import { buildActionPlanScopeWhere, buildExtensionRequestScopeWhere, buildObservationAreaScopeWhere, buildObservationScopeWhere, buildProgressEvaluationScopeWhere, } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { getActionPlanDeadlineStatus, getBusinessDateKey, getDateOnlyKey, getEffectiveActionPlanDueDate, getOfficialActionPlanProgress, isApprovedDeadlineExtension, } from "../reports/reporting-definitions.js";
const DAY = 86_400_000;
const userSelect = { email: true, id: true, name: true };
const viewerProfile = (access) => {
    if (access.roleCode === "SYSTEM_ADMIN")
        return "ADMIN";
    if (access.roleCode === "AUDITOR" || access.roleCode === "AUDIT_CHIEF")
        return "AUDIT";
    if (access.roleCode === "PROCESS_OWNER")
        return "MANAGEMENT";
    if (access.roleCode === "AREA_RESPONSIBLE" || access.roleCode === "EXECUTOR")
        return "EXECUTOR";
    return "GENERAL";
};
const canViewAudit = (access) => {
    const profile = viewerProfile(access);
    return (["ADMIN", "SYSTEMS", "AUDIT"].includes(profile) ||
        access.permissions.includes("reports.view"));
};
const displayCode = (record) => `${record.auditReport.reportNumber} / OBS-${String(record.observationNumber).padStart(3, "0")}`;
const statusLabel = (value) => ({
    NOT_STARTED: "No iniciado",
    STARTED: "Iniciado",
    WITH_PROGRESS: "Con avance",
    CONCLUDED: "Concluido",
    SENT_TO_AUDIT: "En revisión",
    RETURNED: "Devuelto",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
})[value] ?? value.replaceAll("_", " ");
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
};
const buildObservationInclude = (access) => ({
    ...observationInclude,
    areaAssignments: {
        ...observationInclude.areaAssignments,
        where: buildObservationAreaScopeWhere(access),
    },
});
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
};
const observationRow = (record, now) => ({
    area: record.areaAssignments[0]?.area ?? { id: "", name: "Sin área" },
    code: displayCode(record),
    dueDate: record.currentDueDate.toISOString(),
    href: buildObservationUrl(record.id),
    id: record.id,
    isOverdue: !record.status.isFinal && record.currentDueDate.getTime() < now.getTime(),
    progressPercent: record.progressPercent,
    responsibleUser: record.areaAssignments[0]?.areaResponsible ?? null,
    riskLevel: record.riskLevel,
    status: { key: record.status.key, name: record.status.name },
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
});
const actionPlanRow = (record, now, timeZone) => {
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
        reprogrammed: Boolean(record.deadlineExtensionRequests.find(isApprovedDeadlineExtension)),
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
const distribution = (records, getKey, getLabel) => {
    const values = new Map();
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
const load = async (access) => {
    const now = new Date();
    const days = await reminderDays();
    const observationWhere = buildObservationScopeWhere(access);
    const [observations, actionPlans, evaluations, extensions, setting] = await Promise.all([
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
const buildReviewRows = (data) => [
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
        kind: "PROGRESS",
        responsibleName: item.submittedByUser.name,
        status: { key: item.reviewStatus, name: "Pendiente de Auditoría" },
        subtitle: `${displayCode(item.actionPlan.observation)} · ${item.actionPlan.progressPercent}%`,
        title: item.actionPlan.description,
        updatedAt: item.updatedAt.toISOString(),
    })),
    ...data.extensions
        .filter((item) => ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status))
        .map((item) => {
        const observation = item.observation ?? item.actionPlan.observation;
        return {
            areaName: item.observationArea?.area.name ?? "Varias áreas",
            href: buildObservationUrl(observation.id, {
                extensionId: item.id,
                ...(item.actionPlan?.id ? { planId: item.actionPlan.id } : {}),
                tab: "plans",
            }),
            id: item.id,
            kind: "EXTENSION",
            responsibleName: item.requestedByUser.name,
            status: {
                key: item.status,
                name: item.status === "SENT_TO_MANAGER"
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
const latestRows = (data) => [
    ...data.observations.slice(0, 6).map((item) => ({
        description: `Observación ${item.status.name.toLowerCase()} con ${item.progressPercent}% de avance.`,
        href: buildObservationUrl(item.id),
        id: item.id,
        kind: "OBSERVATION",
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
        kind: "PROGRESS",
        timestamp: item.updatedAt.toISOString(),
        title: `${displayCode(item.actionPlan.observation)} · ${item.actionPlan.progressPercent}%`,
    })),
]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);
const common = async (access) => {
    const data = await load(access);
    const dueThreshold = new Date(data.now.getTime() + data.days * DAY);
    const open = data.observations.filter((item) => !item.status.isFinal);
    const overdue = open.filter((item) => item.currentDueDate < data.now);
    const upcomingObservations = open.filter((item) => item.currentDueDate >= data.now && item.currentDueDate <= dueThreshold);
    const openPlans = data.actionPlans.filter((item) => item.status !== "CONCLUDED");
    const planRowsById = new Map(data.actionPlans.map((item) => [
        item.id,
        actionPlanRow(item, data.now, data.timeZone),
    ]));
    const todayKey = getBusinessDateKey(data.now, data.timeZone);
    const planDueSoonEnd = new Date(`${todayKey}T00:00:00.000Z`);
    planDueSoonEnd.setUTCDate(planDueSoonEnd.getUTCDate() + data.days);
    const planDueSoonEndKey = getDateOnlyKey(planDueSoonEnd);
    const upcomingPlans = openPlans.filter((item) => {
        const row = planRowsById.get(item.id);
        const dueDateKey = getDateOnlyKey(new Date(row.effectiveDueDate));
        return (row.deadlineStatus === "VIGENTE" &&
            dueDateKey >= todayKey &&
            dueDateKey <= planDueSoonEndKey);
    });
    const overduePlans = openPlans.filter((item) => planRowsById.get(item.id)?.deadlineStatus === "VENCIDO");
    const averageProgress = data.observations.length
        ? Math.round(data.observations.reduce((sum, item) => sum + item.progressPercent, 0) /
            data.observations.length)
        : 0;
    const byArea = distribution(data.observations.flatMap((item) => item.areaAssignments.map((area) => ({ area }))), (item) => item.area.area.id, (item) => item.area.area.name);
    const byRisk = distribution(data.observations, (item) => item.riskLevel.key, (item) => item.riskLevel.name);
    const byStatus = distribution(data.observations, (item) => item.status.key, (item) => item.status.name);
    const critical = data.observations
        .filter((item) => item.riskLevel.key === "ALTO" && !item.status.isFinal)
        .sort((a, b) => a.currentDueDate.getTime() - b.currentDueDate.getTime())
        .slice(0, 10)
        .map((item) => observationRow(item, data.now));
    const planRows = upcomingPlans
        .slice(0, 10)
        .map((item) => planRowsById.get(item.id));
    const planReporting = {
        charts: {
            byArea: distribution(data.actionPlans, (item) => item.observationArea.area.id, (item) => item.observationArea.area.name),
            byDeadline: [
                {
                    key: "VIGENTE",
                    label: "Vigentes",
                    value: data.actionPlans.length - overduePlans.length,
                },
                { key: "VENCIDO", label: "Vencidos", value: overduePlans.length },
            ],
            byExecutor: distribution(data.actionPlans, (item) => item.responsibleUser.id, (item) => item.responsibleUser.name),
            byProcessOwner: distribution(data.actionPlans, (item) => item.observationArea.processOwner?.id ?? "unassigned", (item) => item.observationArea.processOwner?.name ?? "Sin asignar"),
            byProgress: ["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"].map((status) => ({
                key: status,
                label: getOfficialActionPlanProgress(status).label,
                value: data.actionPlans.filter((item) => item.status === status)
                    .length,
            })),
            byReprogrammed: [
                {
                    key: "SI",
                    label: "Sí",
                    value: data.actionPlans.filter((item) => item.deadlineExtensionRequests.some(isApprovedDeadlineExtension)).length,
                },
                {
                    key: "NO",
                    label: "No",
                    value: data.actionPlans.filter((item) => !item.deadlineExtensionRequests.some(isApprovedDeadlineExtension)).length,
                },
            ],
            byRisk: distribution(data.actionPlans, (item) => item.observation.riskLevel.key, (item) => item.observation.riskLevel.name),
        },
        summary: {
            conAvance: data.actionPlans.filter((item) => item.status === "WITH_PROGRESS").length,
            concluido: data.actionPlans.filter((item) => item.status === "CONCLUDED")
                .length,
            iniciado: data.actionPlans.filter((item) => item.status === "STARTED")
                .length,
            noIniciado: data.actionPlans.filter((item) => item.status === "NOT_STARTED").length,
            reprogramados: data.actionPlans.filter((item) => item.deadlineExtensionRequests.some(isApprovedDeadlineExtension)).length,
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
const operationalAttention = (value, access) => [...value.data.observations]
    .filter((item) => !item.status.isFinal)
    .sort((a, b) => {
    const rank = (item) => {
        if (item.currentDueDate < value.data.now)
            return 0;
        if (item.currentDueDate >= value.data.now &&
            item.currentDueDate <=
                new Date(value.data.now.getTime() + value.data.days * DAY))
            return 1;
        if (["INICIADO", "CON_AVANCE"].includes(item.status.key))
            return 2;
        return 3;
    };
    return (rank(a) - rank(b) ||
        a.currentDueDate.getTime() - b.currentDueDate.getTime() ||
        b.updatedAt.getTime() - a.updatedAt.getTime());
})
    .slice(0, 4)
    .map((item) => {
    const row = observationRow(item, value.data.now);
    const filters = new URLSearchParams({
        "filter.observationState": "PENDING",
    });
    const area = item.areaAssignments[0];
    if (area?.areaId)
        filters.set("filter.areaId", area.areaId);
    if (access.roleCode === "AREA_RESPONSIBLE") {
        filters.set("filter.areaResponsibleUserId", access.userId);
    }
    if (access.roleCode === "EXECUTOR") {
        filters.set("filter.actionPlanResponsibleUserId", access.userId);
    }
    return { ...row, href: `/observaciones?${filters.toString()}` };
});
const roleDashboardRoles = new Set([
    "AREA_RESPONSIBLE",
    "EXECUTOR",
    "PROCESS_OWNER",
]);
const roleActionPlanWhere = (access, query) => ({
    deletedAt: null,
    ...(access.roleCode === "EXECUTOR"
        ? { responsibleUserId: access.userId }
        : query.executorId?.length
            ? { responsibleUserId: { in: query.executorId } }
            : {}),
});
const roleObservationAreaWhere = (access, query) => ({
    ...buildObservationAreaScopeWhere(access),
    ...(query.areaId ? { areaId: query.areaId } : {}),
    ...(access.roleCode === "PROCESS_OWNER" && query.areaResponsibleUserId?.length
        ? { areaResponsibleUserId: { in: query.areaResponsibleUserId } }
        : {}),
    ...(access.roleCode !== "EXECUTOR" && query.executorId?.length
        ? {
            actionPlans: {
                some: {
                    deletedAt: null,
                    responsibleUserId: { in: query.executorId },
                },
            },
        }
        : {}),
});
const roleObservationWhere = (access, query) => {
    const areaWhere = roleObservationAreaWhere(access, query);
    const actionPlanWhere = roleActionPlanWhere(access, query);
    const search = query.search.trim();
    return {
        ...buildObservationScopeWhere(access),
        AND: [
            { areaAssignments: { some: areaWhere } },
            ...(query.observationState
                ? [
                    {
                        status: { isFinal: query.observationState === "CONCLUDED" },
                    },
                ]
                : []),
            ...(search
                ? [
                    {
                        OR: [
                            { title: { contains: search } },
                            { description: { contains: search } },
                            { auditRecommendation: { contains: search } },
                            { auditReport: { reportNumber: { contains: search } } },
                            { auditReport: { title: { contains: search } } },
                            {
                                areaAssignments: {
                                    some: {
                                        ...areaWhere,
                                        area: { name: { contains: search } },
                                    },
                                },
                            },
                            {
                                areaAssignments: {
                                    some: {
                                        ...areaWhere,
                                        areaResponsible: { name: { contains: search } },
                                    },
                                },
                            },
                            {
                                areaAssignments: {
                                    some: {
                                        ...areaWhere,
                                        actionPlans: {
                                            some: {
                                                ...actionPlanWhere,
                                                description: { contains: search },
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                areaAssignments: {
                                    some: {
                                        ...areaWhere,
                                        actionPlans: {
                                            some: {
                                                ...actionPlanWhere,
                                                responsibleUser: { name: { contains: search } },
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                ]
                : []),
        ],
    };
};
const roleObservationInclude = (access, query) => ({
    areaAssignments: {
        include: {
            actionPlans: {
                select: {
                    id: true,
                    responsibleUser: { select: { id: true, name: true } },
                },
                where: roleActionPlanWhere(access, query),
            },
            area: { select: { id: true, name: true } },
            areaResponsible: { select: { id: true, name: true } },
        },
        where: roleObservationAreaWhere(access, query),
    },
    auditReport: { select: { reportNumber: true } },
    status: { select: { isFinal: true, key: true, name: true } },
});
const roleAssignmentSelect = {
    actionPlans: {
        select: {
            id: true,
            responsibleUser: { select: { id: true, name: true } },
        },
        where: { deletedAt: null },
    },
    area: { select: { id: true, name: true } },
    areaResponsible: { select: { id: true, name: true } },
};
const roleOption = (record) => ({
    id: record.id,
    name: record.name,
});
const uniqueRoleOptions = (records) => [
    ...new Map(records.map((record) => [record.id, roleOption(record)])).values(),
].sort((left, right) => left.name.localeCompare(right.name, "es"));
const relevantPlans = (assignment, access) => access.roleCode === "EXECUTOR"
    ? assignment.actionPlans.filter((plan) => plan.responsibleUser.id === access.userId)
    : assignment.actionPlans;
const roleDashboardContextParams = (query) => {
    const params = new URLSearchParams();
    if (query.areaId)
        params.set("filter.areaId", query.areaId);
    if (query.areaResponsibleUserId?.length)
        params.set("filter.areaResponsibleUserId", query.areaResponsibleUserId.join(","));
    if (query.executorId?.length)
        params.set("filter.actionPlanResponsibleUserId", query.executorId.join(","));
    if (query.observationState)
        params.set("filter.observationState", query.observationState);
    return params;
};
const observationsHref = (query, extra = {}) => {
    const params = roleDashboardContextParams(query);
    if (query.search)
        params.set("search", query.search);
    Object.entries(extra).forEach(([key, value]) => params.set(key, value));
    return `/observaciones?${params.toString()}`;
};
const extensionRequestsHref = (query) => {
    const params = new URLSearchParams({
        "filter.status": "SENT_TO_MANAGER",
    });
    if (query.areaId)
        params.set("filter.areaId", query.areaId);
    return `/ampliaciones-plazo?${params.toString()}`;
};
const progressReviewsHref = (query) => {
    const params = new URLSearchParams({
        "filter.reviewStatus": "SENT_TO_AUDIT",
    });
    if (query.areaId)
        params.set("filter.areaId", query.areaId);
    return `/avances-evidencias?${params.toString()}`;
};
const emptyRoleAggregate = () => ({
    concluded: new Set(),
    pending: new Set(),
    total: new Set(),
});
const emptyRoleBucket = (id, name) => ({
    aggregate: emptyRoleAggregate(),
    children: new Map(),
    id,
    name,
});
const addToRoleAggregate = (aggregate, record) => {
    aggregate.total.add(record.id);
    if (record.status.isFinal)
        aggregate.concluded.add(record.id);
    else
        aggregate.pending.add(record.id);
};
const getRoleChild = (bucket, id, name) => {
    const current = bucket.children.get(id);
    if (current)
        return current;
    const next = emptyRoleBucket(id, name);
    bucket.children.set(id, next);
    return next;
};
export const getRoleDashboardStatus = (pending, concluded) => {
    if (pending > 0 && concluded > 0)
        return { key: "MIXED", name: "Mixto" };
    if (concluded > 0)
        return { key: "CONCLUDED", name: "Concluida" };
    return { key: "PENDING", name: "Pendiente" };
};
const roleAggregateValues = (aggregate) => {
    const pending = aggregate.pending.size;
    const concluded = aggregate.concluded.size;
    return {
        concluded,
        pending,
        status: getRoleDashboardStatus(pending, concluded),
        total: aggregate.total.size,
    };
};
const sortedRoleChildren = (bucket) => [...bucket.children.values()].sort((left, right) => left.name.localeCompare(right.name, "es"));
const buildRoleDashboardHierarchy = (records, roleCode) => {
    const areas = new Map();
    for (const record of records) {
        for (const assignment of record.areaAssignments) {
            const area = areas.get(assignment.area.id) ??
                emptyRoleBucket(assignment.area.id, assignment.area.name);
            areas.set(assignment.area.id, area);
            addToRoleAggregate(area.aggregate, record);
            const plans = assignment.actionPlans;
            if (roleCode === "PROCESS_OWNER") {
                const responsible = getRoleChild(area, assignment.areaResponsible.id, assignment.areaResponsible.name);
                addToRoleAggregate(responsible.aggregate, record);
                for (const plan of plans) {
                    const executor = getRoleChild(responsible, plan.responsibleUser.id, plan.responsibleUser.name);
                    addToRoleAggregate(executor.aggregate, record);
                }
            }
            else if (plans.length) {
                for (const plan of plans) {
                    const executor = getRoleChild(area, plan.responsibleUser.id, plan.responsibleUser.name);
                    addToRoleAggregate(executor.aggregate, record);
                }
            }
            else if (roleCode === "AREA_RESPONSIBLE") {
                const executor = getRoleChild(area, "unassigned", "Sin ejecutor");
                addToRoleAggregate(executor.aggregate, record);
            }
        }
    }
    const toExecutor = (bucket) => ({
        ...roleAggregateValues(bucket.aggregate),
        id: bucket.id,
        name: bucket.name,
    });
    const toResponsible = (bucket) => ({
        ...roleAggregateValues(bucket.aggregate),
        executors: sortedRoleChildren(bucket).map(toExecutor),
        id: bucket.id,
        name: bucket.name,
    });
    return [...areas.values()]
        .sort((left, right) => left.name.localeCompare(right.name, "es"))
        .map((area) => ({
        ...roleAggregateValues(area.aggregate),
        ...(roleCode === "PROCESS_OWNER"
            ? { responsibles: sortedRoleChildren(area).map(toResponsible) }
            : { executors: sortedRoleChildren(area).map(toExecutor) }),
        id: area.id,
        name: area.name,
    }));
};
const priority = (code, label, count, href) => ({ code, count, href, label });
const quickActions = (access, query) => {
    if (access.roleCode !== "EXECUTOR")
        return [];
    const planParams = new URLSearchParams({
        "filter.responsibleUserId": access.userId,
    });
    if (query.areaId)
        planParams.set("filter.areaId", query.areaId);
    const planHref = `/planes-accion?${planParams.toString()}`;
    return [
        {
            code: "SEND_PROGRESS",
            description: "Registra y envía un nuevo avance.",
            href: planHref,
            label: "Enviar avance",
        },
        {
            code: "UPLOAD_EVIDENCE",
            description: "Adjunta respaldo a un plan de acción.",
            href: planHref,
            label: "Cargar evidencia",
        },
        {
            code: "UPDATE_PLAN",
            description: "Actualiza fechas, descripción o progreso.",
            href: planHref,
            label: "Actualizar plan",
        },
        {
            code: "REQUEST_EXTENSION",
            description: "Solicita una ampliación de plazo.",
            href: planHref,
            label: "Solicitar ampliación",
        },
        {
            code: "VIEW_TIMELINE",
            description: "Consulta fechas y próximos hitos.",
            href: "/cronograma",
            label: "Ver cronograma",
        },
    ];
};
export const dashboardService = {
    async getRoleDashboard(access, query) {
        if (!roleDashboardRoles.has(access.roleCode))
            throw new AppError("Este dashboard no está disponible para su rol.", 403);
        const roleCode = access.roleCode;
        const roleQuery = { ...query, search: query.search ?? "" };
        if ((roleCode !== "PROCESS_OWNER" &&
            roleQuery.areaResponsibleUserId?.length) ||
            (roleCode === "EXECUTOR" && roleQuery.executorId?.length))
            throw new AppError("Uno de los filtros no está disponible para su rol.", 403);
        const assignments = await prisma.observationArea.findMany({
            select: roleAssignmentSelect,
            where: {
                ...buildObservationAreaScopeWhere(access),
                area: { deletedAt: null },
                observation: { deletedAt: null },
            },
        });
        const areas = uniqueRoleOptions(assignments.map(({ area }) => area));
        if (roleQuery.areaId && !areas.some((area) => area.id === roleQuery.areaId))
            throw new AppError("El área seleccionada no está dentro de su alcance.", 403);
        const areaAssignments = assignments.filter((assignment) => !roleQuery.areaId || assignment.area.id === roleQuery.areaId);
        const responsibles = roleCode === "PROCESS_OWNER"
            ? uniqueRoleOptions(areaAssignments.map(({ areaResponsible }) => areaResponsible))
            : [];
        if (roleQuery.areaResponsibleUserId?.some((selectedId) => !responsibles.some((responsible) => responsible.id === selectedId)))
            throw new AppError("El responsable seleccionado no está dentro de su alcance.", 403);
        const executors = uniqueRoleOptions(areaAssignments.flatMap((assignment) => relevantPlans(assignment, access).map(({ responsibleUser }) => responsibleUser)));
        if (roleQuery.executorId?.some((selectedId) => !executors.some((executor) => executor.id === selectedId)))
            throw new AppError("El ejecutor seleccionado no está dentro de su alcance.", 403);
        const [observations, globalObservations] = await Promise.all([
            prisma.observation.findMany({
                include: roleObservationInclude(access, roleQuery),
                orderBy: { updatedAt: "desc" },
                where: roleObservationWhere(access, roleQuery),
            }),
            prisma.observation.findMany({
                select: { status: { select: { isFinal: true } } },
                where: roleObservationWhere(access, { search: "" }),
            }),
        ]);
        const observationIds = observations.map(({ id }) => id);
        const observationAreaIds = observations.flatMap((observation) => observation.areaAssignments.map(({ id }) => id));
        const actionPlanIds = observations.flatMap((observation) => observation.areaAssignments.flatMap((assignment) => assignment.actionPlans.map(({ id }) => id)));
        const [pendingExtensions, pendingReviews] = await Promise.all([
            prisma.deadlineExtensionRequest.count({
                where: {
                    AND: [
                        buildExtensionRequestScopeWhere(access),
                        { status: "SENT_TO_MANAGER" },
                        {
                            OR: [
                                { actionPlanId: { in: actionPlanIds } },
                                { observationAreaId: { in: observationAreaIds } },
                                { observationId: { in: observationIds } },
                            ],
                        },
                    ],
                },
            }),
            prisma.progressEvaluation.count({
                where: {
                    AND: [
                        buildProgressEvaluationScopeWhere(access),
                        { actionPlanId: { in: actionPlanIds } },
                        { reviewStatus: "SENT_TO_AUDIT" },
                    ],
                },
            }),
        ]);
        const now = new Date();
        const pendingObservations = observations.filter((observation) => !observation.status.isFinal);
        const concludedObservations = observations.filter((observation) => observation.status.isFinal);
        const globalPendingObservations = globalObservations.filter((observation) => !observation.status.isFinal).length;
        const overdueObservations = pendingObservations.filter((observation) => observation.currentDueDate < now).length;
        const priorities = roleCode === "EXECUTOR"
            ? []
            : [
                priority("OVERDUE", "Vencidas", overdueObservations, observationsHref(roleQuery, {
                    "filter.deadlineStatus": "VENCIDO",
                    "filter.observationState": "PENDING",
                })),
                priority("PENDING_EXTENSIONS", "Ampliaciones pendientes", pendingExtensions, extensionRequestsHref(roleQuery)),
                priority("PENDING_REVIEWS", "Avances pendientes de revisión", pendingReviews, progressReviewsHref(roleQuery)),
            ];
        return {
            areas,
            filters: { executors, responsibles },
            generatedAt: now.toISOString(),
            globalSummary: {
                concludedObservations: globalObservations.length - globalPendingObservations,
                pendingObservations: globalPendingObservations,
                totalObservations: globalObservations.length,
            },
            hierarchy: buildRoleDashboardHierarchy(observations, roleCode),
            priorities,
            quickActions: quickActions(access, roleQuery),
            roleCode,
            selectedAreaId: roleQuery.areaId ?? null,
            selectedExecutorId: roleQuery.executorId?.[0] ?? null,
            selectedExecutorIds: roleQuery.executorId ?? [],
            selectedObservationState: roleQuery.observationState ?? null,
            selectedResponsibleId: roleQuery.areaResponsibleUserId?.[0] ?? null,
            selectedResponsibleIds: roleQuery.areaResponsibleUserId ?? [],
            summary: {
                concludedObservations: concludedObservations.length,
                pendingObservations: pendingObservations.length,
                totalObservations: observations.length,
            },
        };
    },
    async getMySummary(access) {
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
    async getOperationalDashboard(access) {
        const value = await common(access);
        const todayKey = getBusinessDateKey(value.data.now, value.data.timeZone);
        const dueSoonEnd = new Date(`${todayKey}T00:00:00.000Z`);
        dueSoonEnd.setUTCDate(dueSoonEnd.getUTCDate() + value.data.days);
        const dueSoonEndKey = getDateOnlyKey(dueSoonEnd);
        const pendingProgress = value.data.evaluations.filter((item) => item.reviewStatus === "SENT_TO_AUDIT").length;
        const pendingExtensions = value.data.extensions.filter((item) => ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status)).length;
        return {
            attention: operationalAttention(value, access),
            generatedAt: value.data.now.toISOString(),
            links: {
                allObservations: "/observaciones",
                concludedObservations: "/observaciones?filter.observationState=CONCLUDED",
                inProgressObservations: "/observaciones?filter.observationState=PENDING",
                overdueObservations: "/observaciones?filter.deadlineStatus=VENCIDO",
                pendingObservations: "/observaciones?filter.observationState=PENDING",
                pendingApprovals: "/aprobaciones/pendientes",
                pendingExtensions: "/ampliaciones-plazo?filter.status=SENT_TO_MANAGER",
                pendingProgressReviews: "/avances-evidencias?filter.reviewStatus=SENT_TO_AUDIT",
                upcomingObservations: `/observaciones?filter.currentDueDateFrom=${todayKey}&filter.currentDueDateTo=${dueSoonEndKey}`,
            },
            reminderDaysBeforeDue: value.data.days,
            summary: {
                concludedObservations: value.data.observations.filter((item) => item.status.isFinal).length,
                inProgressObservations: value.data.observations.filter((item) => !item.status.isFinal &&
                    ["INICIADO", "CON_AVANCE"].includes(item.status.key)).length,
                overdueObservations: value.overdue.length,
                pendingObservations: value.open.length,
                pendingApprovals: pendingProgress + pendingExtensions,
                pendingExtensions,
                pendingProgressReviews: pendingProgress,
                totalObservations: value.data.observations.length,
                upcomingObservations: value.upcomingObservations.length,
            },
        };
    },
    async getAuditDashboard(access) {
        const value = await common(access);
        const closed = value.data.observations.filter((item) => item.status.isFinal).length;
        const reviews = buildReviewRows(value.data);
        const topResponsibles = distribution(value.data.actionPlans, (item) => item.responsibleUser.id, (item) => item.responsibleUser.name)
            .slice(0, 8)
            .map((item) => ({ id: item.key, label: item.label, value: item.value }));
        const months = new Map();
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
                if (item.status.isFinal)
                    month.closed += 1;
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
            subtitle: "Panorama corporativo normalizado por informe, observación, área y plan.",
            summary: {
                averageProgress: value.averageProgress,
                closedObservations: closed,
                openObservations: value.open.length,
                overdueObservations: value.overdue.length,
                pendingExtensions: value.data.extensions.filter((item) => ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status)).length,
                pendingProgressReviews: value.data.evaluations.filter((item) => item.reviewStatus === "SENT_TO_AUDIT").length,
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
    async getAreaDashboard(access) {
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
                extensionsInProcess: value.data.extensions.filter((item) => ["SENT_TO_MANAGER", "SENT_TO_AUDIT"].includes(item.status)).length,
                overdueActionPlans: value.overduePlans.length,
                pendingActionPlans: value.data.actionPlans.filter((item) => item.status === "NOT_STARTED").length,
                returnedProgressEvaluations: value.data.evaluations.filter((item) => item.reviewStatus === "RETURNED").length,
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
//# sourceMappingURL=dashboard.service.js.map