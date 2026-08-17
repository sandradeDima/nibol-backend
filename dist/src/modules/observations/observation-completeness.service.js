import { prisma } from "../../utils/prisma.js";
const hasPermission = (access, permission) => access.isAdmin || access.permissions.includes(permission);
const actionable = (item, access) => {
    if (!item.permission || hasPermission(access, item.permission))
        return item;
    const result = { ...item };
    delete result.actionLabel;
    delete result.actionType;
    delete result.actionUrl;
    return result;
};
export const buildObservationAttentionWhere = (attention, dueSoonDays = 7, now = new Date()) => {
    const dueSoon = new Date(now);
    dueSoon.setUTCDate(dueSoon.getUTCDate() + dueSoonDays);
    switch (attention) {
        case "DUE_SOON":
            return {
                currentDueDate: { gte: now, lte: dueSoon },
                status: { isFinal: false },
            };
        case "HAS_PENDING":
            return {
                OR: [
                    { risks: { none: {} } },
                    { actionPlans: { none: { deletedAt: null } } },
                    {
                        areaAssignments: {
                            some: {
                                OR: [
                                    { areaResponsibleUserId: { equals: "" } },
                                    { processOwnerUserId: { equals: "" } },
                                ],
                            },
                        },
                    },
                    {
                        evidenceFiles: { none: { context: "FINDING", deletedAt: null } },
                    },
                ],
            };
        case "MISSING_EVIDENCE":
            return {
                evidenceFiles: { none: { context: "FINDING", deletedAt: null } },
            };
        case "MISSING_PLAN":
            return { actionPlans: { none: { deletedAt: null } } };
        case "MISSING_RESPONSIBLE":
            return { areaAssignments: { none: {} } };
        case "OVERDUE":
            return { currentDueDate: { lt: now }, status: { isFinal: false } };
        case "READY_TO_CLOSE":
            return {
                actionPlans: {
                    every: {
                        OR: [{ deletedAt: { not: null } }, { status: "CONCLUDED" }],
                    },
                    some: { deletedAt: null },
                },
                status: { isFinal: false },
            };
    }
};
export const buildObservationActionItems = (context, access, now = new Date()) => {
    if (context.status.isFinal)
        return [];
    const items = [];
    const observationUrl = `/observaciones/${context.id}`;
    if (context.riskCount === 0) {
        items.push({
            actionLabel: "Agregar riesgos",
            actionType: "ADD_RISKS",
            actionUrl: `${observationUrl}/editar#riesgos`,
            code: "RISKS_MISSING",
            label: "Faltan riesgos asociados",
            permission: "observations.edit",
            severity: "WARNING",
        });
    }
    for (const area of context.areaAssignments) {
        if (!area.processOwnerUserId) {
            items.push({
                actionLabel: "Agregar dueño",
                actionType: "ASSIGN_PROCESS_OWNER",
                actionUrl: `${observationUrl}/editar#areas`,
                areaId: area.areaId,
                areaName: area.areaName,
                code: "PROCESS_OWNER_MISSING",
                label: `Falta dueño del proceso en ${area.areaName}`,
                permission: "observation_areas.manage",
                severity: "WARNING",
            });
        }
        if (!area.areaResponsibleUserId) {
            items.push({
                actionLabel: "Agregar responsable",
                actionType: "ASSIGN_AREA_RESPONSIBLE",
                actionUrl: `${observationUrl}/editar#areas`,
                areaId: area.areaId,
                areaName: area.areaName,
                code: "AREA_RESPONSIBLE_MISSING",
                label: `Falta responsable del área ${area.areaName}`,
                permission: "observation_areas.manage",
                severity: "WARNING",
            });
        }
    }
    if (context.actionPlans.length === 0) {
        items.push({
            actionLabel: "Agregar plan",
            actionType: "ADD_ACTION_PLAN",
            actionUrl: `${observationUrl}#planes-accion`,
            code: "ACTION_PLAN_MISSING",
            label: "Falta un plan de acción",
            permission: "action_plans.create",
            severity: "WARNING",
        });
    }
    if (context.findingEvidenceCount === 0) {
        items.push({
            actionLabel: "Subir evidencia",
            actionType: "ADD_FINDING_EVIDENCE",
            actionUrl: `${observationUrl}#evidencia-hallazgo`,
            code: "FINDING_EVIDENCE_MISSING",
            label: "Falta evidencia del hallazgo",
            permission: "finding_evidence.upload",
            severity: "WARNING",
        });
    }
    if (context.pendingReviewCount > 0) {
        items.push({
            actionLabel: "Revisar avances",
            actionType: "REVIEW_PROGRESS",
            actionUrl: `/avances-evidencias?filter.observationId=${context.id}&filter.reviewStatus=SENT_TO_AUDIT`,
            code: "PROGRESS_REVIEW_PENDING",
            label: `${context.pendingReviewCount} avance${context.pendingReviewCount === 1 ? "" : "s"} pendiente${context.pendingReviewCount === 1 ? "" : "s"} de revisión`,
            permission: "progress_evaluations.review",
            severity: "INFO",
        });
    }
    if (context.currentDueDate.getTime() < now.getTime()) {
        items.unshift({
            actionLabel: "Solicitar ampliación",
            actionType: "REQUEST_EXTENSION",
            actionUrl: `${observationUrl}#ampliaciones`,
            code: "OVERDUE",
            label: "La fecha límite está vencida",
            permission: "extension_requests.create",
            severity: "CRITICAL",
        });
    }
    const allConcluded = context.actionPlans.length > 0 &&
        context.actionPlans.every((plan) => plan.status === "CONCLUDED");
    if (allConcluded && context.pendingReviewCount === 0) {
        items.push({
            actionLabel: "Solicitar cierre",
            actionType: "REQUEST_CLOSURE",
            actionUrl: `${observationUrl}#cierre-observacion`,
            code: "READY_TO_CLOSE",
            label: "La observación está lista para revisión de cierre",
            permission: "observations.close",
            severity: "INFO",
        });
    }
    const rank = { CRITICAL: 3, INFO: 1, WARNING: 2 };
    return items
        .map((item) => actionable(item, access))
        .sort((left, right) => rank[right.severity] - rank[left.severity]);
};
export const buildObservationActionSummary = (items) => {
    const rank = { CRITICAL: 3, INFO: 1, WARNING: 2 };
    const severity = items.reduce((current, item) => current === "NONE" || rank[item.severity] > rank[current]
        ? item.severity
        : current, "NONE");
    return {
        count: items.length,
        items: items.slice(0, 3),
        primaryAction: items.find((item) => item.actionLabel) ?? null,
        severity,
        status: items.some((item) => item.code === "OVERDUE")
            ? "OVERDUE"
            : items.length
                ? "ATTENTION"
                : "COMPLETE",
    };
};
const loadContexts = async (observations) => {
    const ids = observations.map((observation) => observation.id);
    const [actionPlans, findingEvidence, pendingReviews] = await Promise.all([
        prisma.actionPlan.findMany({
            select: {
                currentDueDate: true,
                id: true,
                observationAreaId: true,
                observationId: true,
                progressPercent: true,
                responsibleUserId: true,
                status: true,
            },
            where: { deletedAt: null, observationId: { in: ids } },
        }),
        prisma.evidenceFile.groupBy({
            _count: { _all: true },
            by: ["observationId"],
            where: {
                context: "FINDING",
                deletedAt: null,
                observationId: { in: ids },
            },
        }),
        prisma.progressEvaluation.findMany({
            select: { actionPlan: { select: { observationId: true } } },
            where: {
                actionPlan: { observationId: { in: ids } },
                deletedAt: null,
                reviewStatus: "SENT_TO_AUDIT",
            },
        }),
    ]);
    const evidenceCounts = new Map(findingEvidence.map((row) => [row.observationId, row._count._all]));
    const pendingCounts = new Map();
    for (const row of pendingReviews) {
        pendingCounts.set(row.actionPlan.observationId, (pendingCounts.get(row.actionPlan.observationId) ?? 0) + 1);
    }
    return new Map(observations.map((observation) => [
        observation.id,
        {
            ...observation,
            actionPlans: actionPlans.filter((actionPlan) => actionPlan.observationId === observation.id),
            findingEvidenceCount: evidenceCounts.get(observation.id) ?? 0,
            pendingReviewCount: pendingCounts.get(observation.id) ?? 0,
        },
    ]));
};
export const observationCompletenessService = {
    async getForObservation(observation, access) {
        const contexts = await loadContexts([observation]);
        const context = contexts.get(observation.id);
        return context ? buildObservationActionItems(context, access) : [];
    },
    async getSummaries(observations, access) {
        const contexts = await loadContexts(observations);
        return new Map(observations.map((observation) => {
            const context = contexts.get(observation.id);
            const items = context
                ? buildObservationActionItems(context, access)
                : [];
            return [observation.id, buildObservationActionSummary(items)];
        }));
    },
};
//# sourceMappingURL=observation-completeness.service.js.map