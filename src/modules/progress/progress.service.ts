import { createHash, randomUUID } from "node:crypto";
import { access as fsAccess, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "../../../generated/prisma/client.js";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { uploadsRootDir } from "../../utils/uploads.js";
import { buildObservationAccessWhere } from "../observations/observations.service.js";
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

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  size: number;
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
        select: { area: { select: { id: true, name: true } } },
      },
      responsibleUser: { select: userSelect },
      title: true,
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
): Prisma.ProgressEvaluationWhereInput => ({
  actionPlan: { observation: buildObservationAccessWhere(access) },
});

const formatEvaluation = (record: EvaluationRecord) => ({
  actionPlan: {
    area: record.actionPlan.observationArea.area,
    id: record.actionPlan.id,
    responsibleUser: record.actionPlan.responsibleUser,
    title: record.actionPlan.title,
  },
  actionPlanStatus: record.actionPlanStatus,
  comment: record.comment,
  evidence: record.evidenceFiles.map((file) => ({
    ...file,
    createdAt: file.createdAt.toISOString(),
    downloadPath: `/evidences/${file.id}/download`,
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
  progressPercent: record.progressPercent,
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
  access.isAdmin ||
  (record.submittedByUserId === access.userId &&
    ["DRAFT", "RETURNED"].includes(record.reviewStatus));

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
  return Promise.all(
    files.map(async (file) => {
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
      return {
        absolutePath,
        checksum: createHash("sha256").update(file.buffer).digest("hex"),
        mimeType: file.mimetype,
        originalName: originalName || "evidencia",
        relativePath,
        sizeBytes: BigInt(file.size),
        storedName,
      };
    }),
  );
};

const refreshPlanFromLatestApproval = async (
  tx: Prisma.TransactionClient,
  actionPlanId: string,
) => {
  const latest = await tx.progressEvaluation.findFirst({
    orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    select: { actionPlanStatus: true, progressPercent: true },
    where: { actionPlanId, deletedAt: null, reviewStatus: "APPROVED" },
  });
  if (!latest) return;
  const actionPlan = await tx.actionPlan.update({
    data: {
      completedAt: latest.actionPlanStatus === "CONCLUDED" ? new Date() : null,
      progressPercent: latest.progressPercent,
      status: latest.actionPlanStatus,
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
      observation: { select: { auditorUserId: true, id: true } },
      responsibleUserId: true,
    },
    where: {
      deletedAt: null,
      id,
      observation: buildObservationAccessWhere(access),
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
      access.permissions.includes("progress_evaluations.submit");
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
              { actionPlan: { title: { contains: query.search } } },
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
    action: "approve" | "reject" | "return",
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
      "progress_evaluations.review",
      ...(action === "approve"
        ? ["progress_evaluations.approve"]
        : action === "reject"
          ? ["progress_evaluations.reject"]
          : []),
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
        "Debe ingresar un comentario para devolver o rechazar la evaluación.",
        400,
      );
    const next =
      action === "approve"
        ? "APPROVED"
        : action === "return"
          ? "RETURNED"
          : "REJECTED";
    await prisma.$transaction(async (tx) => {
      await tx.progressEvaluation.update({
        data: {
          reviewComment: input.comment,
          reviewedAt: new Date(),
          reviewedByUserId: access.userId,
          reviewStatus: next,
        },
        where: { id },
      });
      await tx.progressReviewHistory.create({
        data: {
          action:
            action === "approve"
              ? "APPROVED"
              : action === "return"
                ? "RETURNED"
                : "REJECTED",
          comment: input.comment,
          fromStatus: previous.reviewStatus,
          progressEvaluationId: id,
          toStatus: next,
          userId: access.userId,
        },
      });
      if (action === "approve")
        await refreshPlanFromLatestApproval(tx, previous.actionPlan.id);
    });
    if (previous.submittedByUser.id !== access.userId) {
      await notificationService.create({
        message: `La evaluación de avance de "${previous.actionPlan.title}" fue ${next === "APPROVED" ? "aprobada" : next === "RETURNED" ? "devuelta" : "rechazada"}.`,
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
    if (
      previous.actionPlanStatus === "CONCLUDED" &&
      previous.evidenceFiles.length === 0
    )
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
    if (auditorId !== access.userId) {
      await notificationService.create({
        message: `Hay una evaluación pendiente para "${previous.actionPlan.title}".`,
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
        ...(input.actionPlanStatus !== undefined
          ? { actionPlanStatus: input.actionPlanStatus }
          : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.progressPercent !== undefined
          ? { progressPercent: input.progressPercent }
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
        ...buildObservationAccessWhere(access),
      },
    });
    if (!observation) throw new AppError("Observation not found.", 404);
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
    return this.uploadEvidence({ observationId }, files, input, access);
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
      { actionPlanId, observationId: actionPlan.observation.id },
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
        ...buildObservationAccessWhere(access),
      },
    });
    if (!observation) throw new AppError("Observation not found.", 404);
    const records = await prisma.evidenceFile.findMany({
      include: { uploadedByUser: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      where: { deletedAt: null, observationId },
    });
    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      downloadPath: `/evidences/${record.id}/download`,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      sizeBytes: Number(record.sizeBytes),
      submittedAt: record.submittedAt?.toISOString() ?? null,
    }));
  },

  async submitEvidenceForReview(id: string, access: AuthorizationSummary) {
    const evidence = await prisma.evidenceFile.findFirst({
      select: {
        id: true,
        reviewStatus: true,
        uploadedByUserId: true,
        workflowInstanceId: true,
      },
      where: {
        deletedAt: null,
        id,
        observation: buildObservationAccessWhere(access),
      },
    });
    if (!evidence) throw new AppError("Evidence not found.", 404);
    if (!access.isAdmin && evidence.uploadedByUserId !== access.userId)
      throw new AppError("You cannot submit this evidence.", 403);
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
        await prisma.evidenceFile.update({
          data: { workflowInstanceId: null },
          where: { id },
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
    if (!workflow.instanceId)
      throw new AppError(
        "No existe un flujo publicado para revisar evidencias.",
        409,
      );
    await prisma.evidenceFile.update({
      data: {
        reviewComment: null,
        reviewStatus: "PENDING",
        submittedAt: new Date(),
        workflowInstanceId: workflow.instanceId,
      },
      where: { id },
    });
    const [record] = await this.getObservationEvidenceForIds([id], access);
    return record;
  },

  async getObservationEvidenceForIds(
    ids: string[],
    access: AuthorizationSummary,
  ) {
    const records = await prisma.evidenceFile.findMany({
      include: { uploadedByUser: { select: userSelect } },
      where: {
        deletedAt: null,
        id: { in: ids },
        observation: buildObservationAccessWhere(access),
      },
    });
    return records.map((record) => ({
      ...record,
      createdAt: record.createdAt.toISOString(),
      downloadPath: `/evidences/${record.id}/download`,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
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
        observation: buildObservationAccessWhere(access),
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
        observation: buildObservationAccessWhere(access),
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
        ...buildObservationAccessWhere(access),
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
      access.isAdmin ||
      access.roles.some((role) => role.toLowerCase().includes("audit"));
    return prisma.observationComment.findMany({
      include: { authorUser: { select: userSelect } },
      orderBy: { createdAt: "desc" },
      where: {
        deletedAt: null,
        observationId,
        observation: buildObservationAccessWhere(access),
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
      where: { deletedAt: null, id },
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
      where: { deletedAt: null, id },
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
