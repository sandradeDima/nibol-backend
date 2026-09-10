import { createHash } from "node:crypto";
import { NotificationDeliveryChannel, NotificationDeliveryStatus, } from "../../../generated/prisma/client.js";
import { authorizationService, buildActionPlanScopeWhere, buildObservationAreaScopeWhere, buildObservationScopeWhere, } from "../../services/authorization-service.js";
import { notificationService } from "../../services/notification-service.js";
import { emailService } from "../../emails/EmailService.js";
import { env } from "../../utils/env.js";
import { AppError } from "../../utils/app-error.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../utils/prisma.js";
import { observationAggregationService } from "./observation-aggregation.service.js";
import { observationDeadlineService } from "./observation-deadline.service.js";
const userSummarySelect = {
    email: true,
    id: true,
    jobTitle: true,
    name: true,
};
export const nextAvailableObservationNumber = (usedNumbers) => {
    const used = new Set(usedNumbers);
    let next = 1;
    while (used.has(next))
        next += 1;
    return next;
};
export const formatRiskLevelMaxPeriods = (levels) => [...levels]
    .filter((level) => Number.isInteger(level.maxRemediationDays) &&
    (level.maxRemediationDays ?? 0) > 0)
    .sort((left, right) => (left.severityOrder ?? Number.MAX_SAFE_INTEGER) -
    (right.severityOrder ?? Number.MAX_SAFE_INTEGER))
    .map((level) => `${level.name}: ${level.maxRemediationDays} días`)
    .join(" · ");
export const buildObservationSendOperationId = (ids) => createHash("sha256")
    .update([...new Set(ids)].sort().join(":"))
    .digest("hex");
export const buildObservationSendDedupeKey = (operationId, userId, channel) => `observation-send:${operationId}:${userId}:${channel}`;
export const canSendObservation = (sentAt) => !sentAt;
export const buildObservationAssignmentGroups = (records, maxPeriods) => {
    const groups = new Map();
    for (const record of records) {
        for (const assignment of record.areaAssignments) {
            const recipients = [
                assignment.processOwner,
                assignment.areaResponsible,
                ...assignment.actionPlans.map((plan) => plan.responsibleUser),
            ];
            for (const recipient of recipients) {
                const email = recipient.email.trim().toLowerCase();
                if (!email)
                    continue;
                const group = groups.get(email) ?? {
                    email: recipient.email.trim(),
                    maxPeriods,
                    name: recipient.name,
                    observationIds: new Set(),
                    reports: new Map(),
                    userId: recipient.id,
                };
                const report = group.reports.get(record.auditReport.id) ?? {
                    areaNames: new Set(),
                    observations: new Map(),
                    reportNumber: record.auditReport.reportNumber,
                    reportTitle: record.auditReport.title,
                };
                group.observationIds.add(record.id);
                report.areaNames.add(assignment.area.name);
                const observation = report.observations.get(record.id) ?? {
                    areaNames: new Set(),
                    description: record.description,
                    dueDate: record.currentDueDate?.toISOString().slice(0, 10),
                    number: record.observationNumber,
                    risk: record.riskLevel.name,
                    title: record.title,
                };
                observation.areaNames.add(assignment.area.name);
                report.observations.set(record.id, observation);
                group.reports.set(record.auditReport.id, report);
                groups.set(email, group);
            }
        }
    }
    return [...groups.values()]
        .map((group) => ({
        email: group.email,
        maxPeriods: group.maxPeriods,
        name: group.name,
        observationIds: [...group.observationIds].sort(),
        userId: group.userId,
        reports: [...group.reports.values()]
            .sort((left, right) => left.reportNumber.localeCompare(right.reportNumber))
            .map((report) => ({
            areaNames: [...report.areaNames].sort((left, right) => left.localeCompare(right)),
            observations: [...report.observations.values()].sort((left, right) => left.number - right.number).map((observation) => ({
                area: [...observation.areaNames].join(", "),
                code: `${report.reportNumber}-${observation.number}`,
                description: observation.description,
                ...(observation.dueDate ? { dueDate: observation.dueDate } : {}),
                number: observation.number,
                risk: observation.risk,
                title: observation.title,
            })),
            reportNumber: report.reportNumber,
            reportTitle: report.reportTitle,
        })),
    }))
        .sort((left, right) => left.email.localeCompare(right.email));
};
const buildObservationInclude = (access) => ({
    actionPlans: {
        select: { id: true, progressPercent: true, status: true },
        where: buildActionPlanScopeWhere(access),
    },
    areaAssignments: {
        include: {
            actionPlans: {
                select: { progressPercent: true, status: true },
                where: buildActionPlanScopeWhere(access),
            },
            area: { select: { id: true, name: true } },
            areaResponsible: { select: userSummarySelect },
            processOwner: { select: userSummarySelect },
        },
        orderBy: { area: { name: "asc" } },
        where: buildObservationAreaScopeWhere(access),
    },
    auditReport: {
        select: { id: true, reportDate: true, reportNumber: true, title: true },
    },
    auditorUser: { select: userSummarySelect },
    mainObservation: { select: { id: true, name: true } },
    riskLevel: {
        select: {
            colorToken: true,
            maxRemediationDays: true,
            id: true,
            key: true,
            name: true,
        },
    },
    risks: {
        orderBy: { risk: { name: "asc" } },
        select: { risk: { select: { id: true, name: true } } },
    },
    status: { select: { id: true, isFinal: true, key: true, name: true } },
});
const businessStatusLabel = {
    CONCLUIDO: "Concluido",
    CON_AVANCE: "Con avance",
    INICIADO: "Iniciado",
    NO_INICIADO: "No iniciado",
};
export const buildObservationAccessWhere = buildObservationScopeWhere;
const formatObservation = (record) => {
    const progressPercent = observationAggregationService.calculateProgress(record.actionPlans);
    const businessStatus = observationAggregationService.calculateStatus(record.actionPlans, record.status.isFinal);
    const now = new Date();
    return {
        actionPlanCount: record.actionPlans.length,
        actionPlans: record.actionPlans.map(({ id }) => ({ id })),
        areas: record.areaAssignments.map((assignment) => ({
            area: assignment.area,
            areaResponsible: assignment.areaResponsible,
            id: assignment.id,
            processOwner: assignment.processOwner,
            progressPercent: observationAggregationService.calculateProgress(assignment.actionPlans),
        })),
        auditRecommendation: record.auditRecommendation,
        auditReport: {
            ...record.auditReport,
            reportDate: record.auditReport.reportDate.toISOString(),
        },
        auditorUser: record.auditorUser,
        category: record.category,
        currentDueDate: record.currentDueDate.toISOString(),
        currentStage: record.currentStage,
        description: record.description,
        displayCode: `${record.auditReport.reportNumber} / OBS-${String(record.observationNumber).padStart(3, "0")}`,
        id: record.id,
        sentAt: record.sentAt?.toISOString() ?? null,
        isOverdue: !record.status.isFinal && record.currentDueDate.getTime() < now.getTime(),
        mainObservation: record.mainObservation,
        observationNumber: record.observationNumber,
        originalDueDate: record.originalDueDate.toISOString(),
        process: record.process,
        progressPercent,
        risks: record.risks.map(({ risk }) => risk),
        riskLevel: record.riskLevel,
        source: record.source,
        status: {
            id: record.status.id,
            isFinal: record.status.isFinal,
            key: businessStatus,
            name: businessStatusLabel[businessStatus],
        },
        title: record.title,
        updatedAt: record.updatedAt.toISOString(),
    };
};
const toListItem = (record) => formatObservation(record);
const requireEntities = async (input) => {
    const uniqueUserIds = Array.from(new Set([
        ...(input.auditorUserId ? [input.auditorUserId] : []),
        ...input.areaAssignments.flatMap((row) => [
            row.processOwnerUserId,
            row.areaResponsibleUserId,
        ]),
        ...(input.actionPlans ?? []).map((plan) => plan.responsibleUserId),
    ]));
    const [auditReport, mainObservation, riskLevel, risks, areas, users] = await Promise.all([
        prisma.auditReport.findFirst({
            select: { id: true, reportDate: true },
            where: { deletedAt: null, id: input.auditReportId },
        }),
        prisma.observationDictionary.findFirst({
            select: { id: true },
            where: { id: input.mainObservationId, isActive: true },
        }),
        prisma.riskLevel.findFirst({
            select: { id: true, key: true, maxRemediationDays: true, name: true },
            where: { active: true, deletedAt: null, id: input.riskLevelId },
        }),
        prisma.risk.count({
            where: { id: { in: input.riskIds }, isActive: true },
        }),
        prisma.area.count({
            where: {
                active: true,
                deletedAt: null,
                id: { in: input.areaAssignments.map((row) => row.areaId) },
            },
        }),
        prisma.user.count({
            where: { deletedAt: null, id: { in: uniqueUserIds }, isActive: true },
        }),
    ]);
    if (!auditReport)
        throw new AppError("No se encontró el informe de Auditoría seleccionado.", 400);
    if (!mainObservation)
        throw new AppError("La observación principal seleccionada no está activa.", 400);
    if (!riskLevel)
        throw new AppError("El nivel de riesgo seleccionado no está activo.", 400);
    const maxRemediationDays = riskLevel.maxRemediationDays;
    if (maxRemediationDays === null ||
        !Number.isInteger(maxRemediationDays) ||
        maxRemediationDays <= 0)
        throw new AppError(`El nivel de riesgo ${riskLevel.name} no tiene configurado un plazo máximo válido.`, 400);
    if (risks !== input.riskIds.length)
        throw new AppError("Uno o más riesgos asociados no existen o están inactivos.", 400);
    if (areas !== input.areaAssignments.length)
        throw new AppError("Una o más áreas involucradas no existen o están inactivas.", 400);
    if (users !== uniqueUserIds.length)
        throw new AppError("Uno o más usuarios asignados no existen o están inactivos.", 400);
    const assignedAreaIds = new Set(input.areaAssignments.map((row) => row.areaId));
    if ((input.actionPlans ?? []).some((plan) => !assignedAreaIds.has(plan.areaId)))
        throw new AppError("Cada plan de acción debe pertenecer a un área involucrada en la observación.", 400);
    return { auditReport, riskLevel };
};
const findRecord = async (id, access) => {
    const record = await prisma.observation.findFirst({
        include: buildObservationInclude(access),
        where: {
            deletedAt: null,
            id,
            ...buildObservationAccessWhere(access),
        },
    });
    if (!record)
        throw new AppError("Observation not found.", 404);
    return record;
};
const cancelLinkedWorkflowInstances = async (tx, workflowInstanceIds, deletedAt) => {
    if (workflowInstanceIds.length === 0)
        return;
    await tx.workflowTimer.updateMany({
        data: { status: "CANCELLED" },
        where: {
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
            workflowInstanceId: { in: workflowInstanceIds },
        },
    });
    await tx.workflowTask.updateMany({
        data: { completedAt: deletedAt, status: "CANCELLED" },
        where: {
            status: { in: ["PENDING", "IN_PROGRESS"] },
            workflowInstanceId: { in: workflowInstanceIds },
        },
    });
    await tx.workflowInstance.updateMany({
        data: {
            completedAt: deletedAt,
            finalResult: "CANCELLED",
            lastExecutionAt: deletedAt,
            status: "CANCELLED",
        },
        where: {
            id: { in: workflowInstanceIds },
            status: { in: ["PENDING", "ACTIVE", "WAITING", "FAILED"] },
        },
    });
};
const extensionRequestForObservationWhere = (observationId) => ({
    OR: [
        { observationId },
        { actionPlan: { observationId } },
        { observationArea: { observationId } },
    ],
});
const buildBusinessStatusWhere = (status) => {
    switch (status) {
        case "NO_INICIADO":
            return {
                OR: [
                    { actionPlans: { none: { deletedAt: null } } },
                    {
                        actionPlans: {
                            every: {
                                OR: [{ deletedAt: { not: null } }, { status: "NOT_STARTED" }],
                            },
                        },
                    },
                ],
            };
        case "INICIADO":
            return {
                actionPlans: {
                    none: { deletedAt: null, progressPercent: { gt: 0 } },
                    some: { deletedAt: null, status: "STARTED" },
                },
                status: { isFinal: false },
            };
        case "CON_AVANCE":
            return {
                actionPlans: {
                    some: {
                        deletedAt: null,
                        OR: [
                            { progressPercent: { gt: 0 } },
                            { status: { in: ["WITH_PROGRESS", "CONCLUDED"] } },
                        ],
                    },
                },
                status: { isFinal: false },
            };
        case "CONCLUIDO":
            return { status: { isFinal: true } };
    }
};
export const observationsService = {
    async createObservation(input, access) {
        if (!authorizationService.can(access, "observations.create"))
            throw new AppError("No tiene permiso para crear observaciones.", 403);
        if (input.actionPlans.length > 0 &&
            !access.isAdmin &&
            !["action_plans.create", "action_plans.assign_executor"].every((permission) => access.permissions.includes(permission)))
            throw new AppError("No tiene permisos para crear y asignar planes de acción.", 403);
        const { auditReport, riskLevel } = await requireEntities(input);
        const initialStatus = await prisma.observationStatus.findFirst({
            select: { id: true },
            where: { active: true, deletedAt: null, isInitial: true },
        });
        if (!initialStatus)
            throw new AppError("No está configurado el estado inicial de las observaciones.", 500);
        const deadline = observationDeadlineService.calculate(auditReport.reportDate, riskLevel.maxRemediationDays);
        const commitmentDate = input.commitmentDate ?? deadline;
        if (!observationDeadlineService.isCommitmentDateAllowed(auditReport.reportDate, riskLevel.maxRemediationDays, commitmentDate))
            throw new AppError(`La fecha de compromiso no puede superar el plazo máximo de ${riskLevel.maxRemediationDays} días para el nivel de riesgo ${riskLevel.name}.`, 400);
        if ((input.actionPlans ?? []).some((plan) => plan.dueDate > deadline))
            throw new AppError(`La fecha de un plan supera el plazo máximo permitido para el nivel de riesgo ${riskLevel.name}.`, 400);
        try {
            const created = await prisma.$transaction(async (tx) => {
                // Lock the report row before scanning gaps so concurrent creates share one allocator.
                await tx.auditReport.update({
                    data: { updatedAt: new Date() },
                    where: { id: input.auditReportId },
                });
                const usedNumbers = new Set((await tx.observation.findMany({
                    select: { observationNumber: true },
                    where: { auditReportId: input.auditReportId, deletedAt: null },
                })).map(({ observationNumber }) => observationNumber));
                const observationNumber = nextAvailableObservationNumber(usedNumbers);
                const observation = await tx.observation.create({
                    data: {
                        auditRecommendation: input.auditRecommendation,
                        auditReportId: input.auditReportId,
                        auditorUserId: input.auditorUserId,
                        category: input.category,
                        currentDueDate: commitmentDate,
                        currentStage: input.currentStage,
                        description: input.description,
                        mainObservationId: input.mainObservationId,
                        observationNumber,
                        originalDueDate: commitmentDate,
                        process: input.process,
                        riskLevelId: input.riskLevelId,
                        source: input.source,
                        statusId: initialStatus.id,
                        title: input.title,
                        areaAssignments: {
                            create: input.areaAssignments.map((row) => ({
                                areaId: row.areaId,
                                areaResponsibleUserId: row.areaResponsibleUserId,
                                processOwnerUserId: row.processOwnerUserId,
                            })),
                        },
                        risks: {
                            create: input.riskIds.map((riskId) => ({ riskId })),
                        },
                    },
                    select: { id: true },
                });
                if (input.actionPlans.length > 0) {
                    const assignments = await tx.observationArea.findMany({
                        select: { areaId: true, id: true },
                        where: { observationId: observation.id },
                    });
                    const assignmentByArea = new Map(assignments.map((assignment) => [assignment.areaId, assignment.id]));
                    await tx.actionPlan.createMany({
                        data: input.actionPlans.map((plan, index) => ({
                            currentDueDate: plan.dueDate,
                            description: plan.description,
                            observationAreaId: assignmentByArea.get(plan.areaId),
                            observationId: observation.id,
                            originalDueDate: plan.dueDate,
                            responsibleUserId: plan.responsibleUserId,
                            sortOrder: index,
                            // Kept only for backwards compatibility with the current database column.
                            title: plan.description.slice(0, 191),
                        })),
                    });
                }
                return observation;
            });
            return formatObservation(await findRecord(created.id, access));
        }
        catch (error) {
            if (error.code === "P2002") {
                throw new AppError("Ese número de observación ya existe en el informe de Auditoría seleccionado.", 409);
            }
            throw error;
        }
    },
    async closeObservation(id, access) {
        if (!authorizationService.can(access, "observations.close"))
            throw new AppError("No tiene permiso para cerrar observaciones.", 403);
        const existing = await findRecord(id, access);
        if (existing.status.isFinal) {
            throw new AppError("The observation is already concluded.", 409);
        }
        if (existing.actionPlans.length === 0) {
            throw new AppError("At least one action plan is required before closure.", 409);
        }
        if (existing.actionPlans.some((plan) => plan.status !== "CONCLUDED")) {
            throw new AppError("All action plans must be concluded before closing the observation.", 409);
        }
        const pendingEvaluations = await prisma.progressEvaluation.count({
            where: {
                actionPlan: { observationId: id },
                deletedAt: null,
                reviewStatus: { in: ["SENT_TO_AUDIT", "RETURNED"] },
            },
        });
        if (pendingEvaluations > 0) {
            throw new AppError("Pending progress evaluations must be resolved before closure.", 409);
        }
        const concludedStatus = await prisma.observationStatus.findFirst({
            select: { id: true },
            where: { active: true, deletedAt: null, key: "CONCLUIDO" },
        });
        if (!concludedStatus) {
            throw new AppError("The CONCLUIDO observation status is not configured.", 500);
        }
        await prisma.observation.update({
            data: {
                currentStage: "Cierre aprobado por Auditoría",
                progressPercent: 100,
                statusId: concludedStatus.id,
            },
            where: { id },
        });
        return {
            current: formatObservation(await findRecord(id, access)),
            previous: formatObservation(existing),
        };
    },
    async deleteObservation(id, access) {
        if (!authorizationService.can(access, "observations.delete"))
            throw new AppError("No tiene permiso para eliminar observaciones.", 403);
        const previous = formatObservation(await findRecord(id, access));
        if (previous.sentAt)
            throw new AppError("Las observaciones enviadas a las áreas no se pueden eliminar.", 409);
        const deletedAt = new Date();
        await prisma.$transaction(async (tx) => {
            // Serialize deletion with the per-report allocator and preserve the composite key.
            await tx.auditReport.update({
                data: { updatedAt: deletedAt },
                where: { id: previous.auditReport.id },
            });
            const existingNumbers = new Set((await tx.observation.findMany({
                select: { observationNumber: true },
                where: { auditReportId: previous.auditReport.id },
            })).map(({ observationNumber }) => observationNumber));
            let releasedKey = -1;
            while (existingNumbers.has(releasedKey))
                releasedKey -= 1;
            const [remediationPlans, extensionRequests, progressEvaluations, evidence,] = await Promise.all([
                tx.remediationPlan.findMany({
                    select: { workflowInstanceId: true },
                    where: { observationId: id, workflowInstanceId: { not: null } },
                }),
                tx.deadlineExtensionRequest.findMany({
                    select: { workflowInstanceId: true },
                    where: {
                        ...extensionRequestForObservationWhere(id),
                        workflowInstanceId: { not: null },
                    },
                }),
                tx.progressEvaluation.findMany({
                    select: { workflowInstanceId: true },
                    where: {
                        actionPlan: { observationId: id },
                        workflowInstanceId: { not: null },
                    },
                }),
                tx.evidenceFile.findMany({
                    select: { workflowInstanceId: true },
                    where: { observationId: id, workflowInstanceId: { not: null } },
                }),
            ]);
            const workflowInstanceIds = [
                ...new Set([
                    ...remediationPlans,
                    ...extensionRequests,
                    ...progressEvaluations,
                    ...evidence,
                ]
                    .map((record) => record.workflowInstanceId)
                    .filter((workflowInstanceId) => Boolean(workflowInstanceId))),
            ];
            await cancelLinkedWorkflowInstances(tx, workflowInstanceIds, deletedAt);
            await tx.deadlineExtensionAttachment.deleteMany({
                where: {
                    extensionRequest: extensionRequestForObservationWhere(id),
                },
            });
            await tx.progressReviewHistory.deleteMany({
                where: { progressEvaluation: { actionPlan: { observationId: id } } },
            });
            await tx.observationRisk.deleteMany({ where: { observationId: id } });
            await tx.observationComment.updateMany({
                data: { deletedAt },
                where: { deletedAt: null, observationId: id },
            });
            await tx.evidenceFile.updateMany({
                data: { deletedAt },
                where: { deletedAt: null, observationId: id },
            });
            await tx.progressEvaluation.updateMany({
                data: { deletedAt },
                where: { actionPlan: { observationId: id }, deletedAt: null },
            });
            await tx.deadlineExtensionRequest.updateMany({
                data: { deletedAt },
                where: {
                    ...extensionRequestForObservationWhere(id),
                    deletedAt: null,
                },
            });
            await tx.actionPlan.updateMany({
                data: { deletedAt },
                where: { deletedAt: null, observationId: id },
            });
            await tx.remediationPlan.updateMany({
                data: { deletedAt },
                where: { deletedAt: null, observationId: id },
            });
            await tx.observation.update({
                data: {
                    deletedAt,
                    deletedObservationNumber: previous.observationNumber,
                    // Keep the composite unique key while making the released number reusable.
                    observationNumber: releasedKey,
                },
                where: { id },
            });
        });
        return previous;
    },
    async getObservationById(id, access) {
        return formatObservation(await findRecord(id, access));
    },
    async sendObservation(id, access) {
        const result = await this.sendObservations([id], access);
        return {
            current: result.current[0],
            previous: result.previous[0],
        };
    },
    async sendObservations(ids, access) {
        if (!authorizationService.can(access, "observations.send"))
            throw new AppError("No tiene permiso para distribuir observaciones.", 403);
        const uniqueIds = Array.from(new Set(ids));
        const previousRecords = await Promise.all(uniqueIds.map((observationId) => findRecord(observationId, access)));
        const [records, activeRiskLevels] = await Promise.all([
            prisma.observation.findMany({
                include: {
                    auditReport: {
                        select: { id: true, reportNumber: true, title: true },
                    },
                    areaAssignments: {
                        include: {
                            actionPlans: {
                                select: { responsibleUser: { select: userSummarySelect } },
                            },
                            areaResponsible: { select: userSummarySelect },
                            area: { select: { id: true, name: true } },
                            processOwner: { select: userSummarySelect },
                        },
                    },
                    riskLevel: { select: { maxRemediationDays: true, name: true } },
                },
                where: {
                    deletedAt: null,
                    id: { in: uniqueIds },
                    ...buildObservationAccessWhere(access),
                },
            }),
            prisma.riskLevel.findMany({
                select: { maxRemediationDays: true, name: true, severityOrder: true },
                where: { active: true, deletedAt: null },
            }),
        ]);
        if (records.length !== uniqueIds.length)
            throw new AppError("Una o más observaciones no están disponibles para su ámbito.", 404);
        if (records.some((record) => !canSendObservation(record.sentAt)))
            throw new AppError("Una o más observaciones ya fueron enviadas y no se pueden reenviar.", 409);
        const maxPeriods = formatRiskLevelMaxPeriods(activeRiskLevels) ||
            "los plazos configurados por nivel de riesgo";
        const operationId = buildObservationSendOperationId(uniqueIds);
        const groups = buildObservationAssignmentGroups(records, maxPeriods);
        const emailDeliveries = [];
        await prisma.$transaction(async (tx) => {
            const updated = await tx.observation.updateMany({
                data: {
                    currentStage: "Enviada a los involucrados",
                    sentAt: new Date(),
                },
                where: { deletedAt: null, id: { in: uniqueIds }, sentAt: null },
            });
            if (updated.count !== uniqueIds.length)
                throw new AppError("Una o más observaciones ya fueron enviadas.", 409);
            for (const group of groups) {
                const targetUrl = group.observationIds.length === 1
                    ? `/observaciones/${group.observationIds[0]}?tab=summary`
                    : "/observaciones";
                const notification = await notificationService.create({
                    dedupeKey: buildObservationSendDedupeKey(operationId, group.userId, "notification"),
                    entityId: group.observationIds.length === 1
                        ? group.observationIds[0]
                        : null,
                    entityType: group.observationIds.length === 1
                        ? "OBSERVATION"
                        : "OBSERVATION_BATCH",
                    eventType: "OBSERVATION_ASSIGNMENT",
                    message: `Tiene ${group.observationIds.length} observación${group.observationIds.length === 1 ? "" : "es"} nueva${group.observationIds.length === 1 ? "" : "s"} asignada${group.observationIds.length === 1 ? "" : "s"} para gestión.`,
                    title: "Nuevas observaciones asignadas",
                    type: "info",
                    targetUrl,
                    userId: group.userId,
                }, { db: tx });
                await notificationService.createDelivery({
                    channel: NotificationDeliveryChannel.IN_APP,
                    dedupeKey: buildObservationSendDedupeKey(operationId, group.userId, "IN_APP"),
                    notificationId: notification.id,
                    recipientEmail: group.email,
                    recipientUserId: group.userId,
                    status: NotificationDeliveryStatus.SENT,
                }, { db: tx.notificationDelivery });
                const delivery = await notificationService.createDelivery({
                    channel: NotificationDeliveryChannel.EMAIL,
                    dedupeKey: buildObservationSendDedupeKey(operationId, group.userId, "EMAIL"),
                    notificationId: notification.id,
                    recipientEmail: group.email,
                    recipientUserId: group.userId,
                    status: NotificationDeliveryStatus.PENDING,
                }, { db: tx.notificationDelivery });
                emailDeliveries.push({ deliveryId: delivery.id, group });
            }
        });
        void Promise.all(emailDeliveries.map(async ({ deliveryId, group }) => {
            if (!(await notificationService.claimEmailDelivery(deliveryId)))
                return;
            const targetUrl = group.observationIds.length === 1
                ? `/observaciones/${group.observationIds[0]}?tab=summary`
                : "/observaciones";
            const result = await emailService.sendTemplate({
                template: "observationAssignment",
                to: group.email,
                variables: {
                    maxPeriods: group.maxPeriods,
                    platformLink: `${env.FRONTEND_URL}${targetUrl}`,
                    reports: group.reports,
                    total: group.observationIds.length,
                    userName: group.name,
                },
            });
            await notificationService.completeEmailDelivery(deliveryId, result);
        })).catch((error) => {
            logger.error("Observation assignment email delivery failed.", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
        });
        const current = await Promise.all(uniqueIds.map((observationId) => findRecord(observationId, access)));
        return {
            current: current.map(formatObservation),
            previous: previousRecords.map(formatObservation),
        };
    },
    async getObservationForActionItems(id, access) {
        const record = await findRecord(id, access);
        return {
            areaAssignments: record.areaAssignments.map((row) => ({
                areaId: row.areaId,
                areaName: row.area.name,
                areaResponsibleUserId: row.areaResponsibleUserId,
                processOwnerUserId: row.processOwnerUserId,
            })),
            currentDueDate: record.currentDueDate,
            id: record.id,
            progressPercent: observationAggregationService.calculateProgress(record.actionPlans),
            riskCount: record.risks.length,
            status: record.status,
        };
    },
    async getObservationFormOptions(access) {
        void access;
        const [areas, auditReports, mainObservations, risks, riskLevels, users] = await Promise.all([
            prisma.area.findMany({
                orderBy: { name: "asc" },
                select: {
                    code: true,
                    id: true,
                    managerUser: { select: userSummarySelect },
                    name: true,
                },
                where: { active: true, deletedAt: null },
            }),
            prisma.auditReport.findMany({
                orderBy: [{ reportDate: "desc" }, { reportNumber: "asc" }],
                select: {
                    id: true,
                    reportDate: true,
                    reportNumber: true,
                    title: true,
                },
                where: { deletedAt: null },
            }),
            prisma.observationDictionary.findMany({
                orderBy: { name: "asc" },
                select: { description: true, id: true, name: true },
                where: { isActive: true },
            }),
            prisma.risk.findMany({
                orderBy: { name: "asc" },
                select: { description: true, id: true, name: true },
                where: { isActive: true },
            }),
            prisma.riskLevel.findMany({
                orderBy: { severityOrder: "asc" },
                select: {
                    colorToken: true,
                    maxRemediationDays: true,
                    id: true,
                    key: true,
                    name: true,
                },
                where: {
                    active: true,
                    deletedAt: null,
                    key: { in: ["ALTO", "MEDIO", "BAJO"] },
                },
            }),
            prisma.user.findMany({
                orderBy: { name: "asc" },
                select: userSummarySelect,
                where: { deletedAt: null, isActive: true },
            }),
        ]);
        return {
            areas,
            auditReports: auditReports.map((report) => ({
                ...report,
                reportDate: report.reportDate.toISOString(),
            })),
            mainObservations,
            risks,
            riskLevels,
            users,
        };
    },
    async listObservations(query, access) {
        const now = new Date();
        const numericSearch = /^\d+$/.test(query.search)
            ? Number(query.search)
            : null;
        const where = {
            AND: [
                buildObservationAccessWhere(access),
                ...(query.observationStatus
                    ? [buildBusinessStatusWhere(query.observationStatus)]
                    : []),
            ],
            deletedAt: null,
            ...(query.actionPlanResponsibleUserId
                ? {
                    actionPlans: {
                        some: {
                            deletedAt: null,
                            responsibleUserId: query.actionPlanResponsibleUserId,
                        },
                    },
                }
                : {}),
            ...(query.areaId ||
                query.areaResponsibleUserId ||
                query.processOwnerUserId
                ? {
                    areaAssignments: {
                        some: {
                            ...(query.areaId ? { areaId: query.areaId } : {}),
                            ...(query.areaResponsibleUserId
                                ? { areaResponsibleUserId: query.areaResponsibleUserId }
                                : {}),
                            ...(query.processOwnerUserId
                                ? { processOwnerUserId: query.processOwnerUserId }
                                : {}),
                        },
                    },
                }
                : {}),
            ...(query.auditReportId ? { auditReportId: query.auditReportId } : {}),
            ...(query.currentDueDateFrom || query.currentDueDateTo
                ? {
                    currentDueDate: {
                        ...(query.currentDueDateFrom
                            ? { gte: query.currentDueDateFrom }
                            : {}),
                        ...(query.currentDueDateTo
                            ? { lte: query.currentDueDateTo }
                            : {}),
                    },
                }
                : {}),
            ...(query.mainObservationId
                ? { mainObservationId: query.mainObservationId }
                : {}),
            ...(query.overdue !== undefined
                ? query.overdue
                    ? { currentDueDate: { lt: now }, status: { isFinal: false } }
                    : {
                        OR: [
                            { currentDueDate: { gte: now } },
                            { status: { isFinal: true } },
                        ],
                    }
                : {}),
            ...(query.riskId ? { risks: { some: { riskId: query.riskId } } } : {}),
            ...(query.riskLevelId ? { riskLevelId: query.riskLevelId } : {}),
            ...(query.search
                ? {
                    OR: [
                        ...(numericSearch ? [{ observationNumber: numericSearch }] : []),
                        { title: { contains: query.search } },
                        { auditReport: { reportNumber: { contains: query.search } } },
                        { auditReport: { title: { contains: query.search } } },
                        { mainObservation: { name: { contains: query.search } } },
                        {
                            risks: { some: { risk: { name: { contains: query.search } } } },
                        },
                        {
                            areaAssignments: {
                                some: { area: { name: { contains: query.search } } },
                            },
                        },
                        {
                            areaAssignments: {
                                some: {
                                    OR: [
                                        { processOwner: { name: { contains: query.search } } },
                                        { processOwner: { email: { contains: query.search } } },
                                        { areaResponsible: { name: { contains: query.search } } },
                                        {
                                            areaResponsible: { email: { contains: query.search } },
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            actionPlans: {
                                some: {
                                    responsibleUser: {
                                        OR: [
                                            { name: { contains: query.search } },
                                            { email: { contains: query.search } },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                }
                : {}),
        };
        const orderBy = query.sortBy === "reportDate"
            ? { auditReport: { reportDate: query.sortDirection } }
            : { [query.sortBy]: query.sortDirection };
        const [records, total] = await Promise.all([
            prisma.observation.findMany({
                include: buildObservationInclude(access),
                orderBy: [orderBy, { id: "asc" }],
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
            prisma.observation.count({ where }),
        ]);
        return {
            data: records.map(toListItem),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
                totalPages: Math.ceil(total / query.perPage),
            },
        };
    },
    async updateObservation(id, input, access) {
        if (!authorizationService.can(access, "observations.edit"))
            throw new AppError("No tiene permiso para editar observaciones.", 403);
        const existing = await findRecord(id, access);
        if (input.areaAssignments !== undefined &&
            !access.isAdmin &&
            !access.permissions.includes("observation_areas.manage")) {
            throw new AppError("You cannot change observation area assignments.", 403);
        }
        const merged = {
            areaAssignments: input.areaAssignments ??
                existing.areaAssignments.map((row) => ({
                    areaId: row.areaId,
                    areaResponsibleUserId: row.areaResponsibleUserId,
                    processOwnerUserId: row.processOwnerUserId,
                })),
            auditReportId: input.auditReportId ?? existing.auditReportId,
            auditorUserId: input.auditorUserId ?? existing.auditorUserId,
            mainObservationId: input.mainObservationId ?? existing.mainObservationId,
            riskIds: input.riskIds ?? existing.risks.map(({ risk }) => risk.id),
            riskLevelId: input.riskLevelId ?? existing.riskLevelId,
        };
        const { auditReport, riskLevel } = await requireEntities(merged);
        const extensionCount = await prisma.deadlineExtensionRequest.count({
            where: { deletedAt: null, observationId: id },
        });
        const shouldRecalculateDeadline = existing.actionPlans.length === 0 &&
            extensionCount === 0 &&
            (merged.auditReportId !== existing.auditReportId ||
                merged.riskLevelId !== existing.riskLevelId);
        const maxDeadline = observationDeadlineService.calculate(auditReport.reportDate, riskLevel.maxRemediationDays);
        const deadline = shouldRecalculateDeadline ? maxDeadline : null;
        if (input.commitmentDate &&
            !observationDeadlineService.isCommitmentDateAllowed(auditReport.reportDate, riskLevel.maxRemediationDays, input.commitmentDate))
            throw new AppError(`La fecha de compromiso no puede superar el plazo máximo de ${riskLevel.maxRemediationDays} días para el nivel de riesgo ${riskLevel.name}.`, 400);
        const retainedAreaIds = new Set(merged.areaAssignments.map((row) => row.areaId));
        const blockedRemoval = existing.areaAssignments.find((row) => !retainedAreaIds.has(row.areaId) && row.actionPlans.length > 0);
        if (blockedRemoval) {
            throw new AppError(`Area ${blockedRemoval.area.name} cannot be removed while it has action plans.`, 409);
        }
        try {
            await prisma.$transaction(async (tx) => {
                await tx.observation.update({
                    data: {
                        ...(input.auditRecommendation !== undefined
                            ? { auditRecommendation: input.auditRecommendation }
                            : {}),
                        ...(input.auditReportId !== undefined
                            ? { auditReportId: input.auditReportId }
                            : {}),
                        ...(input.auditorUserId !== undefined
                            ? { auditorUserId: input.auditorUserId }
                            : {}),
                        ...(input.category !== undefined
                            ? { category: input.category }
                            : {}),
                        ...(input.currentStage !== undefined
                            ? { currentStage: input.currentStage }
                            : {}),
                        ...(input.description !== undefined
                            ? { description: input.description }
                            : {}),
                        ...(input.mainObservationId !== undefined
                            ? { mainObservationId: input.mainObservationId }
                            : {}),
                        ...(input.process !== undefined ? { process: input.process } : {}),
                        ...(input.riskLevelId !== undefined
                            ? { riskLevelId: input.riskLevelId }
                            : {}),
                        ...(input.source !== undefined ? { source: input.source } : {}),
                        ...(input.title !== undefined ? { title: input.title } : {}),
                        ...(input.commitmentDate
                            ? { currentDueDate: input.commitmentDate }
                            : deadline
                                ? { currentDueDate: deadline, originalDueDate: deadline }
                                : {}),
                    },
                    where: { id },
                });
                if (input.riskIds) {
                    await tx.observationRisk.deleteMany({ where: { observationId: id } });
                    await tx.observationRisk.createMany({
                        data: input.riskIds.map((riskId) => ({
                            observationId: id,
                            riskId,
                        })),
                    });
                }
                if (input.areaAssignments) {
                    await tx.observationArea.deleteMany({
                        where: {
                            observationId: id,
                            areaId: { notIn: input.areaAssignments.map((row) => row.areaId) },
                        },
                    });
                    for (const row of input.areaAssignments) {
                        await tx.observationArea.upsert({
                            create: { observationId: id, ...row },
                            update: {
                                areaResponsibleUserId: row.areaResponsibleUserId,
                                processOwnerUserId: row.processOwnerUserId,
                            },
                            where: {
                                observationId_areaId: { areaId: row.areaId, observationId: id },
                            },
                        });
                    }
                }
            });
        }
        catch (error) {
            if (error.code === "P2002") {
                throw new AppError("That observation number already exists in the selected audit report.", 409);
            }
            throw error;
        }
        return {
            current: formatObservation(await findRecord(id, access)),
            previous: formatObservation(existing),
        };
    },
};
//# sourceMappingURL=observations.service.js.map