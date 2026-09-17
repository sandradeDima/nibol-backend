import type { Prisma } from "../../../generated/prisma/client.js";

import {
  authorizationService,
  buildActionPlanScopeWhere,
  buildEvidenceScopeWhere,
  buildExtensionRequestScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { notificationService } from "../../services/notification-service.js";
import { AppError } from "../../utils/app-error.js";
import { buildObservationUrl } from "../../utils/observation-links.js";
import { prisma } from "../../utils/prisma.js";
import { workflowIntegrationService } from "../workflows/workflow-integration.service.js";
import { workflowTaskService } from "../workflows/workflow-task.service.js";
import { EDITABLE_EXTENSION_REQUEST_STATUSES } from "./extension-requests.constants.js";
import type {
  CreateExtensionRequestInput,
  ListExtensionRequestsQuery,
  ReviewExtensionRequestInput,
  UpdateExtensionRequestInput,
} from "./extension-requests.validators.js";

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const userSelect = {
  email: true,
  id: true,
  jobTitle: true,
  name: true,
} as const;
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
  classification: {
    select: {
      code: true,
      description: true,
      id: true,
      maxAdditionalDays: true,
      name: true,
    },
  },
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
} satisfies Prisma.DeadlineExtensionRequestInclude;

type ExtensionRecord = Prisma.DeadlineExtensionRequestGetPayload<{
  include: typeof include;
}>;

const extensionTargetUrl = (record: ExtensionRecord) => {
  const observation = record.observation ?? record.actionPlan?.observation;
  if (!observation) return `/ampliaciones-plazo/${record.id}`;
  return buildObservationUrl(observation.id, {
    extensionId: record.id,
    ...(record.actionPlan?.id ? { planId: record.actionPlan.id } : {}),
    tab: "plans",
  });
};

const format = (record: ExtensionRecord) => ({
  actionPlan: record.actionPlan
    ? {
        id: record.actionPlan.id,
        currentDueDate: record.actionPlan.currentDueDate.toISOString(),
        originalDueDate: record.actionPlan.originalDueDate.toISOString(),
        responsibleUser: record.actionPlan.responsibleUser,
      }
    : null,
  attachments: record.attachments.map(({ evidenceFile }) => ({
    ...evidenceFile,
    createdAt: evidenceFile.createdAt.toISOString(),
    downloadPath: `/evidences/${evidenceFile.id}/download`,
  })),
  createdAt: record.createdAt.toISOString(),
  classification: record.classification,
  finalApprovedAt: record.finalApprovedAt?.toISOString() ?? null,
  id: record.id,
  impactDays: Math.round(
    (record.proposedDueDate.getTime() - record.previousDueDate.getTime()) /
      (24 * 60 * 60 * 1000),
  ),
  managerComment: record.managerComment,
  managerReviewedAt: record.managerReviewedAt?.toISOString() ?? null,
  managerReviewer: record.managerReviewer,
  observation:
    (record.observation ?? record.actionPlan?.observation)
      ? {
          displayCode: `${(record.observation ?? record.actionPlan!.observation).auditReport.reportNumber} / OBS-${String((record.observation ?? record.actionPlan!.observation).observationNumber).padStart(3, "0")}`,
          id: (record.observation ?? record.actionPlan!.observation).id,
          title: (record.observation ?? record.actionPlan!.observation).title,
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

const accessWhere = (
  access: AuthorizationSummary,
): Prisma.DeadlineExtensionRequestWhereInput =>
  buildExtensionRequestScopeWhere(access);

const find = async (
  id: string,
  access: AuthorizationSummary,
): Promise<ExtensionRecord> => {
  const record = await prisma.deadlineExtensionRequest.findFirst({
    include,
    where: { deletedAt: null, id, ...accessWhere(access) },
  });
  if (!record) throw new AppError("Deadline extension request not found.", 404);
  return record;
};

const attachEvidence = async (
  tx: Prisma.TransactionClient,
  requestId: string,
  observationId: string,
  evidenceIds: string[],
  access: AuthorizationSummary,
) => {
  if (!evidenceIds.length) return;
  const count = await tx.evidenceFile.count({
    where: {
      ...buildEvidenceScopeWhere(access),
      id: { in: evidenceIds },
      observationId,
    },
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
  async listClassifications(access: AuthorizationSummary) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para solicitar ampliaciones.", 403);
    return prisma.deadlineExtensionClassification.findMany({
      orderBy: { name: "asc" },
      select: {
        code: true,
        description: true,
        maxAdditionalDays: true,
        name: true,
      },
      where: { active: true, maxAdditionalDays: { gt: 0 } },
    });
  },

  async createForActionPlan(
    actionPlanId: string,
    input: CreateExtensionRequestInput,
    access: AuthorizationSummary,
  ) {
    const actionPlan = await prisma.actionPlan.findFirst({
      select: {
        currentDueDate: true,
        id: true,
        observationAreaId: true,
        observationId: true,
        responsibleUserId: true,
      },
      where: {
        ...buildActionPlanScopeWhere(access),
        id: actionPlanId,
      },
    });
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para solicitar ampliaciones.", 403);
    if (!actionPlan) throw new AppError("Action plan not found.", 404);
    if (!access.isAdmin && actionPlan.responsibleUserId !== access.userId)
      throw new AppError(
        "Solo el ejecutor asignado puede solicitar la ampliación.",
        403,
      );
    const classification =
      await prisma.deadlineExtensionClassification.findFirst({
        select: { id: true, maxAdditionalDays: true },
        where: { active: true, code: input.classificationCode },
      });
    if (!classification || classification.maxAdditionalDays <= 0)
      throw new AppError(
        "La clasificación de ampliación no está configurada.",
        400,
      );
    const maxAllowedDate = addDays(
      actionPlan.currentDueDate,
      classification.maxAdditionalDays,
    );
    if (input.proposedDueDate <= actionPlan.currentDueDate)
      throw new AppError(
        "The proposed date must be after the current due date.",
        400,
      );
    if (input.proposedDueDate > maxAllowedDate)
      throw new AppError(
        "La nueva fecha supera el máximo permitido para la clasificación seleccionada.",
        400,
      );
    const existing = await prisma.deadlineExtensionRequest.findFirst({
      select: { id: true },
      where: { actionPlanId, deletedAt: null },
    });
    if (existing)
      throw new AppError(
        "Este plan de acción ya utilizó su única ampliación.",
        409,
      );
    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.deadlineExtensionRequest.create({
        data: {
          actionPlanId,
          classificationId: classification.id,
          maxAdditionalDays: classification.maxAdditionalDays,
          maxAllowedDate,
          observationAreaId: actionPlan.observationAreaId,
          previousDueDate: actionPlan.currentDueDate,
          proposedDueDate: input.proposedDueDate,
          reason: input.reason,
          requestedByUserId: access.userId,
          targetType: "ACTION_PLAN",
        },
        select: { id: true },
      });
      await attachEvidence(
        tx,
        request.id,
        actionPlan.observationId,
        input.evidenceFileIds,
        access,
      );
      return request;
    });
    return format(await find(created.id, access));
  },

  async getById(id: string, access: AuthorizationSummary) {
    return format(await find(id, access));
  },

  async list(query: ListExtensionRequestsQuery, access: AuthorizationSummary) {
    const where: Prisma.DeadlineExtensionRequestWhereInput = {
      deletedAt: null,
      ...accessWhere(access),
      ...(query.actionPlanId ? { actionPlanId: query.actionPlanId } : {}),
      ...(query.areaId
        ? {
            AND: [
              {
                OR: [
                  { observationArea: { areaId: query.areaId } },
                  { actionPlan: { observationArea: { areaId: query.areaId } } },
                  {
                    observation: {
                      areaAssignments: { some: { areaId: query.areaId } },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
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

  async update(
    id: string,
    input: UpdateExtensionRequestInput,
    access: AuthorizationSummary,
  ) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para gestionar ampliaciones.", 403);
    const previous = await find(id, access);
    if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status))
      throw new AppError("This request is not editable.", 409);
    if (!access.isAdmin && previous.requestedByUserId !== access.userId)
      throw new AppError("You cannot edit this request.", 403);
    const classification = input.classificationCode
      ? await prisma.deadlineExtensionClassification.findFirst({
          select: { id: true, maxAdditionalDays: true },
          where: { active: true, code: input.classificationCode },
        })
      : previous.classification;
    if (!classification || classification.maxAdditionalDays <= 0)
      throw new AppError(
        "La clasificación de ampliación no está configurada.",
        400,
      );
    const proposedDueDate = input.proposedDueDate ?? previous.proposedDueDate;
    if (proposedDueDate <= previous.previousDueDate)
      throw new AppError(
        "La nueva fecha debe ser posterior a la fecha actual.",
        400,
      );
    const maxAllowedDate = addDays(
      previous.previousDueDate,
      classification.maxAdditionalDays,
    );
    if (proposedDueDate > maxAllowedDate)
      throw new AppError(
        "La nueva fecha supera el máximo permitido para la clasificación seleccionada.",
        400,
      );
    await prisma.$transaction(async (tx) => {
      await tx.deadlineExtensionRequest.update({
        data: {
          ...(input.classificationCode
            ? {
                classificationId: classification.id,
                maxAdditionalDays: classification.maxAdditionalDays,
                maxAllowedDate,
              }
            : {}),
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
          ? (
              await tx.actionPlan.findUnique({
                select: { observationId: true },
                where: { id: previous.actionPlanId },
              })
            )?.observationId
          : null;
        const targetObservationId = observationId ?? actionPlanObservationId;
        if (!targetObservationId)
          throw new AppError("Extension target is invalid.", 409);
        await attachEvidence(
          tx,
          id,
          targetObservationId,
          input.evidenceFileIds,
          access,
        );
      }
    });
    return {
      current: format(await find(id, access)),
      previous: format(previous),
    };
  },

  async submit(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para enviar ampliaciones.", 403);
    const previous = await find(id, access);
    if (previous.status === "SENT_TO_MANAGER" && previous.workflowInstanceId)
      return {
        current: format(previous),
        previous: format(previous),
      };
    if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status))
      throw new AppError("This request cannot be submitted.", 409);
    if (!access.isAdmin && previous.requestedByUserId !== access.userId)
      throw new AppError(
        "Solo el solicitante puede enviar la ampliación.",
        403,
      );
    if (previous.status === "MANAGER_REJECTED" && previous.workflowInstanceId) {
      const priorInstance = await prisma.workflowInstance.findUnique({
        select: { status: true },
        where: { id: previous.workflowInstanceId },
      });
      if (
        priorInstance &&
        ["CANCELLED", "COMPLETED", "REJECTED"].includes(priorInstance.status)
      ) {
        await prisma.deadlineExtensionRequest.updateMany({
          data: { workflowInstanceId: null },
          where: { id, workflowInstanceId: previous.workflowInstanceId },
        });
      }
    }
    const workflow = await workflowIntegrationService.startForEntity({
      access: { ...access, ipAddress: null },
      actorUserId: access.userId,
      entityId: id,
      entityType: "deadline_extension_request",
      processType: "DEADLINE_EXTENSION",
    });
    const updated = await prisma.deadlineExtensionRequest.updateMany({
      data: { status: "SENT_TO_MANAGER" },
      where: {
        id,
        status: { in: ["DRAFT", "MANAGER_REJECTED"] },
      },
    });
    if (updated.count !== 1 && !workflow.instanceId) {
      throw new AppError("La solicitud ya fue enviada a revisión.", 409);
    }
    return {
      current: format(await find(id, access)),
      previous: format(previous),
    };
  },

  async managerReview(
    id: string,
    approved: boolean,
    input: ReviewExtensionRequestInput,
    access: AuthorizationSummary,
  ) {
    if (
      !authorizationService.can(
        access,
        approved ? "deadline_extensions.approve" : "deadline_extensions.reject",
      )
    )
      throw new AppError("No tiene permiso para revisar esta ampliación.", 403);
    const previous = await find(id, access);
    const alreadyReviewedStatus = approved
      ? "MANAGER_APPROVED"
      : "MANAGER_REJECTED";
    if (previous.status === alreadyReviewedStatus)
      return {
        current: format(previous),
        previous: format(previous),
      };
    if (previous.status !== "SENT_TO_MANAGER")
      throw new AppError("This request is not pending management review.", 409);
    if (
      !access.isAdmin &&
      previous.observationArea?.areaResponsible.id !== access.userId
    )
      throw new AppError(
        "Solo el responsable del área puede decidir esta ampliación.",
        403,
      );
    if (!approved && !input.comment)
      throw new AppError("A rejection comment is required.", 400);
    const workflowInstanceId = previous.workflowInstanceId;
    const usedWorkflow = Boolean(workflowInstanceId);
    if (workflowInstanceId) {
      const task = await prisma.workflowTask.findFirst({
        select: { id: true },
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          workflowInstanceId,
        },
      });
      if (!task)
        throw new AppError(
          "La instancia de ampliación no tiene una tarea activa.",
          409,
        );
      await workflowTaskService.actOnTask(
        task.id,
        approved ? "APPROVE" : "REJECT",
        { comment: input.comment ?? undefined },
        { ...access, ipAddress: null },
      );
    } else {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.deadlineExtensionRequest.updateMany({
          data: {
            managerComment: input.comment,
            managerReviewedAt: new Date(),
            managerReviewerId: access.userId,
            finalApprovedAt: approved ? new Date() : null,
            status: approved ? "MANAGER_APPROVED" : "MANAGER_REJECTED",
          },
          where: { id, status: "SENT_TO_MANAGER" },
        });
        if (updated.count !== 1)
          throw new AppError("La solicitud ya fue revisada.", 409);
        if (approved && previous.actionPlanId)
          await tx.actionPlan.update({
            data: { currentDueDate: previous.proposedDueDate },
            where: { id: previous.actionPlanId },
          });
      });
    }
    if (!usedWorkflow && previous.requestedByUserId !== access.userId)
      await notificationService.create({
        message: approved
          ? `La ampliación fue aprobada hasta el ${previous.proposedDueDate.toISOString().slice(0, 10)}.`
          : "La solicitud de ampliación fue rechazada.",
        title: "Solicitud de ampliación revisada",
        targetUrl: extensionTargetUrl(previous),
        type: approved ? "success" : "warning",
        userId: previous.requestedByUserId,
      });
    return {
      current: format(await find(id, access)),
      previous: format(previous),
    };
  },

  async cancel(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para cancelar ampliaciones.", 403);
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
