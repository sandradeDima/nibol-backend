/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomUUID } from "node:crypto";
import { access as fsAccess, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { uploadsRootDir } from "../../utils/uploads.js";
import { OBSERVATION_TERMINAL_STATUS_KEYS } from "../observations/observations.constants.js";
import { AUDIT_ROLE_MARKERS, SYSTEM_WIDE_ROLE_NAMES } from "../remediation/remediation.constants.js";
import { AREA_VISIBLE_COMMENT_VISIBILITIES, AUDIT_VISIBLE_COMMENT_VISIBILITIES, EDITABLE_PROGRESS_STATUSES, } from "./progress.constants.js";
const progressPrisma = prisma;
const DEFAULT_EVIDENCE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const terminalObservationStatuses = new Set(OBSERVATION_TERMINAL_STATUS_KEYS);
const ALLOWED_EVIDENCE_TYPES = {
    ".doc": new Set(["application/msword"]),
    ".docx": new Set([
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]),
    ".jpeg": new Set(["image/jpeg"]),
    ".jpg": new Set(["image/jpeg"]),
    ".pdf": new Set(["application/pdf"]),
    ".png": new Set(["image/png"]),
    ".xls": new Set(["application/vnd.ms-excel"]),
    ".xlsx": new Set([
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]),
};
const userSummarySelect = {
    email: true,
    id: true,
    name: true,
    userRoles: {
        orderBy: {
            role: {
                name: "asc",
            },
        },
        select: {
            role: {
                select: {
                    name: true,
                },
            },
        },
        take: 1,
        where: {
            role: {
                deletedAt: null,
            },
        },
    },
};
const areaSummarySelect = {
    id: true,
    name: true,
};
const areaWithManagerSelect = {
    id: true,
    managerUser: {
        select: userSummarySelect,
    },
    name: true,
};
const observationWorkspaceSelect = {
    area: {
        select: areaWithManagerSelect,
    },
    areaAssignments: {
        orderBy: {
            area: {
                name: "asc",
            },
        },
        select: {
            area: {
                select: areaWithManagerSelect,
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
    commitments: {
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: {
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
                    status: true,
                },
            },
            remediationPlanId: true,
            responsibleUser: {
                select: userSummarySelect,
            },
            responsibleUserId: true,
            status: true,
            title: true,
        },
        where: {
            deletedAt: null,
        },
    },
    dueDate: true,
    id: true,
    progressPercent: true,
    remediationPlans: {
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
            id: true,
            ownerUser: {
                select: userSummarySelect,
            },
            status: true,
        },
        where: {
            deletedAt: null,
        },
    },
    responsibleUser: {
        select: userSummarySelect,
    },
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
            key: true,
            name: true,
        },
    },
    title: true,
};
const reviewHistorySelect = {
    action: true,
    comment: true,
    createdAt: true,
    fromStatus: true,
    id: true,
    toStatus: true,
    user: {
        select: userSummarySelect,
    },
};
const evidenceSelect = {
    commitmentId: true,
    createdAt: true,
    description: true,
    id: true,
    mimeType: true,
    originalName: true,
    progressUpdateId: true,
    remediationPlanId: true,
    sizeBytes: true,
    uploadedByUser: {
        select: userSummarySelect,
    },
    uploadedByUserId: true,
};
const progressUpdateTimelineSelect = {
    comment: true,
    commitmentId: true,
    createdAt: true,
    evidenceFiles: {
        orderBy: {
            createdAt: "desc",
        },
        select: evidenceSelect,
        where: {
            deletedAt: null,
        },
    },
    id: true,
    progressPercent: true,
    remediationPlanId: true,
    reviewComment: true,
    reviewHistory: {
        orderBy: {
            createdAt: "asc",
        },
        select: reviewHistorySelect,
    },
    reviewedAt: true,
    reviewedByUser: {
        select: userSummarySelect,
    },
    status: true,
    submittedByUser: {
        select: userSummarySelect,
    },
    submittedByUserId: true,
    type: true,
    updatedAt: true,
};
const progressUpdateContextSelect = {
    ...progressUpdateTimelineSelect,
    observation: {
        select: observationWorkspaceSelect,
    },
};
const commentSelect = {
    authorUser: {
        select: userSummarySelect,
    },
    authorUserId: true,
    body: true,
    commitmentId: true,
    createdAt: true,
    id: true,
    progressUpdateId: true,
    remediationPlanId: true,
    updatedAt: true,
    visibility: true,
};
const commentContextSelect = {
    ...commentSelect,
    observation: {
        select: observationWorkspaceSelect,
    },
};
const evidenceContextSelect = {
    ...evidenceSelect,
    observation: {
        select: observationWorkspaceSelect,
    },
    progressUpdate: {
        select: {
            commitmentId: true,
            id: true,
            status: true,
            submittedByUserId: true,
        },
    },
    relativePath: true,
    storedName: true,
};
const progressListSelect = {
    commitment: {
        select: {
            responsibleUser: {
                select: userSummarySelect,
            },
            responsibleUserId: true,
        },
    },
    createdAt: true,
    evidenceFiles: {
        select: {
            id: true,
        },
        where: {
            deletedAt: null,
        },
    },
    id: true,
    observation: {
        select: {
            area: {
                select: areaSummarySelect,
            },
            areaId: true,
            code: true,
            id: true,
            responsibleUser: {
                select: userSummarySelect,
            },
            responsibleUserId: true,
            riskLevel: {
                select: {
                    colorToken: true,
                    id: true,
                    key: true,
                    name: true,
                },
            },
            title: true,
        },
    },
    progressPercent: true,
    remediationPlan: {
        select: {
            area: {
                select: areaSummarySelect,
            },
            areaId: true,
            ownerUser: {
                select: userSummarySelect,
            },
            ownerUserId: true,
        },
    },
    reviewHistory: {
        orderBy: {
            createdAt: "asc",
        },
        select: {
            action: true,
            createdAt: true,
        },
    },
    status: true,
    submittedByUserId: true,
    type: true,
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
        roleLabel: user.userRoles?.[0]?.role?.name ?? null,
    };
};
const canReviewObservation = (observation, access) => {
    return (isSystemWideAccess(access) ||
        observation.auditorUser.id === access.userId ||
        hasAuditReviewRole(access));
};
const buildAssignedAreas = (observation, access) => {
    const baseAreas = [
        {
            area: observation.area,
            canManage: false,
            isPrimary: true,
            responsibleUser: observation.responsibleUser,
            roleInFinding: "Area principal",
        },
        ...observation.areaAssignments.map((assignment) => ({
            area: assignment.area,
            canManage: false,
            isPrimary: false,
            responsibleUser: assignment.responsibleUser,
            roleInFinding: assignment.roleInFinding,
        })),
    ];
    return baseAreas.map((areaContext) => ({
        ...areaContext,
        canManage: isSystemWideAccess(access) ||
            areaContext.area.managerUser?.id === access.userId ||
            areaContext.responsibleUser?.id === access.userId,
    }));
};
const canManageObservationProgress = (observation, access) => {
    if (isSystemWideAccess(access)) {
        return true;
    }
    return buildAssignedAreas(observation, access).some((area) => area.canManage);
};
const canContributeToObservation = (observation, access, commitmentId = null) => {
    if (hasAuditReviewRole(access) && !isSystemWideAccess(access)) {
        return false;
    }
    if (canManageObservationProgress(observation, access)) {
        return true;
    }
    if (observation.responsibleUser?.id === access.userId && !commitmentId) {
        return true;
    }
    if (!commitmentId) {
        return false;
    }
    return observation.commitments.some((commitment) => {
        return commitment.id === commitmentId && commitment.responsibleUserId === access.userId;
    });
};
const canInteractWithObservation = (observation, access) => {
    if (isSystemWideAccess(access) || canReviewObservation(observation, access)) {
        return true;
    }
    if (canManageObservationProgress(observation, access)) {
        return true;
    }
    if (observation.responsibleUser?.id === access.userId) {
        return true;
    }
    return observation.commitments.some((commitment) => commitment.responsibleUserId === access.userId);
};
const buildObservationVisibilityCondition = (access) => {
    if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
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
const resolveCommitmentStatus = (currentStatus, progressPercent) => {
    if (progressPercent >= 100) {
        return {
            completedAt: new Date(),
            status: "COMPLETED",
        };
    }
    if (progressPercent > 0 && (currentStatus === "PENDING" || currentStatus === "RETURNED")) {
        return {
            completedAt: null,
            status: "IN_PROGRESS",
        };
    }
    if (currentStatus === "COMPLETED" && progressPercent < 100) {
        return {
            completedAt: null,
            status: "IN_PROGRESS",
        };
    }
    return {
        completedAt: null,
        status: currentStatus,
    };
};
const getCommentVisibilityValues = (access) => {
    if (isSystemWideAccess(access) || hasAuditReviewRole(access)) {
        return AUDIT_VISIBLE_COMMENT_VISIBILITIES;
    }
    return AREA_VISIBLE_COMMENT_VISIBILITIES;
};
const mapEvidenceItem = (evidence, canDelete) => {
    return {
        canDelete,
        commitmentId: evidence.commitmentId,
        createdAt: evidence.createdAt.toISOString(),
        description: evidence.description,
        downloadPath: `/api/evidences/${evidence.id}/download`,
        id: evidence.id,
        mimeType: evidence.mimeType,
        originalName: evidence.originalName,
        progressUpdateId: evidence.progressUpdateId,
        remediationPlanId: evidence.remediationPlanId,
        sizeBytes: evidence.sizeBytes.toString(),
        uploadedByUser: mapUserSummary(evidence.uploadedByUser),
    };
};
const mapReviewHistoryEntry = (entry) => {
    return {
        action: entry.action,
        comment: entry.comment,
        createdAt: entry.createdAt.toISOString(),
        fromStatus: entry.fromStatus,
        id: entry.id,
        toStatus: entry.toStatus,
        user: mapUserSummary(entry.user),
    };
};
const canEditProgressUpdate = (progressUpdate, observation, access) => {
    if (isSystemWideAccess(access)) {
        return true;
    }
    if (!EDITABLE_PROGRESS_STATUSES.has(progressUpdate.status)) {
        return false;
    }
    if (progressUpdate.submittedByUserId === access.userId) {
        return true;
    }
    return canContributeToObservation(observation, access, progressUpdate.commitmentId);
};
const mapProgressUpdateItem = (progressUpdate, observation, access) => {
    const canReview = canReviewObservation(observation, access);
    const canEdit = canEditProgressUpdate(progressUpdate, observation, access);
    return {
        canApprove: canReview && progressUpdate.status === "SENT_TO_AUDIT",
        canEdit,
        canReject: canReview && progressUpdate.status === "SENT_TO_AUDIT",
        canReturn: canReview && progressUpdate.status === "SENT_TO_AUDIT",
        canSendToAudit: canEdit && progressUpdate.status !== "SENT_TO_AUDIT",
        comment: progressUpdate.comment,
        commitmentId: progressUpdate.commitmentId,
        createdAt: progressUpdate.createdAt.toISOString(),
        evidences: progressUpdate.evidenceFiles.map((evidence) => mapEvidenceItem(evidence, canEdit)),
        history: progressUpdate.reviewHistory.map((entry) => mapReviewHistoryEntry(entry)),
        id: progressUpdate.id,
        progressPercent: progressUpdate.progressPercent,
        remediationPlanId: progressUpdate.remediationPlanId,
        reviewComment: progressUpdate.reviewComment,
        reviewedAt: progressUpdate.reviewedAt?.toISOString() ?? null,
        reviewedByUser: mapUserSummary(progressUpdate.reviewedByUser),
        status: progressUpdate.status,
        submittedByUser: mapUserSummary(progressUpdate.submittedByUser),
        type: progressUpdate.type,
        updatedAt: progressUpdate.updatedAt.toISOString(),
    };
};
const mapCommentItem = (comment, access) => {
    const canEdit = isSystemWideAccess(access)
        ? comment.visibility !== "SYSTEM"
        : comment.authorUserId === access.userId && comment.visibility !== "SYSTEM";
    return {
        authorUser: mapUserSummary(comment.authorUser),
        body: comment.body,
        canDelete: canEdit,
        canEdit,
        commitmentId: comment.commitmentId,
        createdAt: comment.createdAt.toISOString(),
        id: comment.id,
        progressUpdateId: comment.progressUpdateId,
        remediationPlanId: comment.remediationPlanId,
        updatedAt: comment.updatedAt.toISOString(),
        visibility: comment.visibility,
    };
};
const buildProgressListArea = (progressUpdate) => {
    return progressUpdate.remediationPlan?.area ?? progressUpdate.observation.area;
};
const buildProgressListResponsibleUser = (progressUpdate) => {
    return (mapUserSummary(progressUpdate.commitment?.responsibleUser) ??
        mapUserSummary(progressUpdate.remediationPlan?.ownerUser) ??
        mapUserSummary(progressUpdate.observation.responsibleUser));
};
const extractSentToAuditAt = (progressUpdate) => {
    const lastSentEntry = [...progressUpdate.reviewHistory]
        .reverse()
        .find((entry) => entry.action === "SENT");
    return lastSentEntry?.createdAt?.toISOString?.() ?? null;
};
const buildProgressListWhere = (query, access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    const createdAt = query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom
                ? {
                    gte: new Date(`${query.dateFrom}T00:00:00.000Z`),
                }
                : {}),
            ...(query.dateTo
                ? {
                    lte: new Date(`${query.dateTo}T23:59:59.999Z`),
                }
                : {}),
        }
        : undefined;
    return {
        deletedAt: null,
        ...(createdAt
            ? {
                createdAt,
            }
            : {}),
        ...(query.status
            ? {
                status: query.status,
            }
            : {}),
        ...(query.type
            ? {
                type: query.type,
            }
            : {}),
        ...(query.areaId
            ? {
                OR: [
                    {
                        remediationPlan: {
                            areaId: query.areaId,
                        },
                    },
                    {
                        AND: [
                            {
                                remediationPlanId: null,
                            },
                            {
                                observation: {
                                    areaId: query.areaId,
                                },
                            },
                        ],
                    },
                ],
            }
            : {}),
        ...(query.riskLevelId
            ? {
                observation: {
                    riskLevelId: query.riskLevelId,
                },
            }
            : {}),
        ...(query.responsibleUserId
            ? {
                OR: [
                    {
                        observation: {
                            responsibleUserId: query.responsibleUserId,
                        },
                    },
                    {
                        commitment: {
                            responsibleUserId: query.responsibleUserId,
                        },
                    },
                    {
                        remediationPlan: {
                            ownerUserId: query.responsibleUserId,
                        },
                    },
                ],
            }
            : {}),
        ...(query.evidencePending === undefined
            ? {}
            : query.evidencePending
                ? {
                    evidenceFiles: {
                        none: {
                            deletedAt: null,
                        },
                    },
                }
                : {
                    evidenceFiles: {
                        some: {
                            deletedAt: null,
                        },
                    },
                }),
        ...(query.search.length > 0
            ? {
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
                        observation: {
                            area: {
                                name: {
                                    contains: query.search,
                                },
                            },
                        },
                    },
                    {
                        remediationPlan: {
                            area: {
                                name: {
                                    contains: query.search,
                                },
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
            }
            : {}),
        ...(visibilityCondition
            ? {
                observation: visibilityCondition,
            }
            : {}),
    };
};
const buildProgressListOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "observationCode":
            return {
                observation: {
                    code: sortDirection,
                },
            };
        case "progressPercent":
            return {
                progressPercent: sortDirection,
            };
        case "status":
            return {
                status: sortDirection,
            };
        case "type":
            return {
                type: sortDirection,
            };
        case "createdAt":
        default:
            return {
                createdAt: sortDirection,
            };
    }
};
const buildEvidenceAbsolutePath = (relativePath) => {
    return path.join(uploadsRootDir, relativePath);
};
const buildEvidenceRelativePath = (date, storedName) => {
    const year = String(date.getUTCFullYear());
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return path.posix.join("evidences", year, month, storedName);
};
const sanitizeOriginalName = (originalName) => {
    const safeBaseName = path
        .basename(originalName)
        .replace(/[^a-zA-Z0-9.\-_\s()]/g, "_")
        .trim();
    return safeBaseName.length > 0 ? safeBaseName : "evidencia";
};
const getAllowedMimeTypesForExtension = (extension) => {
    return ALLOWED_EVIDENCE_TYPES[extension] ?? null;
};
const assertEvidenceFileAllowed = (file, maxFileSizeBytes) => {
    if (file.size > maxFileSizeBytes) {
        throw new AppError(`El archivo supera el limite permitido de ${Math.round(maxFileSizeBytes / (1024 * 1024))} MB.`, 400);
    }
    const sanitizedOriginalName = sanitizeOriginalName(file.originalName);
    const extension = path.extname(sanitizedOriginalName).toLowerCase();
    const allowedMimeTypes = getAllowedMimeTypesForExtension(extension);
    if (!allowedMimeTypes) {
        throw new AppError("El tipo de archivo no esta permitido para evidencias.", 400);
    }
    if (!allowedMimeTypes.has(file.mimetype)) {
        throw new AppError("El tipo MIME del archivo no es valido para evidencias.", 400);
    }
};
const getEvidenceMaxFileSizeBytes = async () => {
    const parameter = await progressPrisma.systemParameter.findFirst({
        select: {
            value: true,
        },
        where: {
            active: true,
            deletedAt: null,
            key: "evidence_max_file_size_mb",
        },
    });
    const parsedValue = Number(parameter?.value ?? "");
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return DEFAULT_EVIDENCE_MAX_FILE_SIZE_BYTES;
    }
    return Math.round(parsedValue * 1024 * 1024);
};
const prepareEvidenceFiles = async (files) => {
    const maxFileSizeBytes = await getEvidenceMaxFileSizeBytes();
    return Promise.all(files.map(async (file) => {
        assertEvidenceFileAllowed(file, maxFileSizeBytes);
        const timestamp = new Date();
        const safeOriginalName = sanitizeOriginalName(file.originalName);
        const extension = path.extname(safeOriginalName).toLowerCase();
        const storedName = `evidence-${Date.now()}-${randomUUID()}${extension}`;
        const relativePath = buildEvidenceRelativePath(timestamp, storedName);
        const absolutePath = buildEvidenceAbsolutePath(relativePath);
        await mkdir(path.dirname(absolutePath), {
            recursive: true,
        });
        await writeFile(absolutePath, file.buffer);
        return {
            absolutePath,
            checksum: createHash("sha256").update(file.buffer).digest("hex"),
            mimeType: file.mimetype,
            originalName: safeOriginalName,
            relativePath,
            sizeBytes: BigInt(file.size),
            storedName,
        };
    }));
};
const cleanupPreparedEvidenceFiles = async (files) => {
    await Promise.all(files.map(async (file) => {
        try {
            await unlink(file.absolutePath);
        }
        catch {
            // Ignore filesystem cleanup failures for already-removed files.
        }
    }));
};
const findObservationContextById = async (observationId, access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    const observation = await progressPrisma.observation.findFirst({
        select: observationWorkspaceSelect,
        where: {
            AND: [
                {
                    deletedAt: null,
                    id: observationId,
                },
                ...(visibilityCondition ? [visibilityCondition] : []),
            ],
        },
    });
    if (!observation) {
        throw new AppError("Observation not found.", 404);
    }
    return observation;
};
const resolveLinkedTargets = (observation, input) => {
    let remediationPlanId = input.remediationPlanId;
    const commitmentId = input.commitmentId;
    if (remediationPlanId) {
        const plan = observation.remediationPlans.find((item) => item.id === remediationPlanId);
        if (!plan) {
            throw new AppError("El plan de remediacion no pertenece a esta observacion.", 400);
        }
    }
    if (commitmentId) {
        const commitment = observation.commitments.find((item) => item.id === commitmentId);
        if (!commitment) {
            throw new AppError("El compromiso no pertenece a esta observacion.", 400);
        }
        if (remediationPlanId && commitment.remediationPlanId !== remediationPlanId) {
            throw new AppError("El compromiso no pertenece al plan de remediacion indicado.", 400);
        }
        remediationPlanId = remediationPlanId ?? commitment.remediationPlanId;
    }
    return {
        commitmentId,
        remediationPlanId,
    };
};
const findProgressUpdateContextById = async (progressUpdateId, access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    const progressUpdate = await progressPrisma.progressUpdate.findFirst({
        select: progressUpdateContextSelect,
        where: {
            AND: [
                {
                    deletedAt: null,
                    id: progressUpdateId,
                },
                ...(visibilityCondition
                    ? [
                        {
                            observation: visibilityCondition,
                        },
                    ]
                    : []),
            ],
        },
    });
    if (!progressUpdate) {
        throw new AppError("Progress update not found.", 404);
    }
    return progressUpdate;
};
const findEvidenceContextById = async (evidenceId, access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    const evidence = await progressPrisma.evidenceFile.findFirst({
        select: evidenceContextSelect,
        where: {
            AND: [
                {
                    deletedAt: null,
                    id: evidenceId,
                },
                ...(visibilityCondition
                    ? [
                        {
                            observation: visibilityCondition,
                        },
                    ]
                    : []),
            ],
        },
    });
    if (!evidence) {
        throw new AppError("Evidence file not found.", 404);
    }
    return evidence;
};
const findCommentContextById = async (commentId, access) => {
    const visibilityCondition = buildObservationVisibilityCondition(access);
    const comment = await progressPrisma.observationComment.findFirst({
        select: commentContextSelect,
        where: {
            AND: [
                {
                    deletedAt: null,
                    id: commentId,
                },
                ...(visibilityCondition
                    ? [
                        {
                            observation: visibilityCondition,
                        },
                    ]
                    : []),
            ],
        },
    });
    if (!comment) {
        throw new AppError("Comment not found.", 404);
    }
    return comment;
};
const recalculateObservationProgress = async (observationId, db = progressPrisma) => {
    const commitments = await db.commitment.findMany({
        select: {
            progressPercent: true,
        },
        where: {
            deletedAt: null,
            observationId,
            remediationPlan: {
                deletedAt: null,
            },
        },
    });
    if (commitments.length > 0) {
        const progressPercent = Math.round(commitments.reduce((total, commitment) => total + commitment.progressPercent, 0) /
            commitments.length);
        await db.observation.update({
            data: {
                progressPercent,
            },
            where: {
                id: observationId,
            },
        });
        return progressPercent;
    }
    {
        const latestApproved = await db.progressUpdate.findFirst({
            orderBy: {
                reviewedAt: "desc",
            },
            select: {
                progressPercent: true,
            },
            where: {
                deletedAt: null,
                observationId,
                progressPercent: {
                    not: null,
                },
                status: "APPROVED",
            },
        });
        const progressPercent = latestApproved?.progressPercent ?? 0;
        await db.observation.update({
            data: {
                progressPercent,
            },
            where: {
                id: observationId,
            },
        });
        return progressPercent;
    }
};
const maybeUpdateObservationStatusAfterApproval = async (observationId, input, db = progressPrisma) => {
    const observation = await db.observation.findFirst({
        select: {
            status: {
                select: {
                    id: true,
                    key: true,
                },
            },
        },
        where: {
            deletedAt: null,
            id: observationId,
        },
    });
    if (!observation) {
        return;
    }
    if (input.progressPercent === null) {
        return;
    }
    if (terminalObservationStatuses.has(observation.status.key)) {
        return;
    }
    const statuses = await db.observationStatus.findMany({
        select: {
            id: true,
            key: true,
        },
        where: {
            active: true,
            deletedAt: null,
            key: {
                in: ["CERRADA", "EN_REVISION", "EN_PROCESO"],
            },
        },
    });
    const statusByKey = new Map(statuses.map((status) => [status.key, status]));
    if (input.type === "FINALIZATION" && input.progressPercent >= 100) {
        const closedStatus = statusByKey.get("CERRADA") ?? statusByKey.get("EN_REVISION");
        if (closedStatus && closedStatus.id !== observation.status.id) {
            await db.observation.update({
                data: {
                    statusId: closedStatus.id,
                },
                where: {
                    id: observationId,
                },
            });
        }
        return;
    }
    if (input.progressPercent > 0) {
        const inProgressStatus = statusByKey.get("EN_PROCESO");
        if (inProgressStatus && inProgressStatus.id !== observation.status.id) {
            await db.observation.update({
                data: {
                    statusId: inProgressStatus.id,
                },
                where: {
                    id: observationId,
                },
            });
        }
    }
};
const createSystemComment = async (input, db, userId) => {
    await db.observationComment.create({
        data: {
            authorUserId: userId,
            body: input.body,
            commitmentId: input.commitmentId,
            observationId: input.observationId,
            progressUpdateId: input.progressUpdateId,
            remediationPlanId: input.remediationPlanId,
            visibility: "SYSTEM",
        },
    });
};
const buildStakeholderNotificationUserIds = (observation, submitterUserId) => {
    return Array.from(new Set([
        submitterUserId,
        observation.responsibleUser?.id ?? null,
        observation.area.managerUser?.id ?? null,
        ...observation.areaAssignments.flatMap((assignment) => [
            assignment.responsibleUser?.id ?? null,
            assignment.area.managerUser?.id ?? null,
        ]),
    ].filter((value) => Boolean(value))));
};
const ensureReviewCommentForAction = (action, input) => {
    const comment = input.comment?.trim() ?? "";
    if (comment.length < 3) {
        throw new AppError(action === "return"
            ? "Debe registrar un comentario para devolver el avance."
            : "Debe registrar un comentario para rechazar el avance.", 400);
    }
    return comment;
};
export const progressService = {
    async createObservationComment(observationId, input, access) {
        const observation = await findObservationContextById(observationId, access);
        if (!canInteractWithObservation(observation, access)) {
            throw new AppError("No puede registrar comentarios para esta observacion.", 403);
        }
        let progressUpdateContext = null;
        if (input.progressUpdateId) {
            progressUpdateContext = await findProgressUpdateContextById(input.progressUpdateId, access);
            if (progressUpdateContext.observation.id !== observationId) {
                throw new AppError("El comentario no corresponde a esta observacion.", 400);
            }
        }
        const requestedVisibility = input.visibility ?? "AREA_VISIBLE";
        if (requestedVisibility === "SYSTEM" && !isSystemWideAccess(access)) {
            throw new AppError("Solo el sistema puede registrar comentarios de sistema.", 403);
        }
        if (requestedVisibility === "INTERNAL_AUDIT" &&
            !canReviewObservation(observation, access) &&
            !isSystemWideAccess(access)) {
            throw new AppError("Solo Auditoria puede registrar comentarios internos.", 403);
        }
        const comment = await progressPrisma.observationComment.create({
            data: {
                authorUserId: access.userId,
                body: input.body.trim(),
                commitmentId: progressUpdateContext?.commitmentId ?? null,
                observationId,
                progressUpdateId: progressUpdateContext?.id ?? null,
                remediationPlanId: progressUpdateContext?.remediationPlanId ?? null,
                visibility: requestedVisibility,
            },
            select: commentSelect,
        });
        return mapCommentItem(comment, access);
    },
    async createProgressUpdate(observationId, input, access) {
        const observation = await findObservationContextById(observationId, access);
        const linkedTargets = resolveLinkedTargets(observation, {
            commitmentId: input.commitmentId,
            remediationPlanId: input.remediationPlanId,
        });
        if (!canContributeToObservation(observation, access, linkedTargets.commitmentId)) {
            throw new AppError("No puede registrar avances para esta observacion.", 403);
        }
        const progressUpdate = await progressPrisma.progressUpdate.create({
            data: {
                comment: input.comment.trim(),
                commitmentId: linkedTargets.commitmentId,
                observationId,
                progressPercent: input.progressPercent,
                remediationPlanId: linkedTargets.remediationPlanId,
                submittedByUserId: access.userId,
                type: input.type,
            },
            select: progressUpdateTimelineSelect,
        });
        return mapProgressUpdateItem(progressUpdate, observation, access);
    },
    async createProgressUpdateEvidence(progressUpdateId, files, input, access) {
        if (files.length === 0) {
            throw new AppError("Debe adjuntar al menos un archivo de evidencia.", 400);
        }
        const progressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        if (!canEditProgressUpdate(progressUpdate, progressUpdate.observation, access)) {
            throw new AppError("No puede cargar evidencia en este avance.", 403);
        }
        const preparedFiles = await prepareEvidenceFiles(files);
        try {
            const createdEvidence = await progressPrisma.$transaction(async (transaction) => {
                return Promise.all(preparedFiles.map(async (file) => {
                    return transaction.evidenceFile.create({
                        data: {
                            checksum: file.checksum,
                            commitmentId: progressUpdate.commitmentId,
                            description: input.description,
                            mimeType: file.mimeType,
                            observationId: progressUpdate.observation.id,
                            originalName: file.originalName,
                            progressUpdateId: progressUpdate.id,
                            relativePath: file.relativePath,
                            remediationPlanId: progressUpdate.remediationPlanId,
                            sizeBytes: file.sizeBytes,
                            storedName: file.storedName,
                            uploadedByUserId: access.userId,
                        },
                        select: evidenceSelect,
                    });
                }));
            });
            return createdEvidence.map((evidence) => mapEvidenceItem(evidence, true));
        }
        catch (error) {
            await cleanupPreparedEvidenceFiles(preparedFiles);
            throw error;
        }
    },
    async deleteComment(commentId, access) {
        const comment = await findCommentContextById(commentId, access);
        const canDelete = isSystemWideAccess(access)
            ? comment.visibility !== "SYSTEM"
            : comment.authorUserId === access.userId && comment.visibility !== "SYSTEM";
        if (!canDelete) {
            throw new AppError("No puede eliminar este comentario.", 403);
        }
        await progressPrisma.observationComment.update({
            data: {
                deletedAt: new Date(),
            },
            where: {
                id: commentId,
            },
        });
        return mapCommentItem(comment, access);
    },
    async deleteEvidence(evidenceId, access) {
        const evidence = await findEvidenceContextById(evidenceId, access);
        const canDelete = isSystemWideAccess(access)
            ? true
            : evidence.progressUpdate
                ? canEditProgressUpdate({
                    commitmentId: evidence.progressUpdate.commitmentId,
                    status: evidence.progressUpdate.status,
                    submittedByUserId: evidence.progressUpdate.submittedByUserId,
                }, evidence.observation, access)
                : evidence.uploadedByUserId === access.userId &&
                    canContributeToObservation(evidence.observation, access, evidence.commitmentId);
        if (!canDelete) {
            throw new AppError("No puede eliminar esta evidencia.", 403);
        }
        await progressPrisma.evidenceFile.update({
            data: {
                deletedAt: new Date(),
            },
            where: {
                id: evidenceId,
            },
        });
        try {
            await unlink(buildEvidenceAbsolutePath(evidence.relativePath));
        }
        catch {
            // Ignore missing files after logical deletion.
        }
        return mapEvidenceItem(evidence, canDelete);
    },
    async downloadEvidence(evidenceId, access) {
        const evidence = await findEvidenceContextById(evidenceId, access);
        const absolutePath = buildEvidenceAbsolutePath(evidence.relativePath);
        try {
            await fsAccess(absolutePath);
        }
        catch {
            throw new AppError("El archivo de evidencia no existe en el servidor.", 404);
        }
        return {
            absolutePath,
            fileName: evidence.originalName,
            mimeType: evidence.mimeType,
        };
    },
    async getObservationProgressWorkspace(observationId, access) {
        const observation = await findObservationContextById(observationId, access);
        const progressUpdates = await progressPrisma.progressUpdate.findMany({
            orderBy: {
                createdAt: "desc",
            },
            select: progressUpdateTimelineSelect,
            where: {
                deletedAt: null,
                observationId,
            },
        });
        const canCreateProgress = canContributeToObservation(observation, access);
        const canReview = canReviewObservation(observation, access);
        return {
            canComment: canInteractWithObservation(observation, access),
            canCreateProgress,
            canReview,
            canUploadEvidence: canCreateProgress,
            commitments: observation.commitments
                .filter((commitment) => {
                if (canReview || canManageObservationProgress(observation, access)) {
                    return true;
                }
                return commitment.responsibleUserId === access.userId;
            })
                .map((commitment) => ({
                id: commitment.id,
                progressPercent: commitment.progressPercent,
                remediationPlanId: commitment.remediationPlanId,
                responsibleUser: mapUserSummary(commitment.responsibleUser),
                status: commitment.status,
                title: commitment.title,
            })),
            plans: observation.remediationPlans
                .filter((plan) => {
                if (canReview || canManageObservationProgress(observation, access)) {
                    return true;
                }
                return plan.ownerUser?.id === access.userId;
            })
                .map((plan) => ({
                area: plan.area,
                id: plan.id,
                ownerUser: mapUserSummary(plan.ownerUser),
                responsibleUser: mapUserSummary(plan.ownerUser) ??
                    mapUserSummary(observation.responsibleUser),
                status: plan.status,
            })),
            progressUpdates: progressUpdates.map((progressUpdate) => mapProgressUpdateItem(progressUpdate, observation, access)),
        };
    },
    async getObservationComments(observationId, access) {
        const observation = await findObservationContextById(observationId, access);
        if (!canInteractWithObservation(observation, access)) {
            throw new AppError("No puede consultar comentarios para esta observacion.", 403);
        }
        const visibleCommentStatuses = Array.from(getCommentVisibilityValues(access));
        const comments = await progressPrisma.observationComment.findMany({
            orderBy: {
                createdAt: "asc",
            },
            select: commentSelect,
            where: {
                deletedAt: null,
                observationId,
                visibility: {
                    in: visibleCommentStatuses,
                },
            },
        });
        return comments.map((comment) => mapCommentItem(comment, access));
    },
    async getObservationEvidence(observationId, access) {
        const observation = await findObservationContextById(observationId, access);
        if (!canInteractWithObservation(observation, access)) {
            throw new AppError("No puede consultar evidencias para esta observacion.", 403);
        }
        const evidences = await progressPrisma.evidenceFile.findMany({
            orderBy: {
                createdAt: "desc",
            },
            select: evidenceSelect,
            where: {
                deletedAt: null,
                observationId,
            },
        });
        return evidences.map((evidence) => mapEvidenceItem(evidence, isSystemWideAccess(access) ||
            (evidence.uploadedByUserId === access.userId &&
                canContributeToObservation(observation, access, evidence.commitmentId))));
    },
    async listProgressUpdates(query, access) {
        const where = buildProgressListWhere(query, access);
        const [total, progressUpdates] = await progressPrisma.$transaction([
            progressPrisma.progressUpdate.count({
                where,
            }),
            progressPrisma.progressUpdate.findMany({
                orderBy: buildProgressListOrderBy(query.sortBy, query.sortDirection),
                select: progressListSelect,
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: progressUpdates.map((progressUpdate) => {
                const responsibleUser = buildProgressListResponsibleUser(progressUpdate);
                const canEdit = EDITABLE_PROGRESS_STATUSES.has(progressUpdate.status) &&
                    (progressUpdate.submittedByUserId === access.userId ||
                        isSystemWideAccess(access));
                return {
                    area: buildProgressListArea(progressUpdate),
                    canEdit,
                    canReview: isSystemWideAccess(access) ||
                        hasAuditReviewRole(access) ||
                        progressUpdate.observation.responsibleUserId === access.userId,
                    canSendToAudit: canEdit,
                    createdAt: progressUpdate.createdAt.toISOString(),
                    evidenceCount: progressUpdate.evidenceFiles.length,
                    evidencePending: progressUpdate.evidenceFiles.length === 0,
                    id: progressUpdate.id,
                    observation: {
                        code: progressUpdate.observation.code,
                        id: progressUpdate.observation.id,
                        title: progressUpdate.observation.title,
                    },
                    progressPercent: progressUpdate.progressPercent,
                    responsibleUser,
                    riskLevel: progressUpdate.observation.riskLevel,
                    sentToAuditAt: extractSentToAuditAt(progressUpdate),
                    status: progressUpdate.status,
                    type: progressUpdate.type,
                };
            }),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async reviewProgressUpdate(progressUpdateId, action, input, access) {
        const progressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        const observation = progressUpdate.observation;
        if (!canReviewObservation(observation, access) && !isSystemWideAccess(access)) {
            throw new AppError("No puede revisar este avance.", 403);
        }
        if (progressUpdate.status !== "SENT_TO_AUDIT") {
            throw new AppError("Solo se pueden revisar avances enviados a Auditoria.", 409);
        }
        const reviewComment = action === "approve"
            ? input.comment?.trim() || null
            : ensureReviewCommentForAction(action, input);
        const nextStatus = action === "approve"
            ? "APPROVED"
            : action === "return"
                ? "RETURNED"
                : "REJECTED";
        const historyAction = action === "approve"
            ? "APPROVED"
            : action === "return"
                ? "RETURNED"
                : "REJECTED";
        await progressPrisma.$transaction(async (transaction) => {
            await transaction.progressUpdate.update({
                data: {
                    reviewComment,
                    reviewedAt: new Date(),
                    reviewedByUserId: access.userId,
                    status: nextStatus,
                },
                where: {
                    id: progressUpdateId,
                },
            });
            await transaction.progressReviewHistory.create({
                data: {
                    action: historyAction,
                    comment: reviewComment,
                    fromStatus: progressUpdate.status,
                    progressUpdateId,
                    toStatus: nextStatus,
                    userId: access.userId,
                },
            });
            if (action === "approve" && progressUpdate.commitmentId && progressUpdate.progressPercent !== null) {
                const commitment = await transaction.commitment.findFirst({
                    select: {
                        status: true,
                    },
                    where: {
                        deletedAt: null,
                        id: progressUpdate.commitmentId,
                    },
                });
                if (commitment) {
                    const commitmentState = resolveCommitmentStatus(commitment.status, progressUpdate.progressPercent);
                    await transaction.commitment.update({
                        data: {
                            completedAt: commitmentState.completedAt,
                            progressPercent: progressUpdate.progressPercent,
                            status: commitmentState.status,
                        },
                        where: {
                            id: progressUpdate.commitmentId,
                        },
                    });
                }
            }
            if (action === "approve") {
                await recalculateObservationProgress(observation.id, transaction);
                await maybeUpdateObservationStatusAfterApproval(observation.id, {
                    progressPercent: progressUpdate.progressPercent,
                    type: progressUpdate.type,
                }, transaction);
            }
            await createSystemComment({
                body: action === "approve"
                    ? `Auditoria aprobo el ${progressUpdate.type === "FINALIZATION" ? "cierre" : "avance"} registrado.`
                    : action === "return"
                        ? `Auditoria devolvio el avance para correccion. ${reviewComment}`
                        : `Auditoria rechazo el avance enviado. ${reviewComment}`,
                commitmentId: progressUpdate.commitmentId,
                observationId: observation.id,
                progressUpdateId,
                remediationPlanId: progressUpdate.remediationPlanId,
            }, transaction, access.userId);
        });
        const stakeholders = buildStakeholderNotificationUserIds(observation, progressUpdate.submittedByUserId);
        const notificationTitle = action === "approve"
            ? "Avance aprobado"
            : action === "return"
                ? "Avance devuelto"
                : "Avance rechazado";
        const notificationMessage = action === "approve"
            ? `Auditoria aprobo el avance de la observacion ${observation.code}.`
            : action === "return"
                ? `Auditoria devolvio el avance de la observacion ${observation.code} con observaciones.`
                : `Auditoria rechazo el avance de la observacion ${observation.code}.`;
        await notificationService.createMany({
            message: notificationMessage,
            title: notificationTitle,
            type: action === "approve" ? "success" : "warning",
            userIds: stakeholders.filter((userId) => userId !== access.userId),
        });
        const updatedProgressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        return mapProgressUpdateItem(updatedProgressUpdate, updatedProgressUpdate.observation, access);
    },
    async sendProgressUpdateToAudit(progressUpdateId, access) {
        const progressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        const observation = progressUpdate.observation;
        if (!canEditProgressUpdate(progressUpdate, observation, access)) {
            throw new AppError("No puede enviar este avance a Auditoria.", 403);
        }
        if (!EDITABLE_PROGRESS_STATUSES.has(progressUpdate.status)) {
            throw new AppError("Solo puede enviar avances en borrador o devueltos.", 409);
        }
        if (progressUpdate.type === "FINALIZATION") {
            if (progressUpdate.progressPercent !== 100) {
                throw new AppError("La finalizacion debe registrar 100% de avance antes del envio.", 400);
            }
            if (progressUpdate.evidenceFiles.length === 0) {
                throw new AppError("La finalizacion requiere al menos una evidencia adjunta.", 400);
            }
        }
        await progressPrisma.$transaction(async (transaction) => {
            await transaction.progressUpdate.update({
                data: {
                    status: "SENT_TO_AUDIT",
                },
                where: {
                    id: progressUpdateId,
                },
            });
            await transaction.progressReviewHistory.create({
                data: {
                    action: "SENT",
                    fromStatus: progressUpdate.status,
                    progressUpdateId,
                    toStatus: "SENT_TO_AUDIT",
                    userId: access.userId,
                },
            });
            await createSystemComment({
                body: `Se envio un ${progressUpdate.type === "FINALIZATION" ? "cierre" : "avance"} a Auditoria para revision.`,
                commitmentId: progressUpdate.commitmentId,
                observationId: observation.id,
                progressUpdateId,
                remediationPlanId: progressUpdate.remediationPlanId,
            }, transaction, access.userId);
        });
        if (observation.auditorUser.id !== access.userId) {
            await notificationService.create({
                message: `La observacion ${observation.code} recibio un nuevo avance para revision de Auditoria.`,
                title: "Avance enviado a Auditoria",
                type: "info",
                userId: observation.auditorUser.id,
            });
        }
        const updatedProgressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        return mapProgressUpdateItem(updatedProgressUpdate, updatedProgressUpdate.observation, access);
    },
    async updateObservationComment(commentId, input, access) {
        const comment = await findCommentContextById(commentId, access);
        const canEdit = isSystemWideAccess(access)
            ? comment.visibility !== "SYSTEM"
            : comment.authorUserId === access.userId && comment.visibility !== "SYSTEM";
        if (!canEdit) {
            throw new AppError("No puede editar este comentario.", 403);
        }
        if (input.visibility === "SYSTEM" && !isSystemWideAccess(access)) {
            throw new AppError("Solo el sistema puede registrar comentarios de sistema.", 403);
        }
        if (input.visibility === "INTERNAL_AUDIT" &&
            !canReviewObservation(comment.observation, access) &&
            !isSystemWideAccess(access)) {
            throw new AppError("Solo Auditoria puede registrar comentarios internos.", 403);
        }
        const updatedComment = await progressPrisma.observationComment.update({
            data: {
                ...(input.body !== undefined
                    ? {
                        body: input.body.trim(),
                    }
                    : {}),
                ...(input.visibility !== undefined
                    ? {
                        visibility: input.visibility,
                    }
                    : {}),
            },
            select: commentSelect,
            where: {
                id: commentId,
            },
        });
        return mapCommentItem(updatedComment, access);
    },
    async updateProgressUpdate(progressUpdateId, input, access) {
        const progressUpdate = await findProgressUpdateContextById(progressUpdateId, access);
        const observation = progressUpdate.observation;
        if (!canEditProgressUpdate(progressUpdate, observation, access)) {
            throw new AppError("No puede editar este avance.", 403);
        }
        const linkedTargets = resolveLinkedTargets(observation, {
            commitmentId: input.commitmentId !== undefined ? input.commitmentId : progressUpdate.commitmentId,
            remediationPlanId: input.remediationPlanId !== undefined
                ? input.remediationPlanId
                : progressUpdate.remediationPlanId,
        });
        if (!canContributeToObservation(observation, access, linkedTargets.commitmentId)) {
            throw new AppError("No puede reasignar este avance a ese contexto.", 403);
        }
        const nextType = input.type ?? progressUpdate.type;
        const nextProgressPercent = input.progressPercent !== undefined
            ? input.progressPercent
            : progressUpdate.progressPercent;
        if (nextType === "FINALIZATION" && nextProgressPercent !== null && nextProgressPercent < 100) {
            throw new AppError("La finalizacion debe registrar 100% de avance.", 400);
        }
        const updatedProgressUpdate = await progressPrisma.progressUpdate.update({
            data: {
                ...(input.comment !== undefined
                    ? {
                        comment: input.comment.trim(),
                    }
                    : {}),
                commitmentId: linkedTargets.commitmentId,
                progressPercent: nextProgressPercent,
                remediationPlanId: linkedTargets.remediationPlanId,
                ...(input.type !== undefined
                    ? {
                        type: input.type,
                    }
                    : {}),
            },
            select: progressUpdateTimelineSelect,
            where: {
                id: progressUpdateId,
            },
        });
        return mapProgressUpdateItem(updatedProgressUpdate, observation, access);
    },
    async uploadObservationEvidence(observationId, files, input, access) {
        if (files.length === 0) {
            throw new AppError("Debe adjuntar al menos un archivo de evidencia.", 400);
        }
        const observation = await findObservationContextById(observationId, access);
        if (!canContributeToObservation(observation, access)) {
            throw new AppError("No puede cargar evidencias para esta observacion.", 403);
        }
        const preparedFiles = await prepareEvidenceFiles(files);
        try {
            const createdEvidence = await progressPrisma.$transaction(async (transaction) => {
                return Promise.all(preparedFiles.map(async (file) => {
                    return transaction.evidenceFile.create({
                        data: {
                            checksum: file.checksum,
                            description: input.description,
                            mimeType: file.mimeType,
                            observationId,
                            originalName: file.originalName,
                            relativePath: file.relativePath,
                            sizeBytes: file.sizeBytes,
                            storedName: file.storedName,
                            uploadedByUserId: access.userId,
                        },
                        select: evidenceSelect,
                    });
                }));
            });
            return createdEvidence.map((evidence) => mapEvidenceItem(evidence, true));
        }
        catch (error) {
            await cleanupPreparedEvidenceFiles(preparedFiles);
            throw error;
        }
    },
};
//# sourceMappingURL=progress.service.js.map