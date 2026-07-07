/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildDateRangeFilter } from "../../services/logging-utils.js";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { OBSERVATION_OVERDUE_STATUS_KEY, OBSERVATION_TERMINAL_STATUS_KEYS, } from "../observations/observations.constants.js";
import { AUDIT_ROLE_MARKERS, SYSTEM_WIDE_ROLE_NAMES, } from "../remediation/remediation.constants.js";
import { ACTIVE_EXTENSION_REQUEST_STATUSES, EDITABLE_EXTENSION_REQUEST_STATUSES, FINAL_EXTENSION_REQUEST_STATUSES, } from "./extension-requests.constants.js";
const extensionRequestPrisma = prisma;
const terminalObservationStatuses = new Set(OBSERVATION_TERMINAL_STATUS_KEYS);
const cancellableStatuses = new Set([
    "DRAFT",
    "SENT_TO_MANAGER",
    "SENT_TO_AUDIT",
]);
const userSummarySelect = {
    email: true,
    id: true,
    name: true,
};
const areaSummarySelect = {
    id: true,
    managerUser: {
        select: userSummarySelect,
    },
    name: true,
};
const riskLevelSelect = {
    colorToken: true,
    id: true,
    key: true,
    name: true,
};
const observationStatusSelect = {
    key: true,
    name: true,
};
const observationContextSelect = {
    area: {
        select: areaSummarySelect,
    },
    areaAssignments: {
        orderBy: {
            area: {
                name: "asc",
            },
        },
        select: {
            area: {
                select: areaSummarySelect,
            },
            areaId: true,
            responsibleUser: {
                select: userSummarySelect,
            },
            roleInFinding: true,
        },
    },
    auditorUser: {
        select: userSummarySelect,
    },
    code: true,
    dueDate: true,
    id: true,
    responsibleUser: {
        select: userSummarySelect,
    },
    responsibleUserId: true,
    riskLevel: {
        select: riskLevelSelect,
    },
    status: {
        select: observationStatusSelect,
    },
    title: true,
};
const commitmentContextSelect = {
    completedAt: true,
    dueDate: true,
    id: true,
    progressPercent: true,
    remediationPlan: {
        select: {
            area: {
                select: areaSummarySelect,
            },
            areaId: true,
            id: true,
            ownerUser: {
                select: userSummarySelect,
            },
        },
    },
    responsibleUser: {
        select: userSummarySelect,
    },
    responsibleUserId: true,
    status: true,
    title: true,
};
const evidenceSelect = {
    createdAt: true,
    description: true,
    id: true,
    mimeType: true,
    originalName: true,
    sizeBytes: true,
    uploadedByUser: {
        select: userSummarySelect,
    },
};
const attachmentSelect = {
    createdAt: true,
    evidenceFile: {
        select: evidenceSelect,
    },
    evidenceFileId: true,
    id: true,
};
const requestContextSelect = {
    area: {
        select: areaSummarySelect,
    },
    areaId: true,
    attachments: {
        orderBy: {
            createdAt: "asc",
        },
        select: attachmentSelect,
    },
    auditComment: true,
    auditReviewedAt: true,
    auditReviewer: {
        select: userSummarySelect,
    },
    auditReviewerId: true,
    commitment: {
        select: commitmentContextSelect,
    },
    commitmentId: true,
    createdAt: true,
    currentDueDate: true,
    deletedAt: true,
    finalApprovedAt: true,
    id: true,
    managerComment: true,
    managerReviewedAt: true,
    managerReviewer: {
        select: userSummarySelect,
    },
    managerReviewerId: true,
    observation: {
        select: observationContextSelect,
    },
    observationId: true,
    reason: true,
    requestedByUser: {
        select: userSummarySelect,
    },
    requestedByUserId: true,
    requestedDueDate: true,
    status: true,
    updatedAt: true,
};
const normalizeRoleName = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
const isSystemWideAccess = (access) => {
    if (access.isAdmin) {
        return true;
    }
    return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};
const hasAuditReviewRole = (access) => {
    return access.roles.some((role) => {
        const normalizedRole = normalizeRoleName(role);
        return AUDIT_ROLE_MARKERS.some((marker) => normalizedRole.includes(marker));
    });
};
const mapUserSummary = (user) => {
    if (!user) {
        return null;
    }
    return {
        email: user.email,
        id: user.id,
        name: user.name,
    };
};
const isObservationOverdue = (dueDate, statusKey) => {
    if (statusKey === OBSERVATION_OVERDUE_STATUS_KEY) {
        return true;
    }
    if (terminalObservationStatuses.has(statusKey)) {
        return false;
    }
    return dueDate.getTime() < Date.now();
};
const buildObservationEffectiveStatus = (observation) => {
    if (isObservationOverdue(observation.dueDate, observation.status.key)) {
        return {
            key: OBSERVATION_OVERDUE_STATUS_KEY,
            name: "Vencida",
        };
    }
    return {
        key: observation.status.key,
        name: observation.status.name,
    };
};
const isCommitmentCompleted = (commitment) => {
    return (commitment.status === "COMPLETED" ||
        commitment.completedAt !== null ||
        commitment.progressPercent >= 100);
};
const isCommitmentOverdue = (commitment) => {
    return !isCommitmentCompleted(commitment) && commitment.dueDate.getTime() < Date.now();
};
const buildCommitmentEffectiveStatus = (commitment) => {
    if (isCommitmentCompleted(commitment)) {
        return {
            key: "COMPLETED",
            name: "Completado",
        };
    }
    if (isCommitmentOverdue(commitment)) {
        return {
            key: "OVERDUE",
            name: "Vencido",
        };
    }
    switch (commitment.status) {
        case "PENDING":
            return { key: commitment.status, name: "Pendiente" };
        case "IN_PROGRESS":
            return { key: commitment.status, name: "En progreso" };
        case "SENT_TO_AUDIT":
            return { key: commitment.status, name: "Enviado a Auditoria" };
        case "APPROVED":
            return { key: commitment.status, name: "Aprobado" };
        case "RETURNED":
            return { key: commitment.status, name: "Devuelto" };
        case "COMPLETED":
            return { key: commitment.status, name: "Completado" };
        case "OVERDUE":
            return { key: commitment.status, name: "Vencido" };
        default:
            return { key: commitment.status, name: commitment.status };
    }
};
const calculateImpactDays = (currentDueDate, requestedDueDate) => {
    return Math.round((requestedDueDate.getTime() - currentDueDate.getTime()) / (1000 * 60 * 60 * 24));
};
const parseBooleanParameterValue = (value, fallback) => {
    if (!value) {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "si", "sí", "yes"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no"].includes(normalized)) {
        return false;
    }
    return fallback;
};
const getApprovalSettings = async () => {
    const parameters = await extensionRequestPrisma.systemParameter.findMany({
        select: {
            key: true,
            value: true,
        },
        where: {
            active: true,
            deletedAt: null,
            key: {
                in: [
                    "allow_deadline_extension",
                    "extension_requires_audit_approval",
                    "extension_requires_manager_approval",
                ],
            },
        },
    });
    const values = new Map(parameters.map((parameter) => [
        parameter.key,
        parameter.value,
    ]));
    return {
        allowRequests: parseBooleanParameterValue(values.get("allow_deadline_extension"), true),
        requiresAuditApproval: parseBooleanParameterValue(values.get("extension_requires_audit_approval"), true),
        requiresManagerApproval: parseBooleanParameterValue(values.get("extension_requires_manager_approval"), true),
    };
};
const ensureDeadlineExtensionsEnabled = (settings) => {
    if (!settings.allowRequests) {
        throw new AppError("La solicitud de ampliaciones de plazo se encuentra deshabilitada en los parametros del sistema.", 403);
    }
};
const buildAssignedAreas = (observation) => {
    return [
        {
            area: observation.area,
            isPrimary: true,
            responsibleUser: observation.responsibleUser,
        },
        ...observation.areaAssignments.map((assignment) => ({
            area: assignment.area,
            isPrimary: false,
            responsibleUser: assignment.responsibleUser,
        })),
    ];
};
const resolveObservationRequesterArea = (observation, access) => {
    if (isSystemWideAccess(access)) {
        return {
            area: observation.area,
            responsibleUser: observation.responsibleUser,
        };
    }
    return (buildAssignedAreas(observation).find((areaContext) => {
        return (areaContext.area.managerUser?.id === access.userId ||
            areaContext.responsibleUser?.id === access.userId);
    }) ?? null);
};
const canRequestCommitmentExtension = (commitment, access) => {
    if (isSystemWideAccess(access)) {
        return true;
    }
    return (commitment.remediationPlan.area.managerUser?.id === access.userId ||
        commitment.responsibleUserId === access.userId ||
        commitment.remediationPlan.ownerUser?.id === access.userId);
};
const canViewRequest = (request, access) => {
    if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
        return true;
    }
    if (request.requestedByUserId === access.userId) {
        return true;
    }
    if (request.area.managerUser?.id === access.userId ||
        request.observation.auditorUser.id === access.userId ||
        request.observation.responsibleUserId === access.userId) {
        return true;
    }
    if (request.commitment?.responsibleUserId === access.userId) {
        return true;
    }
    if (request.commitment?.remediationPlan.ownerUser?.id === access.userId) {
        return true;
    }
    return request.observation.areaAssignments.some((assignment) => {
        return (assignment.responsibleUser?.id === access.userId ||
            assignment.area.managerUser?.id === access.userId);
    });
};
const canReviewRequestAsManager = (request, access) => {
    if (request.status !== "SENT_TO_MANAGER") {
        return false;
    }
    return isSystemWideAccess(access) || request.area.managerUser?.id === access.userId;
};
const canReviewRequestAsAudit = (request, access) => {
    if (request.status !== "SENT_TO_AUDIT") {
        return false;
    }
    return (isSystemWideAccess(access) ||
        hasAuditReviewRole(access) ||
        request.observation.auditorUser.id === access.userId);
};
const canEditRequest = (request, access) => {
    if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(request.status)) {
        return false;
    }
    return isSystemWideAccess(access) || request.requestedByUserId === access.userId;
};
const canCancelRequest = (request, access) => {
    if (!cancellableStatuses.has(request.status)) {
        return false;
    }
    return isSystemWideAccess(access) || request.requestedByUserId === access.userId;
};
const getNextSubmissionTarget = (settings) => {
    if (settings.requiresManagerApproval) {
        return "manager";
    }
    if (settings.requiresAuditApproval) {
        return "audit";
    }
    return "auto";
};
const ensureReviewComment = (action, input) => {
    const comment = input.comment?.trim() ?? "";
    if (comment.length < 3) {
        throw new AppError(action === "manager-reject"
            ? "Debe registrar un comentario para rechazar la solicitud como Gerencia."
            : "Debe registrar un comentario para rechazar la solicitud como Auditoria.", 400);
    }
    return comment;
};
const ensureRequestedDueDateAfterCurrent = (requestedDueDate, currentDueDate) => {
    if (requestedDueDate.getTime() <= currentDueDate.getTime()) {
        throw new AppError("La nueva fecha solicitada debe ser posterior a la fecha limite actual.", 400);
    }
};
const ensureObservationEligibleForExtension = (observation) => {
    if (terminalObservationStatuses.has(observation.status.key)) {
        throw new AppError("No puede solicitar ampliaciones de plazo para observaciones cerradas o terminales.", 409);
    }
};
const ensureCommitmentEligibleForExtension = (commitment) => {
    if (isCommitmentCompleted(commitment)) {
        throw new AppError("No puede solicitar ampliaciones de plazo para compromisos completados.", 409);
    }
};
const assertNoActiveRequest = async (input) => {
    const activeRequest = await extensionRequestPrisma.deadlineExtensionRequest.findFirst({
        select: {
            id: true,
            status: true,
        },
        where: {
            commitmentId: input.commitmentId,
            deletedAt: null,
            observationId: input.observationId,
            status: {
                in: Array.from(ACTIVE_EXTENSION_REQUEST_STATUSES),
            },
            ...(input.requestIdToIgnore
                ? {
                    id: {
                        not: input.requestIdToIgnore,
                    },
                }
                : {}),
        },
    });
    if (activeRequest) {
        throw new AppError("Ya existe una solicitud activa de ampliacion de plazo para este objetivo.", 409);
    }
};
const findObservationContextById = async (observationId) => {
    const observation = await extensionRequestPrisma.observation.findFirst({
        select: observationContextSelect,
        where: {
            deletedAt: null,
            id: observationId,
        },
    });
    if (!observation) {
        throw new AppError("Observacion no encontrada.", 404);
    }
    return observation;
};
const findCommitmentContextById = async (commitmentId) => {
    const commitment = await extensionRequestPrisma.commitment.findFirst({
        select: {
            ...commitmentContextSelect,
            observation: {
                select: observationContextSelect,
            },
        },
        where: {
            deletedAt: null,
            id: commitmentId,
        },
    });
    if (!commitment) {
        throw new AppError("Compromiso no encontrado.", 404);
    }
    return commitment;
};
const getRequestContextById = async (requestId) => {
    const request = await extensionRequestPrisma.deadlineExtensionRequest.findFirst({
        select: requestContextSelect,
        where: {
            deletedAt: null,
            id: requestId,
        },
    });
    if (!request) {
        throw new AppError("Solicitud de ampliacion no encontrada.", 404);
    }
    return request;
};
const findRequestContextById = async (requestId, access) => {
    const request = await getRequestContextById(requestId);
    if (!canViewRequest(request, access)) {
        throw new AppError("No tiene acceso a esta solicitud de ampliacion.", 403);
    }
    return request;
};
const syncRequestAttachments = async (requestId, observationId, evidenceFileIds, db) => {
    const uniqueEvidenceFileIds = Array.from(new Set(evidenceFileIds));
    const evidenceFiles = uniqueEvidenceFileIds.length
        ? await db.evidenceFile.findMany({
            select: {
                id: true,
            },
            where: {
                deletedAt: null,
                id: {
                    in: uniqueEvidenceFileIds,
                },
                observationId,
            },
        })
        : [];
    if (evidenceFiles.length !== uniqueEvidenceFileIds.length) {
        throw new AppError("Uno o mas documentos de respaldo no pertenecen a la observacion seleccionada.", 400);
    }
    await db.deadlineExtensionAttachment.deleteMany({
        where: {
            extensionRequestId: requestId,
        },
    });
    if (uniqueEvidenceFileIds.length === 0) {
        return;
    }
    await db.deadlineExtensionAttachment.createMany({
        data: uniqueEvidenceFileIds.map((evidenceFileId) => ({
            evidenceFileId,
            extensionRequestId: requestId,
        })),
    });
};
const assertTargetDueDateIsCurrent = (request) => {
    const currentTargetDueDate = request.commitment?.dueDate ?? request.observation.dueDate;
    if (currentTargetDueDate.getTime() !== request.currentDueDate.getTime()) {
        throw new AppError("La fecha limite actual del objetivo cambio. Actualice la solicitud antes de continuar.", 409);
    }
    ensureRequestedDueDateAfterCurrent(request.requestedDueDate, currentTargetDueDate);
};
const updateTargetDueDate = async (request, db) => {
    if (request.commitmentId) {
        await db.commitment.update({
            data: {
                dueDate: request.requestedDueDate,
            },
            where: {
                id: request.commitmentId,
            },
        });
        return;
    }
    await db.observation.update({
        data: {
            dueDate: request.requestedDueDate,
        },
        where: {
            id: request.observationId,
        },
    });
};
const buildDueDateStakeholderUserIds = (request) => {
    return Array.from(new Set([
        request.requestedByUserId,
        request.observation.responsibleUser?.id ?? null,
        request.observation.area.managerUser?.id ?? null,
        request.commitment?.responsibleUser?.id ?? null,
        request.commitment?.remediationPlan.ownerUser?.id ?? null,
        ...request.observation.areaAssignments.flatMap((assignment) => [
            assignment.responsibleUser?.id ?? null,
            assignment.area.managerUser?.id ?? null,
        ]),
    ].filter((value) => Boolean(value))));
};
const notifySentToManager = async (request, actorUserId) => {
    const managerUserId = request.area.managerUser?.id;
    if (!managerUserId || managerUserId === actorUserId) {
        return;
    }
    await notificationService.create({
        message: `La solicitud de ampliacion para ${request.observation.code} fue enviada a Gerencia para revision.`,
        title: "Nueva solicitud de ampliacion",
        type: "info",
        userId: managerUserId,
    });
};
const notifySentToAudit = async (request, actorUserId) => {
    const auditorUserId = request.observation.auditorUser.id;
    if (!auditorUserId || auditorUserId === actorUserId) {
        return;
    }
    await notificationService.create({
        message: `La solicitud de ampliacion para ${request.observation.code} esta lista para revision final de Auditoria.`,
        title: "Solicitud pendiente en Auditoria",
        type: "info",
        userId: auditorUserId,
    });
};
const notifyRejectedToRequester = async (request, title, message) => {
    await notificationService.create({
        message,
        title,
        type: "warning",
        userId: request.requestedByUserId,
    });
};
const notifyFinalApproval = async (request, actorUserId) => {
    const userIds = buildDueDateStakeholderUserIds(request).filter((userId) => userId !== actorUserId);
    if (userIds.length === 0) {
        return;
    }
    const targetLabel = request.commitment
        ? `el compromiso "${request.commitment.title}"`
        : `la observacion ${request.observation.code}`;
    await notificationService.createMany({
        message: `Se aprobo la ampliacion de plazo para ${targetLabel}. La nueva fecha comprometida es ${request.requestedDueDate.toLocaleDateString("es-BO")}.`,
        title: "Ampliacion de plazo aprobada",
        type: "success",
        userIds,
    });
};
const mapEvidenceItem = (evidence) => {
    return {
        createdAt: evidence.createdAt.toISOString(),
        description: evidence.description,
        downloadPath: `/api/evidences/${evidence.id}/download`,
        id: evidence.id,
        mimeType: evidence.mimeType,
        originalName: evidence.originalName,
        sizeBytes: evidence.sizeBytes.toString(),
        uploadedByUser: mapUserSummary(evidence.uploadedByUser),
    };
};
const mapCommitmentSummary = (commitment) => {
    if (!commitment) {
        return null;
    }
    return {
        dueDate: commitment.dueDate.toISOString(),
        effectiveStatus: buildCommitmentEffectiveStatus(commitment),
        id: commitment.id,
        progressPercent: commitment.progressPercent,
        responsibleUser: mapUserSummary(commitment.responsibleUser),
        status: commitment.status,
        title: commitment.title,
    };
};
const mapRequestListItem = (request, access) => {
    const currentDueDate = request.currentDueDate;
    const requestedDueDate = request.requestedDueDate;
    return {
        area: {
            id: request.area.id,
            managerUser: mapUserSummary(request.area.managerUser),
            name: request.area.name,
        },
        canCancel: canCancelRequest(request, access),
        canEdit: canEditRequest(request, access),
        canReview: canReviewRequestAsAudit(request, access) || canReviewRequestAsManager(request, access),
        commitment: request.commitment
            ? {
                id: request.commitment.id,
                title: request.commitment.title,
            }
            : null,
        currentDueDate: currentDueDate.toISOString(),
        id: request.id,
        impactDays: calculateImpactDays(currentDueDate, requestedDueDate),
        isOverdue: currentDueDate.getTime() < Date.now(),
        observation: {
            code: request.observation.code,
            id: request.observation.id,
            riskLevel: {
                colorToken: request.observation.riskLevel.colorToken,
                id: request.observation.riskLevel.id,
                key: request.observation.riskLevel.key,
                name: request.observation.riskLevel.name,
            },
            title: request.observation.title,
        },
        pendingForCurrentUser: canReviewRequestAsAudit(request, access) || canReviewRequestAsManager(request, access),
        requestedByUser: mapUserSummary(request.requestedByUser),
        requestedDueDate: requestedDueDate.toISOString(),
        status: request.status,
        updatedAt: request.updatedAt.toISOString(),
    };
};
const mapRequestDetail = (request, access, settings) => {
    const listItem = mapRequestListItem(request, access);
    return {
        ...listItem,
        attachments: request.attachments.map((attachment) => mapEvidenceItem(attachment.evidenceFile)),
        auditComment: request.auditComment,
        auditReviewedAt: request.auditReviewedAt?.toISOString() ?? null,
        auditReviewer: mapUserSummary(request.auditReviewer),
        canAuditApprove: canReviewRequestAsAudit(request, access),
        canAuditReject: canReviewRequestAsAudit(request, access),
        canManagerApprove: canReviewRequestAsManager(request, access),
        canManagerReject: canReviewRequestAsManager(request, access),
        canSend: canEditRequest(request, access),
        commitment: mapCommitmentSummary(request.commitment),
        createdAt: request.createdAt.toISOString(),
        finalApprovedAt: request.finalApprovedAt?.toISOString() ?? null,
        managerComment: request.managerComment,
        managerReviewedAt: request.managerReviewedAt?.toISOString() ?? null,
        managerReviewer: mapUserSummary(request.managerReviewer),
        nextSubmissionTarget: getNextSubmissionTarget(settings),
        observation: {
            area: {
                id: request.observation.area.id,
                managerUser: mapUserSummary(request.observation.area.managerUser),
                name: request.observation.area.name,
            },
            auditorUser: mapUserSummary(request.observation.auditorUser),
            code: request.observation.code,
            dueDate: request.observation.dueDate.toISOString(),
            effectiveStatus: buildObservationEffectiveStatus(request.observation),
            id: request.observation.id,
            responsibleUser: mapUserSummary(request.observation.responsibleUser),
            riskLevel: {
                colorToken: request.observation.riskLevel.colorToken,
                id: request.observation.riskLevel.id,
                key: request.observation.riskLevel.key,
                name: request.observation.riskLevel.name,
            },
            title: request.observation.title,
        },
        reason: request.reason,
    };
};
const buildListWhere = (query, access) => {
    const requestedDueDate = buildDateRangeFilter(query.requestedDateFrom, query.requestedDateTo);
    const visibilityCondition = isSystemWideAccess(access) || hasAuditReviewRole(access)
        ? undefined
        : {
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
                    observation: {
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
                        ],
                    },
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
    const pendingMineCondition = query.pendingMine
        ? isSystemWideAccess(access)
            ? {
                status: {
                    in: ["SENT_TO_MANAGER", "SENT_TO_AUDIT"],
                },
            }
            : {
                OR: [
                    {
                        area: {
                            active: true,
                            deletedAt: null,
                            managerUserId: access.userId,
                        },
                        status: "SENT_TO_MANAGER",
                    },
                    hasAuditReviewRole(access)
                        ? {
                            status: "SENT_TO_AUDIT",
                        }
                        : {
                            observation: {
                                auditorUserId: access.userId,
                            },
                            status: "SENT_TO_AUDIT",
                        },
                ],
            }
        : undefined;
    const andConditions = [
        {
            deletedAt: null,
        },
    ];
    if (query.status) {
        andConditions.push({
            status: query.status,
        });
    }
    if (query.areaId) {
        andConditions.push({
            areaId: query.areaId,
        });
    }
    if (query.observationId) {
        andConditions.push({
            observationId: query.observationId,
        });
    }
    if (query.requestedByUserId) {
        andConditions.push({
            requestedByUserId: query.requestedByUserId,
        });
    }
    if (query.riskLevelId) {
        andConditions.push({
            observation: {
                riskLevelId: query.riskLevelId,
            },
        });
    }
    if (requestedDueDate) {
        andConditions.push({
            requestedDueDate,
        });
    }
    if (query.overdue !== undefined) {
        andConditions.push(query.overdue
            ? {
                currentDueDate: {
                    lt: new Date(),
                },
            }
            : {
                currentDueDate: {
                    gte: new Date(),
                },
            });
    }
    if (query.search.length > 0) {
        andConditions.push({
            OR: [
                {
                    observation: {
                        code: {
                            contains: query.search,
                        },
                    },
                },
                {
                    observation: {
                        title: {
                            contains: query.search,
                        },
                    },
                },
                {
                    area: {
                        name: {
                            contains: query.search,
                        },
                    },
                },
                {
                    requestedByUser: {
                        name: {
                            contains: query.search,
                        },
                    },
                },
                {
                    commitment: {
                        title: {
                            contains: query.search,
                        },
                    },
                },
            ],
        });
    }
    if (visibilityCondition) {
        andConditions.push(visibilityCondition);
    }
    if (pendingMineCondition) {
        andConditions.push(pendingMineCondition);
    }
    return {
        AND: andConditions,
    };
};
const buildListOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "currentDueDate":
            return {
                currentDueDate: sortDirection,
            };
        case "observationCode":
            return {
                observation: {
                    code: sortDirection,
                },
            };
        case "requestedDueDate":
            return {
                requestedDueDate: sortDirection,
            };
        case "status":
            return {
                status: sortDirection,
            };
        case "updatedAt":
        default:
            return {
                updatedAt: sortDirection,
            };
    }
};
const buildMutationResult = async (requestId, access, previousRequest) => {
    const settings = await getApprovalSettings();
    const currentRequest = await findRequestContextById(requestId, access);
    return {
        current: mapRequestDetail(currentRequest, access, settings),
        previous: previousRequest ? mapRequestDetail(previousRequest, access, settings) : null,
    };
};
const createRequest = async (input) => {
    ensureRequestedDueDateAfterCurrent(input.payload.requestedDueDate, input.targetDueDate);
    await assertNoActiveRequest({
        commitmentId: input.commitmentId,
        observationId: input.observationId,
    });
    const requestId = await extensionRequestPrisma.$transaction(async (transaction) => {
        const created = await transaction.deadlineExtensionRequest.create({
            data: {
                areaId: input.areaId,
                commitmentId: input.commitmentId,
                currentDueDate: input.targetDueDate,
                observationId: input.observationId,
                reason: input.payload.reason.trim(),
                requestedByUserId: input.access.userId,
                requestedDueDate: input.payload.requestedDueDate,
                status: "DRAFT",
            },
            select: {
                id: true,
            },
        });
        await syncRequestAttachments(created.id, input.observationId, input.payload.evidenceFileIds ?? [], transaction);
        return created.id;
    });
    return buildMutationResult(requestId, input.access, null);
};
export const extensionRequestsService = {
    async auditApprove(requestId, input, access) {
        const request = await findRequestContextById(requestId, access);
        if (!canReviewRequestAsAudit(request, access)) {
            throw new AppError("No puede aprobar esta solicitud como Auditoria.", 403);
        }
        assertTargetDueDateIsCurrent(request);
        const comment = input.comment?.trim() || null;
        await extensionRequestPrisma.$transaction(async (transaction) => {
            await updateTargetDueDate(request, transaction);
            await transaction.deadlineExtensionRequest.update({
                data: {
                    auditComment: comment,
                    auditReviewedAt: new Date(),
                    auditReviewerId: access.userId,
                    finalApprovedAt: new Date(),
                    status: "AUDIT_APPROVED",
                },
                where: {
                    id: requestId,
                },
            });
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifyFinalApproval(await getRequestContextById(requestId), access.userId);
        return result;
    },
    async auditReject(requestId, input, access) {
        const request = await findRequestContextById(requestId, access);
        if (!canReviewRequestAsAudit(request, access)) {
            throw new AppError("No puede rechazar esta solicitud como Auditoria.", 403);
        }
        const comment = ensureReviewComment("audit-reject", input);
        await extensionRequestPrisma.deadlineExtensionRequest.update({
            data: {
                auditComment: comment,
                auditReviewedAt: new Date(),
                auditReviewerId: access.userId,
                finalApprovedAt: null,
                status: "AUDIT_REJECTED",
            },
            where: {
                id: requestId,
            },
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifyRejectedToRequester(await getRequestContextById(requestId), "Ampliacion rechazada por Auditoria", `Auditoria rechazo la solicitud de ampliacion para ${request.observation.code}. Revise el comentario y ajuste la propuesta.`);
        return result;
    },
    async cancel(requestId, access) {
        const request = await findRequestContextById(requestId, access);
        if (!canCancelRequest(request, access)) {
            throw new AppError("No puede cancelar esta solicitud en el estado actual.", 403);
        }
        await extensionRequestPrisma.deadlineExtensionRequest.update({
            data: {
                status: "CANCELLED",
            },
            where: {
                id: requestId,
            },
        });
        return buildMutationResult(requestId, access, request);
    },
    async createForCommitment(commitmentId, payload, access) {
        const settings = await getApprovalSettings();
        ensureDeadlineExtensionsEnabled(settings);
        const commitment = await findCommitmentContextById(commitmentId);
        ensureCommitmentEligibleForExtension(commitment);
        if (!canRequestCommitmentExtension(commitment, access)) {
            throw new AppError("No puede solicitar ampliaciones para este compromiso.", 403);
        }
        return createRequest({
            access,
            areaId: commitment.remediationPlan.areaId,
            commitmentId,
            observationId: commitment.observation.id,
            payload,
            targetDueDate: commitment.dueDate,
        });
    },
    async createForObservation(observationId, payload, access) {
        const settings = await getApprovalSettings();
        ensureDeadlineExtensionsEnabled(settings);
        const observation = await findObservationContextById(observationId);
        ensureObservationEligibleForExtension(observation);
        const requesterArea = resolveObservationRequesterArea(observation, access);
        if (!requesterArea) {
            throw new AppError("Solo el area asignada o su gerencia puede solicitar ampliaciones para esta observacion.", 403);
        }
        return createRequest({
            access,
            areaId: requesterArea.area.id,
            commitmentId: null,
            observationId,
            payload,
            targetDueDate: observation.dueDate,
        });
    },
    async getById(requestId, access) {
        const settings = await getApprovalSettings();
        const request = await findRequestContextById(requestId, access);
        return mapRequestDetail(request, access, settings);
    },
    async list(query, access) {
        const where = buildListWhere(query, access);
        const [total, requests] = await extensionRequestPrisma.$transaction([
            extensionRequestPrisma.deadlineExtensionRequest.count({
                where,
            }),
            extensionRequestPrisma.deadlineExtensionRequest.findMany({
                orderBy: buildListOrderBy(query.sortBy, query.sortDirection),
                select: requestContextSelect,
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: requests.map((request) => mapRequestListItem(request, access)),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async managerApprove(requestId, input, access) {
        const settings = await getApprovalSettings();
        const request = await findRequestContextById(requestId, access);
        if (!canReviewRequestAsManager(request, access)) {
            throw new AppError("No puede aprobar esta solicitud como Gerencia.", 403);
        }
        assertTargetDueDateIsCurrent(request);
        const comment = input.comment?.trim() || null;
        if (settings.requiresAuditApproval) {
            await extensionRequestPrisma.deadlineExtensionRequest.update({
                data: {
                    auditComment: null,
                    auditReviewedAt: null,
                    auditReviewerId: null,
                    finalApprovedAt: null,
                    managerComment: comment,
                    managerReviewedAt: new Date(),
                    managerReviewerId: access.userId,
                    status: "SENT_TO_AUDIT",
                },
                where: {
                    id: requestId,
                },
            });
            const result = await buildMutationResult(requestId, access, request);
            await notifySentToAudit(await getRequestContextById(requestId), access.userId);
            return result;
        }
        await extensionRequestPrisma.$transaction(async (transaction) => {
            await updateTargetDueDate(request, transaction);
            await transaction.deadlineExtensionRequest.update({
                data: {
                    finalApprovedAt: new Date(),
                    managerComment: comment,
                    managerReviewedAt: new Date(),
                    managerReviewerId: access.userId,
                    status: "MANAGER_APPROVED",
                },
                where: {
                    id: requestId,
                },
            });
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifyFinalApproval(await getRequestContextById(requestId), access.userId);
        return result;
    },
    async managerReject(requestId, input, access) {
        const request = await findRequestContextById(requestId, access);
        if (!canReviewRequestAsManager(request, access)) {
            throw new AppError("No puede rechazar esta solicitud como Gerencia.", 403);
        }
        const comment = ensureReviewComment("manager-reject", input);
        await extensionRequestPrisma.deadlineExtensionRequest.update({
            data: {
                finalApprovedAt: null,
                managerComment: comment,
                managerReviewedAt: new Date(),
                managerReviewerId: access.userId,
                status: "MANAGER_REJECTED",
            },
            where: {
                id: requestId,
            },
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifyRejectedToRequester(await getRequestContextById(requestId), "Ampliacion rechazada por Gerencia", `Gerencia rechazo la solicitud de ampliacion para ${request.observation.code}. Revise el comentario y ajuste la propuesta.`);
        return result;
    },
    async sendToAudit(requestId, access) {
        const settings = await getApprovalSettings();
        ensureDeadlineExtensionsEnabled(settings);
        const request = await findRequestContextById(requestId, access);
        if (settings.requiresManagerApproval && request.status !== "MANAGER_APPROVED") {
            throw new AppError("Esta solicitud requiere aprobación previa de Gerencia antes de enviarse a Auditoria.", 409);
        }
        if (!canEditRequest(request, access) && request.status !== "MANAGER_APPROVED") {
            throw new AppError("No puede enviar esta solicitud a Auditoria.", 403);
        }
        assertTargetDueDateIsCurrent(request);
        if (!settings.requiresAuditApproval) {
            await extensionRequestPrisma.$transaction(async (transaction) => {
                await updateTargetDueDate(request, transaction);
                await transaction.deadlineExtensionRequest.update({
                    data: {
                        finalApprovedAt: new Date(),
                        status: "AUDIT_APPROVED",
                    },
                    where: {
                        id: requestId,
                    },
                });
            });
            const result = await buildMutationResult(requestId, access, request);
            await notifyFinalApproval(await getRequestContextById(requestId), access.userId);
            return result;
        }
        await extensionRequestPrisma.deadlineExtensionRequest.update({
            data: {
                auditComment: null,
                auditReviewedAt: null,
                auditReviewerId: null,
                currentDueDate: request.commitment?.dueDate ?? request.observation.dueDate,
                finalApprovedAt: null,
                managerComment: settings.requiresManagerApproval ? request.managerComment : null,
                managerReviewedAt: settings.requiresManagerApproval ? request.managerReviewedAt : null,
                managerReviewerId: settings.requiresManagerApproval ? request.managerReviewerId : null,
                status: "SENT_TO_AUDIT",
            },
            where: {
                id: requestId,
            },
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifySentToAudit(await getRequestContextById(requestId), access.userId);
        return result;
    },
    async sendToManager(requestId, access) {
        const settings = await getApprovalSettings();
        ensureDeadlineExtensionsEnabled(settings);
        if (!settings.requiresManagerApproval) {
            throw new AppError("La aprobación de Gerencia no es requerida para esta solicitud. Envíela directamente a Auditoria.", 409);
        }
        const request = await findRequestContextById(requestId, access);
        if (!canEditRequest(request, access)) {
            throw new AppError("No puede enviar esta solicitud a Gerencia.", 403);
        }
        assertTargetDueDateIsCurrent(request);
        await extensionRequestPrisma.deadlineExtensionRequest.update({
            data: {
                auditComment: null,
                auditReviewedAt: null,
                auditReviewerId: null,
                currentDueDate: request.commitment?.dueDate ?? request.observation.dueDate,
                finalApprovedAt: null,
                managerComment: null,
                managerReviewedAt: null,
                managerReviewerId: null,
                status: "SENT_TO_MANAGER",
            },
            where: {
                id: requestId,
            },
        });
        const result = await buildMutationResult(requestId, access, request);
        await notifySentToManager(await getRequestContextById(requestId), access.userId);
        return result;
    },
    async update(requestId, input, access) {
        const request = await findRequestContextById(requestId, access);
        if (!canEditRequest(request, access)) {
            throw new AppError("No puede editar esta solicitud de ampliacion.", 403);
        }
        const latestCurrentDueDate = request.commitment?.dueDate ?? request.observation.dueDate;
        const requestedDueDate = input.requestedDueDate ?? request.requestedDueDate;
        ensureRequestedDueDateAfterCurrent(requestedDueDate, latestCurrentDueDate);
        await assertNoActiveRequest({
            commitmentId: request.commitmentId,
            observationId: request.observationId,
            requestIdToIgnore: requestId,
        });
        await extensionRequestPrisma.$transaction(async (transaction) => {
            await transaction.deadlineExtensionRequest.update({
                data: {
                    ...(input.reason !== undefined
                        ? {
                            reason: input.reason.trim(),
                        }
                        : {}),
                    ...(input.requestedDueDate
                        ? {
                            requestedDueDate: input.requestedDueDate,
                        }
                        : {}),
                    currentDueDate: latestCurrentDueDate,
                },
                where: {
                    id: requestId,
                },
            });
            if (input.evidenceFileIds !== undefined) {
                await syncRequestAttachments(requestId, request.observationId, input.evidenceFileIds, transaction);
            }
        });
        return buildMutationResult(requestId, access, request);
    },
};
//# sourceMappingURL=extension-requests.service.js.map