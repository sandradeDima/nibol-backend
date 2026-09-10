import { createHash, randomUUID } from "node:crypto";
import { access as fsAccess, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "../../../generated/prisma/client.js";
import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
} from "../../../generated/prisma/client.js";

import {
  authorizationService,
  buildEvidenceScopeWhere,
  buildObservationScopeWhere,
  buildProgressEvaluationScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { emailService } from "../../emails/EmailService.js";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../utils/prisma.js";
import { uploadsRootDir } from "../../utils/uploads.js";
import { recalculateObservationFromActionPlans } from "../remediation/remediation.service.js";
import { workflowIntegrationService } from "../workflows/workflow-integration.service.js";
import type {
  CreateCommentInput,
  CreateProgressEvaluationInput,
  ListProgressEvaluationsQuery,
  ReviewProgressEvaluationInput,
  UpdateCommentInput,
  UpdateProgressEvaluationInput,
  UploadEvidenceInput,
} from "./progress.validators.js";
import { officialProgressByStatus } from "./progress.constants.js";

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  size: number;
};
type PreparedFile = {
  absolutePath: string;
  checksum: string;
  mimeType: string;
  originalName: string;
  relativePath: string;
  sizeBytes: bigint;
  storedName: string;
};

const allowedTypes: Record<string, Set<string>> = {
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
const userSelect = {
  email: true,
  id: true,
  jobTitle: true,
  name: true,
} as const;
const evaluationInclude = {
  actionPlan: {
    select: {
      id: true,
      observationAreaId: true,
      observation: {
        select: {
          auditReport: { select: { reportNumber: true } },
          auditorUserId: true,
          id: true,
          observationNumber: true,
          title: true,
        },
      },
      observationArea: {
        select: { area: { select: { id: true, name: true } }, id: true },
      },
      progressPercent: true,
      responsibleUser: { select: userSelect },
      status: true,
    },
  },
  evidenceFiles: {
    orderBy: { createdAt: "desc" },
    select: {
      context: true,
      createdAt: true,
      description: true,
      id: true,
      mimeType: true,
      observationArea: {
        select: { area: { select: { id: true, name: true } }, id: true },
      },
      originalName: true,
      sizeBytes: true,
    },
    where: { deletedAt: null },
  },
  reviewHistory: {
    include: { user: { select: userSelect } },
    orderBy: { createdAt: "asc" },
  },
  reviewedByUser: { select: userSelect },
  submittedByUser: { select: userSelect },
} satisfies Prisma.ProgressEvaluationInclude;

type EvaluationRecord = Prisma.ProgressEvaluationGetPayload<{
  include: typeof evaluationInclude;
}>;

const evaluationAccessWhere = (
  access: AuthorizationSummary,
): Prisma.ProgressEvaluationWhereInput =>
  buildProgressEvaluationScopeWhere(access);

export const canReviewEvidenceAsAuditor = (
  access: AuthorizationSummary,
): boolean =>
  access.roleCode === "AUDITOR" &&
  access.permissions.includes("evidence.review");

type EvidenceNotificationRecipient = {
  email: string;
  id: string;
  name: string;
};

type EvidenceNotificationDelivery = {
  deliveryId: string;
  message: string;
  recipient: EvidenceNotificationRecipient;
  targetUrl: string;
  title: string;
};

const deliverEvidenceNotificationEmails = async (
  deliveries: EvidenceNotificationDelivery[],
) => {
  await Promise.all(
    deliveries.map(
      async ({ deliveryId, message, recipient, targetUrl, title }) => {
        if (!(await notificationService.claimEmailDelivery(deliveryId))) return;
        const result = await emailService.sendTemplate({
          template: "genericNotification",
          to: recipient.email,
          variables: {
            actionLabel: "Revisar evidencia",
            actionLink: `${env.FRONTEND_URL}${targetUrl}`,
            message,
            title,
            userName: recipient.name,
          },
        });
        await notificationService.completeEmailDelivery(deliveryId, result);
      },
    ),
  );
};

const queueEvidenceNotifications = async (input: {
  entityId: string;
  eventType: string;
  message: string;
  operationKey: string;
  recipients: EvidenceNotificationRecipient[];
  targetUrl: string;
  title: string;
}): Promise<void> => {
  const emailDeliveries: EvidenceNotificationDelivery[] = [];
  await prisma.$transaction(async (tx) => {
    for (const recipient of input.recipients) {
      const notification = await notificationService.create(
        {
          dedupeKey: `${input.operationKey}:${recipient.id}:notification`,
          entityId: input.entityId,
          entityType: "EVIDENCE_FILE",
          eventType: input.eventType,
          message: input.message,
          targetUrl: input.targetUrl,
          title: input.title,
          type: input.eventType === "EVIDENCE_APPROVED" ? "success" : "warning",
          userId: recipient.id,
        },
        { db: tx },
      );
      await notificationService.createDelivery(
        {
          channel: NotificationDeliveryChannel.IN_APP,
          dedupeKey: `${input.operationKey}:${recipient.id}:IN_APP`,
          notificationId: notification.id,
          recipientEmail: recipient.email,
          recipientUserId: recipient.id,
          status: NotificationDeliveryStatus.SENT,
        },
        { db: tx.notificationDelivery },
      );
      const delivery = await notificationService.createDelivery(
        {
          channel: NotificationDeliveryChannel.EMAIL,
          dedupeKey: `${input.operationKey}:${recipient.id}:EMAIL`,
          notificationId: notification.id,
          recipientEmail: recipient.email,
          recipientUserId: recipient.id,
        },
        { db: tx.notificationDelivery },
      );
      emailDeliveries.push({
        deliveryId: delivery.id,
        message: input.message,
        recipient,
        targetUrl: input.targetUrl,
        title: input.title,
      });
    }
  });
  void deliverEvidenceNotificationEmails(emailDeliveries).catch((error) => {
    logger.error("Evidence notification email delivery failed.", {
      entityId: input.entityId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  });
};

const evidenceReviewSelect = {
  createdAt: true,
  id: true,
  observation: {
    select: {
      auditReport: { select: { reportNumber: true } },
      areaAssignments: {
        select: { area: { select: { name: true } } },
      },
      id: true,
      observationNumber: true,
      title: true,
    },
  },
  originalName: true,
  reviewStatus: true,
  submittedAt: true,
  uploadedByUser: { select: userSelect },
  uploadedByUserId: true,
  workflowInstanceId: true,
} as const;

type EvidenceReviewRecord = Prisma.EvidenceFileGetPayload<{
  select: typeof evidenceReviewSelect;
}>;

const evidenceReviewTargetUrl = (observationId: string, evidenceId: string) =>
  `/observaciones/${observationId}?tab=evidence&evidenceId=${encodeURIComponent(evidenceId)}`;

const evidenceObservationLabel = (evidence: EvidenceReviewRecord) =>
  `${evidence.observation.auditReport.reportNumber} / OBS-${String(evidence.observation.observationNumber).padStart(3, "0")}`;

const evidenceReviewNotification = (evidence: EvidenceReviewRecord) => {
  const areaNames = Array.from(
    new Set(
      evidence.observation.areaAssignments.map((assignment) =>
        assignment.area.name.trim(),
      ),
    ),
  ).sort();
  const observationLabel = evidenceObservationLabel(evidence);

  return {
    message: [
      `Se ha registrado nueva evidencia para revisión correspondiente a ${observationLabel}.`,
      `Título: ${evidence.observation.title}`,
      `Áreas involucradas: ${areaNames.join(", ") || "No especificadas"}`,
      `Enviado por: ${evidence.uploadedByUser.name}`,
      `Fecha de carga: ${evidence.createdAt.toLocaleString("es-BO", { dateStyle: "medium", timeStyle: "short" })}`,
    ].join("\n"),
    title: `Evidencia pendiente de revisión – ${observationLabel}`,
  };
};

const getActiveAuditors = () =>
  prisma.user.findMany({
    select: userSelect,
    where: {
      deletedAt: null,
      isActive: true,
      userRoles: {
        some: {
          role: { code: "AUDITOR", deletedAt: null },
        },
      },
    },
  });

const getEvidenceReviewRecord = async (
  id: string,
  access: AuthorizationSummary,
): Promise<EvidenceReviewRecord> => {
  const evidence = await prisma.evidenceFile.findFirst({
    select: evidenceReviewSelect,
    where: {
      deletedAt: null,
      id,
      ...buildEvidenceScopeWhere(access),
    },
  });
  if (!evidence) throw new AppError("Evidence not found.", 404);
  return evidence;
};

const formatEvaluation = (record: EvaluationRecord) => ({
  actionPlan: {
    area: record.actionPlan.observationArea.area,
    id: record.actionPlan.id,
    responsibleUser: record.actionPlan.responsibleUser,
  },
  evaluatedStatus: record.evaluatedStatus,
  comment: record.comment,
  evidence: record.evidenceFiles.map((file) => ({
    ...file,
    createdAt: file.createdAt.toISOString(),
    downloadPath: `/evidences/${file.id}/download`,
    observationArea: file.observationArea
      ? { id: file.observationArea.id, name: file.observationArea.area.name }
      : null,
    sizeBytes: Number(file.sizeBytes),
  })),
  history: record.reviewHistory.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  })),
  id: record.id,
  observation: {
    displayCode: `${record.actionPlan.observation.auditReport.reportNumber} / OBS-${String(record.actionPlan.observation.observationNumber).padStart(3, "0")}`,
    id: record.actionPlan.observation.id,
    title: record.actionPlan.observation.title,
  },
  officialProgressPercent: record.actionPlan.progressPercent,
  officialStatus: record.actionPlan.status,
  reportedProgressPercent: record.reportedProgressPercent,
  reviewedAt: record.reviewedAt?.toISOString() ?? null,
  reviewedByUser: record.reviewedByUser,
  reviewComment: record.reviewComment,
  reviewStatus: record.reviewStatus,
  submittedAt: record.submittedAt.toISOString(),
  submittedByUser: record.submittedByUser,
  type: record.type,
  updatedAt: record.updatedAt.toISOString(),
  workflowInstanceId: record.workflowInstanceId,
});

const findEvaluation = async (
  id: string,
  access: AuthorizationSummary,
): Promise<EvaluationRecord> => {
  const record = await prisma.progressEvaluation.findFirst({
    include: evaluationInclude,
    where: { deletedAt: null, id, ...evaluationAccessWhere(access) },
  });
  if (!record)
    throw new AppError("No se encontró la evaluación de avance.", 404);
  return record;
};

const canEdit = (
  record: EvaluationRecord,
  access: AuthorizationSummary,
): boolean =>
  authorizationService.can(access, "action_plans.submit_to_audit") &&
  record.submittedByUserId === access.userId &&
  ["DRAFT", "RETURNED"].includes(record.reviewStatus);

const maxFileSize = async () => {
  const parameter = await prisma.systemParameter.findFirst({
    select: { value: true },
    where: { active: true, deletedAt: null, key: "evidence_max_file_size_mb" },
  });
  const megabytes = Number(parameter?.value ?? 10);
  return (
    (Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 10) * 1024 * 1024
  );
};

const prepareFiles = async (files: UploadFile[]) => {
  const limit = await maxFileSize();
  const prepared: PreparedFile[] = [];
  try {
    for (const file of files) {
      const originalName = path
        .basename(file.originalName)
        .replace(/[^a-zA-Z0-9.\-_\s()]/g, "_")
        .trim();
      const extension = path.extname(originalName).toLowerCase();
      if (!allowedTypes[extension]?.has(file.mimetype))
        throw new AppError(
          "El tipo de archivo de evidencia no está permitido.",
          400,
        );
      if (file.size > limit)
        throw new AppError(
          "El archivo de evidencia supera el tamaño permitido.",
          400,
        );
      const now = new Date();
      const storedName = `evidence-${Date.now()}-${randomUUID()}${extension}`;
      const relativePath = path.posix.join(
        "evidences",
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, "0"),
        storedName,
      );
      const absolutePath = path.join(uploadsRootDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.buffer);
      prepared.push({
        absolutePath,
        checksum: createHash("sha256").update(file.buffer).digest("hex"),
        mimeType: file.mimetype,
        originalName: originalName || "evidencia",
        relativePath,
        sizeBytes: BigInt(file.size),
        storedName,
      });
    }
    return prepared;
  } catch (error) {
    await Promise.all(
      prepared.map((file) => unlink(file.absolutePath).catch(() => undefined)),
    );
    throw error;
  }
};

const refreshPlanFromLatestApproval = async (
  tx: Prisma.TransactionClient,
  actionPlanId: string,
  officialStatus: "NOT_STARTED" | "STARTED" | "WITH_PROGRESS" | "CONCLUDED",
) => {
  const actionPlan = await tx.actionPlan.update({
    data: {
      completedAt: officialStatus === "CONCLUDED" ? new Date() : null,
      progressPercent: officialProgressByStatus[officialStatus],
      status: officialStatus,
    },
    select: { observationId: true },
    where: { id: actionPlanId },
  });
  await recalculateObservationFromActionPlans(tx, actionPlan.observationId);
};

const requireActionPlan = async (id: string, access: AuthorizationSummary) => {
  const actionPlan = await prisma.actionPlan.findFirst({
    select: {
      id: true,
      observationAreaId: true,
      observation: { select: { auditorUserId: true, id: true } },
      responsibleUserId: true,
    },
    where: {
      deletedAt: null,
      id,
      observation: buildObservationScopeWhere(access),
    },
  });
  if (!actionPlan) throw new AppError("No se encontró el plan de acción.", 404);
  return actionPlan;
};

export const progressService = {
  async createProgressEvaluation(
    actionPlanId: string,
    input: CreateProgressEvaluationInput,
    access: AuthorizationSummary,
  ) {
    const actionPlan = await requireActionPlan(actionPlanId, access);
    const allowed =
      access.isAdmin ||
      actionPlan.responsibleUserId === access.userId ||
      authorizationService.can(access, "action_plans.submit_to_audit");
    if (!allowed)
      throw new AppError(
        "No tiene permisos para registrar avances en este plan de acción.",
        403,
      );
    const record = await prisma.progressEvaluation.create({
      data: { ...input, actionPlanId, submittedByUserId: access.userId },
      include: evaluationInclude,
    });
    return formatEvaluation(record);
  },

  async getProgressEvaluation(id: string, access: AuthorizationSummary) {
    return formatEvaluation(await findEvaluation(id, access));
  },

  async listProgressEvaluations(
    query: ListProgressEvaluationsQuery,
    access: AuthorizationSummary,
  ) {
    const where: Prisma.ProgressEvaluationWhereInput = {
      deletedAt: null,
      ...evaluationAccessWhere(access),
      ...(query.actionPlanId ? { actionPlanId: query.actionPlanId } : {}),
      ...(query.areaId
        ? { actionPlan: { observationArea: { areaId: query.areaId } } }
        : {}),
      ...(query.observationId
        ? { actionPlan: { observationId: query.observationId } }
        : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            submittedAt: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(query.search
        ? {
            OR: [
              { comment: { contains: query.search } },
              {
                actionPlan: {
                  observation: { title: { contains: query.search } },
                },
              },
              {
                actionPlan: {
                  observation: {
                    auditReport: { reportNumber: { contains: query.search } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      prisma.progressEvaluation.findMany({
        include: evaluationInclude,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
      prisma.progressEvaluation.count({ where }),
    ]);
    return {
      data: records.map(formatEvaluation),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  },

  async reviewProgressEvaluation(
    id: string,
    action: "approve" | "return",
    input: ReviewProgressEvaluationInput,
    access: AuthorizationSummary,
  ) {
    const previous = await findEvaluation(id, access);
    if (previous.reviewStatus !== "SENT_TO_AUDIT")
      throw new AppError(
        "Solo se pueden revisar evaluaciones enviadas a Auditoría.",
        409,
      );
    const requiredPermissions = [
      "action_plans.evaluate",
      ...(action === "approve"
        ? ["action_plans.approve"]
        : ["action_plans.return"]),
    ];
    if (
      !access.isAdmin &&
      requiredPermissions.some(
        (permission) => !access.permissions.includes(permission),
      )
    )
      throw new AppError(
        "No tiene permisos para revisar evaluaciones de avance.",
        403,
      );
    if (action !== "approve" && !input.comment)
      throw new AppError(
        "Debe ingresar un comentario para devolver la evaluación.",
        400,
      );
    const next = action === "approve" ? "APPROVED" : "RETURNED";
    await prisma.$transaction(async (tx) => {
      await tx.progressEvaluation.update({
        data: {
          reviewComment: input.comment,
          reviewedAt: new Date(),
          reviewedByUserId: access.userId,
          evaluatedStatus: input.officialStatus,
          reviewStatus: next,
        },
        where: { id },
      });
      await tx.progressReviewHistory.create({
        data: {
          action: action === "approve" ? "APPROVED" : "RETURNED",
          comment: input.comment,
          fromStatus: previous.reviewStatus,
          progressEvaluationId: id,
          toStatus: next,
          userId: access.userId,
        },
      });
      if (action === "approve")
        await refreshPlanFromLatestApproval(
          tx,
          previous.actionPlan.id,
          input.officialStatus,
        );
    });
    if (previous.submittedByUser.id !== access.userId) {
      await notificationService.create({
        message: `La evaluación de avance del plan de acción fue ${next === "APPROVED" ? "aprobada" : "devuelta"}.`,
        title: "Evaluación de avance revisada",
        type: next === "APPROVED" ? "success" : "warning",
        userId: previous.submittedByUser.id,
      });
    }
    return {
      current: formatEvaluation(await findEvaluation(id, access)),
      previous: formatEvaluation(previous),
    };
  },

  async sendProgressEvaluationToAudit(
    id: string,
    access: AuthorizationSummary,
  ) {
    const previous = await findEvaluation(id, access);
    if (!canEdit(previous, access))
      throw new AppError("No tiene permisos para enviar esta evaluación.", 403);
    if (previous.type === "FINALIZATION" && previous.evidenceFiles.length === 0)
      throw new AppError(
        "Una evaluación de finalización requiere al menos un archivo de evidencia.",
        400,
      );
    if (previous.type === "FINALIZATION") {
      await workflowIntegrationService.startForEntity({
        access: { ...access, ipAddress: null },
        actorUserId: access.userId,
        entityId: id,
        entityType: "progress_evaluation",
        processType: "OBSERVATION_CLOSURE",
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.progressEvaluation.update({
        data: { reviewStatus: "SENT_TO_AUDIT", submittedAt: new Date() },
        where: { id },
      });
      await tx.progressReviewHistory.create({
        data: {
          action: "SENT",
          fromStatus: previous.reviewStatus,
          progressEvaluationId: id,
          toStatus: "SENT_TO_AUDIT",
          userId: access.userId,
        },
      });
    });
    const auditorId = previous.actionPlan.observation.auditorUserId;
    if (auditorId && auditorId !== access.userId) {
      await notificationService.create({
        message:
          "Hay una evaluación de avance pendiente para un plan de acción.",
        title: "Avance pendiente de revisión",
        type: "info",
        userId: auditorId,
      });
    }
    return {
      current: formatEvaluation(await findEvaluation(id, access)),
      previous: formatEvaluation(previous),
    };
  },

  async updateProgressEvaluation(
    id: string,
    input: UpdateProgressEvaluationInput,
    access: AuthorizationSummary,
  ) {
    const previous = await findEvaluation(id, access);
    if (!canEdit(previous, access))
      throw new AppError("You cannot edit this evaluation.", 403);
    await prisma.progressEvaluation.update({
      data: {
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.reportedProgressPercent !== undefined
          ? { reportedProgressPercent: input.reportedProgressPercent }
          : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      },
      where: { id },
    });
    return {
      current: formatEvaluation(await findEvaluation(id, access)),
      previous: formatEvaluation(previous),
    };
  },

  async uploadEvidence(
    target: {
      actionPlanId?: string;
      observationId: string;
      observationAreaId?: string;
      progressEvaluationId?: string;
    },
    files: UploadFile[],
    input: UploadEvidenceInput,
    access: AuthorizationSummary,
  ) {
    if (files.length === 0)
      throw new AppError("At least one file is required.", 400);
    const expectedContext = target.progressEvaluationId
      ? "PROGRESS_EVALUATION"
      : target.actionPlanId
        ? "ACTION_PLAN"
        : input.context;
    if (
      input.context !== expectedContext &&
      !["FINDING", "CLOSURE"].includes(input.context)
    )
      throw new AppError("Evidence context does not match its target.", 400);
    const observation = await prisma.observation.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: target.observationId,
        ...buildObservationScopeWhere(access),
      },
    });
    if (!observation) throw new AppError("Observation not found.", 404);
    if (target.observationAreaId) {
      const observationArea = await prisma.observationArea.findFirst({
        select: { id: true },
        where: {
          id: target.observationAreaId,
          observationId: target.observationId,
        },
      });
      if (!observationArea)
        throw new AppError("El área no pertenece a la observación.", 400);
    }
    const prepared = await prepareFiles(files);
    try {
      const records = await prisma.$transaction((tx) =>
        Promise.all(
          prepared.map((file) =>
            tx.evidenceFile.create({
              data: {
                actionPlanId: target.actionPlanId ?? null,
                checksum: file.checksum,
                context: input.context,
                description: input.description,
                mimeType: file.mimeType,
                observationId: target.observationId,
                observationAreaId: target.observationAreaId ?? null,
                originalName: file.originalName,
                progressEvaluationId: target.progressEvaluationId ?? null,
                relativePath: file.relativePath,
                sizeBytes: file.sizeBytes,
                storedName: file.storedName,
                uploadedByUserId: access.userId,
              },
              select: {
                context: true,
                createdAt: true,
                description: true,
                id: true,
                mimeType: true,
                observationArea: {
                  select: {
                    area: { select: { id: true, name: true } },
                    id: true,
                  },
                },
                originalName: true,
                reviewComment: true,
                reviewedAt: true,
                reviewStatus: true,
                sizeBytes: true,
                submittedAt: true,
                workflowInstanceId: true,
              },
            }),
          ),
        ),
      );
      return records.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
        downloadPath: `/evidences/${record.id}/download`,
        observationArea: record.observationArea
          ? {
              id: record.observationArea.id,
              name: record.observationArea.area.name,
            }
          : null,
        reviewedAt: record.reviewedAt?.toISOString() ?? null,
        sizeBytes: Number(record.sizeBytes),
        submittedAt: record.submittedAt?.toISOString() ?? null,
      }));
    } catch (error) {
      await Promise.all(
        prepared.map((file) =>
          unlink(file.absolutePath).catch(() => undefined),
        ),
      );
      throw error;
    }
  },

  async uploadObservationEvidence(
    observationId: string,
    files: UploadFile[],
    input: UploadEvidenceInput,
    access: AuthorizationSummary,
  ) {
    if (!["FINDING", "CLOSURE"].includes(input.context))
      throw new AppError(
        "Observation evidence must be finding or closure evidence.",
        400,
      );
    return this.uploadEvidence(
      {
        ...(input.observationAreaId
          ? { observationAreaId: input.observationAreaId }
          : {}),
        observationId,
      },
      files,
      input,
      access,
    );
  },

  async uploadActionPlanEvidence(
    actionPlanId: string,
    files: UploadFile[],
    input: UploadEvidenceInput,
    access: AuthorizationSummary,
  ) {
    if (input.context !== "ACTION_PLAN")
      throw new AppError(
        "Action plan evidence must use ACTION_PLAN context.",
        400,
      );
    const actionPlan = await requireActionPlan(actionPlanId, access);
    return this.uploadEvidence(
      {
        actionPlanId,
        observationAreaId: actionPlan.observationAreaId,
        observationId: actionPlan.observation.id,
      },
      files,
      input,
      access,
    );
  },

  async uploadProgressEvaluationEvidence(
    progressEvaluationId: string,
    files: UploadFile[],
    input: UploadEvidenceInput,
    access: AuthorizationSummary,
  ) {
    if (input.context !== "PROGRESS_EVALUATION")
      throw new AppError(
        "Progress evaluation evidence must use PROGRESS_EVALUATION context.",
        400,
      );
    const evaluation = await findEvaluation(progressEvaluationId, access);
    if (!canEdit(evaluation, access))
      throw new AppError("You cannot attach evidence to this evaluation.", 403);
    return this.uploadEvidence(
      {
        actionPlanId: evaluation.actionPlan.id,
        observationAreaId: evaluation.actionPlan.observationAreaId,
        observationId: evaluation.actionPlan.observation.id,
        progressEvaluationId,
      },
      files,
      input,
      access,
    );
  },

  async getObservationEvidence(
    observationId: string,
    access: AuthorizationSummary,
  ) {
    const observation = await prisma.observation.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: observationId,
        ...buildObservationScopeWhere(access),
      },
    });
    if (!observation) throw new AppError("Observation not found.", 404);
    const records = await prisma.evidenceFile.findMany({
      include: {
        actionPlan: { select: { id: true, title: true } },
        observationArea: {
          select: { area: { select: { id: true, name: true } }, id: true },
        },
        progressEvaluation: { select: { id: true } },
        uploadedByUser: { select: userSelect },
      },
      orderBy: { createdAt: "desc" },
      where: {
        deletedAt: null,
        observationId,
        ...buildEvidenceScopeWhere(access),
      },
    });
    return records.map((record) => ({
      ...record,
      actionPlanId: record.actionPlan?.id ?? null,
      actionPlanTitle: record.actionPlan?.title ?? null,
      createdAt: record.createdAt.toISOString(),
      downloadPath: `/evidences/${record.id}/download`,
      observationArea: record.observationArea
        ? {
            id: record.observationArea.id,
            name: record.observationArea.area.name,
          }
        : null,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      progressEvaluationId: record.progressEvaluation?.id ?? null,
      sizeBytes: Number(record.sizeBytes),
      submittedAt: record.submittedAt?.toISOString() ?? null,
    }));
  },

  async submitEvidenceForReview(id: string, access: AuthorizationSummary) {
    const evidence = await getEvidenceReviewRecord(id, access);
    if (!access.isAdmin && evidence.uploadedByUserId !== access.userId)
      throw new AppError("You cannot submit this evidence.", 403);
    if (evidence.reviewStatus === "PENDING") {
      const record = (await this.getObservationEvidenceForIds([id], access))[0];
      if (!record) throw new AppError("Evidence not found.", 404);
      return record;
    }
    if (!["DRAFT", "RETURNED"].includes(evidence.reviewStatus))
      throw new AppError("La evidencia no está disponible para envío.", 409);

    if (evidence.reviewStatus === "RETURNED" && evidence.workflowInstanceId) {
      const priorInstance = await prisma.workflowInstance.findUnique({
        select: { status: true },
        where: { id: evidence.workflowInstanceId },
      });
      if (
        priorInstance &&
        ["CANCELLED", "COMPLETED", "REJECTED"].includes(priorInstance.status)
      ) {
        await prisma.evidenceFile.updateMany({
          data: { workflowInstanceId: null },
          where: { id, workflowInstanceId: evidence.workflowInstanceId },
        });
      }
    }

    const workflow = await workflowIntegrationService.startForEntity({
      access: { ...access, ipAddress: null },
      actorUserId: access.userId,
      entityId: id,
      entityType: "evidence_file",
      processType: "EVIDENCE_REVIEW",
    });
    const fallbackRecipients = workflow.instanceId
      ? []
      : await getActiveAuditors();
    if (!workflow.instanceId && fallbackRecipients.length === 0)
      throw new AppError(
        "No hay usuarios activos con rol Auditor para revisar la evidencia.",
        409,
      );
    const submittedAt = new Date();
    const updated = await prisma.evidenceFile.updateMany({
      data: {
        reviewComment: null,
        reviewStatus: "PENDING",
        submittedAt,
        workflowInstanceId: workflow.instanceId || null,
      },
      where: {
        id,
        reviewStatus: { in: ["DRAFT", "RETURNED"] },
      },
    });
    if (updated.count !== 1) {
      const current = await getEvidenceReviewRecord(id, access);
      if (current.reviewStatus === "PENDING") {
        const record = (
          await this.getObservationEvidenceForIds([id], access)
        )[0];
        if (!record) throw new AppError("Evidence not found.", 404);
        return record;
      }
      throw new AppError("La evidencia no está disponible para envío.", 409);
    }

    if (!workflow.instanceId) {
      const targetUrl = evidenceReviewTargetUrl(evidence.observation.id, id);
      const notification = evidenceReviewNotification(evidence);
      await queueEvidenceNotifications({
        entityId: id,
        eventType: "EVIDENCE_REVIEW_SUBMITTED",
        message: notification.message,
        operationKey: `evidence-review:${id}:${evidence.submittedAt?.getTime() ?? "initial"}`,
        recipients: fallbackRecipients,
        targetUrl,
        title: notification.title,
      });
    }

    const record = (await this.getObservationEvidenceForIds([id], access))[0];
    if (!record) throw new AppError("Evidence not found.", 404);
    return record;
  },

  async reviewEvidence(
    id: string,
    action: "approve" | "return",
    comment: string | null,
    access: AuthorizationSummary,
  ) {
    if (!canReviewEvidenceAsAuditor(access))
      throw new AppError(
        "Solo un usuario con rol Auditor puede revisar evidencias.",
        403,
      );
    const previous = await getEvidenceReviewRecord(id, access);
    if (previous.reviewStatus !== "PENDING")
      throw new AppError("La evidencia no está pendiente de revisión.", 409);
    if (previous.workflowInstanceId)
      throw new AppError(
        "Esta evidencia debe revisarse desde el flujo publicado asignado.",
        409,
      );
    const next = action === "approve" ? "APPROVED" : "RETURNED";
    const reviewedAt = new Date();
    const updated = await prisma.evidenceFile.updateMany({
      data: {
        reviewComment: action === "return" ? comment?.trim() || null : null,
        reviewedAt,
        reviewedByUserId: access.userId,
        reviewStatus: next,
      },
      where: {
        id,
        reviewStatus: "PENDING",
        workflowInstanceId: null,
      },
    });
    if (updated.count !== 1)
      throw new AppError("La evidencia ya fue revisada.", 409);

    const targetUrl = evidenceReviewTargetUrl(previous.observation.id, id);
    if (previous.uploadedByUser.id !== access.userId) {
      await queueEvidenceNotifications({
        entityId: id,
        eventType:
          next === "APPROVED" ? "EVIDENCE_APPROVED" : "EVIDENCE_RETURNED",
        message:
          next === "APPROVED"
            ? `La evidencia “${previous.originalName}” fue aprobada por Auditoría.`
            : `La evidencia “${previous.originalName}” fue devuelta por Auditoría${comment?.trim() ? `: ${comment.trim()}` : "."}`,
        operationKey: `evidence-review:${id}:${previous.submittedAt?.getTime() ?? "initial"}:${next.toLowerCase()}`,
        recipients: [previous.uploadedByUser],
        targetUrl,
        title:
          next === "APPROVED"
            ? "Evidencia aprobada"
            : "Evidencia devuelta por Auditoría",
      });
    }

    const record = (await this.getObservationEvidenceForIds([id], access))[0];
    if (!record) throw new AppError("Evidence not found.", 404);
    return {
      current: record,
      previous: {
        id: previous.id,
        observation: { id: previous.observation.id },
        reviewStatus: previous.reviewStatus,
      },
    };
  },

  async getObservationEvidenceForIds(
    ids: string[],
    access: AuthorizationSummary,
  ) {
    const records = await prisma.evidenceFile.findMany({
      include: {
        actionPlan: { select: { id: true, title: true } },
        observationArea: {
          select: { area: { select: { id: true, name: true } }, id: true },
        },
        progressEvaluation: { select: { id: true } },
        uploadedByUser: { select: userSelect },
      },
      where: {
        deletedAt: null,
        id: { in: ids },
        ...buildEvidenceScopeWhere(access),
      },
    });
    return records.map((record) => ({
      ...record,
      actionPlanId: record.actionPlan?.id ?? null,
      actionPlanTitle: record.actionPlan?.title ?? null,
      createdAt: record.createdAt.toISOString(),
      downloadPath: `/evidences/${record.id}/download`,
      observationArea: record.observationArea
        ? {
            id: record.observationArea.id,
            name: record.observationArea.area.name,
          }
        : null,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      progressEvaluationId: record.progressEvaluation?.id ?? null,
      sizeBytes: Number(record.sizeBytes),
      submittedAt: record.submittedAt?.toISOString() ?? null,
    }));
  },

  async deleteEvidence(id: string, access: AuthorizationSummary) {
    const record = await prisma.evidenceFile.findFirst({
      include: { observation: { select: { id: true } } },
      where: {
        deletedAt: null,
        id,
        ...buildEvidenceScopeWhere(access),
      },
    });
    if (!record) throw new AppError("Evidence not found.", 404);
    if (["PENDING", "APPROVED"].includes(record.reviewStatus))
      throw new AppError(
        "No se puede eliminar evidencia pendiente o aprobada.",
        409,
      );
    if (!access.isAdmin && record.uploadedByUserId !== access.userId)
      throw new AppError("You cannot delete this evidence.", 403);
    await prisma.evidenceFile.update({
      data: { deletedAt: new Date() },
      where: { id },
    });
    return {
      id: record.id,
      observationId: record.observation.id,
      originalName: record.originalName,
    };
  },

  async downloadEvidence(id: string, access: AuthorizationSummary) {
    const record = await prisma.evidenceFile.findFirst({
      where: {
        deletedAt: null,
        id,
        ...buildEvidenceScopeWhere(access),
      },
    });
    if (!record) throw new AppError("Evidence not found.", 404);
    const absolutePath = path.join(uploadsRootDir, record.relativePath);
    try {
      await fsAccess(absolutePath);
    } catch {
      throw new AppError("Evidence file not found on disk.", 404);
    }
    return {
      absolutePath,
      mimeType: record.mimeType,
      originalName: record.originalName,
    };
  },

  async createObservationComment(
    observationId: string,
    input: CreateCommentInput,
    access: AuthorizationSummary,
  ) {
    const observation = await prisma.observation.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: observationId,
        ...buildObservationScopeWhere(access),
      },
    });
    if (!observation) throw new AppError("Observation not found.", 404);
    if (input.actionPlanId) {
      const plan = await prisma.actionPlan.findFirst({
        select: { id: true },
        where: { id: input.actionPlanId, observationId },
      });
      if (!plan)
        throw new AppError(
          "Action plan does not belong to the observation.",
          400,
        );
    }
    return prisma.observationComment.create({
      data: {
        actionPlanId: input.actionPlanId ?? null,
        authorUserId: access.userId,
        body: input.body,
        observationId,
        progressEvaluationId: input.progressEvaluationId ?? null,
        visibility: input.visibility,
      },
      include: { authorUser: { select: userSelect } },
    });
  },

  async getObservationComments(
    observationId: string,
    access: AuthorizationSummary,
  ) {
    const internal =
      access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE";
    return prisma.observationComment.findMany({
      include: { authorUser: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      where: {
        deletedAt: null,
        observationId,
        observation: buildObservationScopeWhere(access),
        ...(!internal
          ? { visibility: { in: ["AREA_VISIBLE", "SYSTEM"] } }
          : {}),
      },
    });
  },

  async updateComment(
    id: string,
    input: UpdateCommentInput,
    access: AuthorizationSummary,
  ) {
    const record = await prisma.observationComment.findFirst({
      where: {
        deletedAt: null,
        id,
        observation: buildObservationScopeWhere(access),
      },
    });
    if (!record) throw new AppError("Comment not found.", 404);
    if (!access.isAdmin && record.authorUserId !== access.userId)
      throw new AppError("You cannot edit this comment.", 403);
    return prisma.observationComment.update({
      data: {
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.visibility !== undefined
          ? { visibility: input.visibility }
          : {}),
      },
      where: { id },
    });
  },

  async deleteComment(id: string, access: AuthorizationSummary) {
    const record = await prisma.observationComment.findFirst({
      where: {
        deletedAt: null,
        id,
        observation: buildObservationScopeWhere(access),
      },
    });
    if (!record) throw new AppError("Comment not found.", 404);
    if (!access.isAdmin && record.authorUserId !== access.userId)
      throw new AppError("You cannot delete this comment.", 403);
    await prisma.observationComment.update({
      data: { deletedAt: new Date() },
      where: { id },
    });
    return record;
  },
};
