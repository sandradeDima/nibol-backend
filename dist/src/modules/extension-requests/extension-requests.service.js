import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { buildObservationAccessWhere } from "../observations/observations.service.js";
import { workflowIntegrationService } from "../workflows/workflow-integration.service.js";
import { EDITABLE_EXTENSION_REQUEST_STATUSES } from "./extension-requests.constants.js";
const userSelect = {
    email: true,
    id: true,
    jobTitle: true,
    name: true,
};
const include = {
    actionPlan: {
        select: {
            currentDueDate: true,
            id: true,
            observation: {
                select: {
                    auditReport: { select: { reportNumber: true } },
                    id: true,
                    observationNumber: true,
                    title: true,
                },
            },
            originalDueDate: true,
            responsibleUser: { select: userSelect },
            title: true,
        },
    },
    attachments: {
        select: {
            evidenceFile: {
                select: {
                    context: true,
                    createdAt: true,
                    id: true,
                    mimeType: true,
                    originalName: true,
                },
            },
        },
    },
    auditReviewer: { select: userSelect },
    managerReviewer: { select: userSelect },
    observation: {
        select: {
            auditReport: { select: { reportNumber: true } },
            auditorUserId: true,
            id: true,
            observationNumber: true,
            originalDueDate: true,
            title: true,
        },
    },
    observationArea: {
        select: {
            area: { select: { id: true, managerUserId: true, name: true } },
            areaResponsible: { select: userSelect },
            processOwner: { select: userSelect },
        },
    },
    requestedByUser: { select: userSelect },
};
const format = (record) => ({
    actionPlan: record.actionPlan
        ? {
            id: record.actionPlan.id,
            currentDueDate: record.actionPlan.currentDueDate.toISOString(),
            originalDueDate: record.actionPlan.originalDueDate.toISOString(),
            responsibleUser: record.actionPlan.responsibleUser,
            title: record.actionPlan.title,
        }
        : null,
    attachments: record.attachments.map(({ evidenceFile }) => ({
        ...evidenceFile,
        createdAt: evidenceFile.createdAt.toISOString(),
        downloadPath: `/evidences/${evidenceFile.id}/download`,
    })),
    auditComment: record.auditComment,
    auditReviewedAt: record.auditReviewedAt?.toISOString() ?? null,
    auditReviewer: record.auditReviewer,
    createdAt: record.createdAt.toISOString(),
    finalApprovedAt: record.finalApprovedAt?.toISOString() ?? null,
    id: record.id,
    impactDays: Math.round((record.proposedDueDate.getTime() - record.previousDueDate.getTime()) /
        (24 * 60 * 60 * 1000)),
    managerComment: record.managerComment,
    managerReviewedAt: record.managerReviewedAt?.toISOString() ?? null,
    managerReviewer: record.managerReviewer,
    observation: (record.observation ?? record.actionPlan?.observation)
        ? {
            displayCode: `${(record.observation ?? record.actionPlan.observation).auditReport.reportNumber} / OBS-${String((record.observation ?? record.actionPlan.observation).observationNumber).padStart(3, "0")}`,
            id: (record.observation ?? record.actionPlan.observation).id,
            title: (record.observation ?? record.actionPlan.observation).title,
        }
        : null,
    observationArea: record.observationArea,
    previousDueDate: record.previousDueDate.toISOString(),
    proposedDueDate: record.proposedDueDate.toISOString(),
    reason: record.reason,
    requestedByUser: record.requestedByUser,
    status: record.status,
    targetType: record.targetType,
    updatedAt: record.updatedAt.toISOString(),
    workflowInstanceId: record.workflowInstanceId,
});
const accessWhere = (access) => ({
    OR: [
        { requestedByUserId: access.userId },
        { observation: buildObservationAccessWhere(access) },
        { actionPlan: { observation: buildObservationAccessWhere(access) } },
    ],
});
const find = async (id, access) => {
    const record = await prisma.deadlineExtensionRequest.findFirst({
        include,
        where: { deletedAt: null, id, ...accessWhere(access) },
    });
    if (!record)
        throw new AppError("Deadline extension request not found.", 404);
    return record;
};
const attachEvidence = async (tx, requestId, observationId, evidenceIds) => {
    if (!evidenceIds.length)
        return;
    const count = await tx.evidenceFile.count({
        where: { deletedAt: null, id: { in: evidenceIds }, observationId },
    });
    if (count !== new Set(evidenceIds).size)
        throw new AppError("One or more evidence files are invalid.", 400);
    await tx.deadlineExtensionAttachment.createMany({
        data: Array.from(new Set(evidenceIds)).map((evidenceFileId) => ({
            evidenceFileId,
            extensionRequestId: requestId,
        })),
    });
};
export const extensionRequestsService = {
    async createForObservation(observationId, input, access) {
        const observation = await prisma.observation.findFirst({
            select: { currentDueDate: true, id: true },
            where: {
                deletedAt: null,
                id: observationId,
                ...buildObservationAccessWhere(access),
            },
        });
        if (!observation)
            throw new AppError("Observation not found.", 404);
        if (input.proposedDueDate <= observation.currentDueDate)
            throw new AppError("The proposed date must be after the current due date.", 400);
        const created = await prisma.$transaction(async (tx) => {
            const request = await tx.deadlineExtensionRequest.create({
                data: {
                    observationId,
                    previousDueDate: observation.currentDueDate,
                    proposedDueDate: input.proposedDueDate,
                    reason: input.reason,
                    requestedByUserId: access.userId,
                    targetType: "OBSERVATION",
                },
                select: { id: true },
            });
            await attachEvidence(tx, request.id, observationId, input.evidenceFileIds);
            return request;
        });
        return format(await find(created.id, access));
    },
    async createForActionPlan(actionPlanId, input, access) {
        const actionPlan = await prisma.actionPlan.findFirst({
            select: {
                currentDueDate: true,
                id: true,
                observationAreaId: true,
                observationId: true,
            },
            where: {
                deletedAt: null,
                id: actionPlanId,
                observation: buildObservationAccessWhere(access),
            },
        });
        if (!actionPlan)
            throw new AppError("Action plan not found.", 404);
        if (input.proposedDueDate <= actionPlan.currentDueDate)
            throw new AppError("The proposed date must be after the current due date.", 400);
        const created = await prisma.$transaction(async (tx) => {
            const request = await tx.deadlineExtensionRequest.create({
                data: {
                    actionPlanId,
                    observationAreaId: actionPlan.observationAreaId,
                    previousDueDate: actionPlan.currentDueDate,
                    proposedDueDate: input.proposedDueDate,
                    reason: input.reason,
                    requestedByUserId: access.userId,
                    targetType: "ACTION_PLAN",
                },
                select: { id: true },
            });
            await attachEvidence(tx, request.id, actionPlan.observationId, input.evidenceFileIds);
            return request;
        });
        return format(await find(created.id, access));
    },
    async getById(id, access) {
        return format(await find(id, access));
    },
    async list(query, access) {
        const where = {
            deletedAt: null,
            ...accessWhere(access),
            ...(query.actionPlanId ? { actionPlanId: query.actionPlanId } : {}),
            ...(query.observationId
                ? {
                    OR: [
                        { observationId: query.observationId },
                        { actionPlan: { observationId: query.observationId } },
                    ],
                }
                : {}),
            ...(query.requestedByUserId
                ? { requestedByUserId: query.requestedByUserId }
                : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.targetType ? { targetType: query.targetType } : {}),
            ...(query.search
                ? {
                    OR: [
                        { reason: { contains: query.search } },
                        { actionPlan: { title: { contains: query.search } } },
                        { observation: { title: { contains: query.search } } },
                    ],
                }
                : {}),
        };
        const [records, total] = await Promise.all([
            prisma.deadlineExtensionRequest.findMany({
                include,
                orderBy: { updatedAt: "desc" },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
            prisma.deadlineExtensionRequest.count({ where }),
        ]);
        return {
            data: records.map(format),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
                totalPages: Math.ceil(total / query.perPage),
            },
        };
    },
    async update(id, input, access) {
        const previous = await find(id, access);
        if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status))
            throw new AppError("This request is not editable.", 409);
        if (!access.isAdmin && previous.requestedByUserId !== access.userId)
            throw new AppError("You cannot edit this request.", 403);
        if (input.proposedDueDate &&
            input.proposedDueDate <= previous.previousDueDate)
            throw new AppError("The proposed date must be after the current due date.", 400);
        await prisma.$transaction(async (tx) => {
            await tx.deadlineExtensionRequest.update({
                data: {
                    ...(input.proposedDueDate !== undefined
                        ? { proposedDueDate: input.proposedDueDate }
                        : {}),
                    ...(input.reason !== undefined ? { reason: input.reason } : {}),
                    status: "DRAFT",
                },
                where: { id },
            });
            if (input.evidenceFileIds) {
                await tx.deadlineExtensionAttachment.deleteMany({
                    where: { extensionRequestId: id },
                });
                const observationId = previous.observation?.id;
                const actionPlanObservationId = previous.actionPlanId
                    ? (await tx.actionPlan.findUnique({
                        select: { observationId: true },
                        where: { id: previous.actionPlanId },
                    }))?.observationId
                    : null;
                const targetObservationId = observationId ?? actionPlanObservationId;
                if (!targetObservationId)
                    throw new AppError("Extension target is invalid.", 409);
                await attachEvidence(tx, id, targetObservationId, input.evidenceFileIds);
            }
        });
        return {
            current: format(await find(id, access)),
            previous: format(previous),
        };
    },
    async submit(id, access) {
        const previous = await find(id, access);
        if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status))
            throw new AppError("This request cannot be submitted.", 409);
        const workflow = await workflowIntegrationService.startForEntity({
            access: { ...access, ipAddress: null },
            actorUserId: access.userId,
            entityId: id,
            entityType: "deadline_extension_request",
            processType: "DEADLINE_EXTENSION",
        });
        await prisma.deadlineExtensionRequest.update({
            data: {
                status: "SENT_TO_MANAGER",
                ...(workflow.instanceId
                    ? { workflowInstanceId: workflow.instanceId }
                    : {}),
            },
            where: { id },
        });
        return {
            current: format(await find(id, access)),
            previous: format(previous),
        };
    },
    async managerReview(id, approved, input, access) {
        const previous = await find(id, access);
        if (previous.status !== "SENT_TO_MANAGER")
            throw new AppError("This request is not pending management review.", 409);
        if (!approved && !input.comment)
            throw new AppError("A rejection comment is required.", 400);
        await prisma.deadlineExtensionRequest.update({
            data: {
                managerComment: input.comment,
                managerReviewedAt: new Date(),
                managerReviewerId: access.userId,
                status: approved ? "SENT_TO_AUDIT" : "MANAGER_REJECTED",
            },
            where: { id },
        });
        return {
            current: format(await find(id, access)),
            previous: format(previous),
        };
    },
    async auditReview(id, approved, input, access) {
        const previous = await find(id, access);
        if (previous.status !== "SENT_TO_AUDIT")
            throw new AppError("This request is not pending audit review.", 409);
        if (!approved && !input.comment)
            throw new AppError("A rejection comment is required.", 400);
        await prisma.$transaction(async (tx) => {
            await tx.deadlineExtensionRequest.update({
                data: {
                    auditComment: input.comment,
                    auditReviewedAt: new Date(),
                    auditReviewerId: access.userId,
                    finalApprovedAt: approved ? new Date() : null,
                    status: approved ? "AUDIT_APPROVED" : "AUDIT_REJECTED",
                },
                where: { id },
            });
            if (approved) {
                if (previous.targetType === "OBSERVATION" && previous.observationId) {
                    await tx.observation.update({
                        data: { currentDueDate: previous.proposedDueDate },
                        where: { id: previous.observationId },
                    });
                }
                else if (previous.targetType === "ACTION_PLAN" &&
                    previous.actionPlanId) {
                    await tx.actionPlan.update({
                        data: { currentDueDate: previous.proposedDueDate },
                        where: { id: previous.actionPlanId },
                    });
                }
                else {
                    throw new AppError("Extension target is invalid.", 409);
                }
            }
        });
        if (previous.requestedByUserId !== access.userId) {
            await notificationService.create({
                message: `La solicitud de ampliación fue ${approved ? "aprobada" : "rechazada"}.`,
                title: "Solicitud de ampliación revisada",
                type: approved ? "success" : "warning",
                userId: previous.requestedByUserId,
            });
        }
        return {
            current: format(await find(id, access)),
            previous: format(previous),
        };
    },
    async cancel(id, access) {
        const previous = await find(id, access);
        if (!access.isAdmin && previous.requestedByUserId !== access.userId)
            throw new AppError("You cannot cancel this request.", 403);
        await prisma.deadlineExtensionRequest.update({
            data: { status: "CANCELLED" },
            where: { id },
        });
        return {
            current: format(await find(id, access)),
            previous: format(previous),
        };
    },
};
//# sourceMappingURL=extension-requests.service.js.map