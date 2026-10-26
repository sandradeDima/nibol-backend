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
import { resolveNotificationTarget } from "../../utils/notification-links.js";
import { prisma } from "../../utils/prisma.js";
import { workflowIntegrationService } from "../workflows/workflow-integration.service.js";
import { workflowInstanceService } from "../workflows/workflow-instance.service.js";
import {
  findActiveWorkflowTaskForEntity,
  findActiveWorkflowTasksForEntities,
  type ActiveWorkflowTaskSummary,
  workflowTaskService,
} from "../workflows/workflow-task.service.js";
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

export const isActiveWorkflowInstanceStatus = (status: string): boolean =>
  ["PENDING", "ACTIVE", "WAITING"].includes(status);

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
      description: true,
      observation: {
        select: {
          areaAssignments: { select: { areaResponsibleUserId: true } },
          auditReport: { select: { reportNumber: true } },
          id: true,
          observationNumber: true,
          title: true,
        },
      },
      originalDueDate: true,
      responsibleUser: { select: userSelect },
      title: true,
      observationArea: {
        select: {
          area: { select: { id: true, name: true } },
          areaResponsible: { select: userSelect },
          processOwner: { select: userSelect },
        },
      },
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
          sizeBytes: true,
          uploadedByUser: { select: userSelect },
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
      areaAssignments: { select: { areaResponsibleUserId: true } },
      auditReport: { select: { reportNumber: true } },
      auditorUserId: true,
      id: true,
      currentDueDate: true,
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

type ReviewTaskSummary = {
  allowedActions: string[];
  canAct: boolean;
  id: string | null;
  status: string;
};

export const getEffectiveExtensionDueDate = (input: {
  actionPlanDueDate?: Date | null;
  observationDueDate?: Date | null;
  previousDueDate: Date;
}): Date =>
  input.actionPlanDueDate ?? input.observationDueDate ?? input.previousDueDate;

const extensionTargetUrl = (record: ExtensionRecord) =>
  resolveNotificationTarget({
    entityId: record.id,
    entityType: "DEADLINE_EXTENSION_REQUEST",
  }) ?? `/ampliaciones-plazo/${record.id}`;

const format = (
  record: ExtensionRecord,
  access: AuthorizationSummary,
  reviewTask: ReviewTaskSummary | null = null,
) => ({
  actionPlan: record.actionPlan
    ? {
        id: record.actionPlan.id,
        currentDueDate: record.actionPlan.currentDueDate.toISOString(),
        description: record.actionPlan.description,
        originalDueDate: record.actionPlan.originalDueDate.toISOString(),
        responsibleUser: record.actionPlan.responsibleUser,
        title: record.actionPlan.title,
        observationArea: record.actionPlan.observationArea,
      }
    : null,
  attachments: authorizationService.can(access, "evidence.view")
    ? record.attachments.map(({ evidenceFile }) => ({
        ...evidenceFile,
        createdAt: evidenceFile.createdAt.toISOString(),
        downloadPath: `/evidences/${evidenceFile.id}/download`,
        sizeBytes: Number(evidenceFile.sizeBytes),
      }))
    : [],
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
  effectiveDueDate: getEffectiveExtensionDueDate({
    actionPlanDueDate: record.actionPlan?.currentDueDate ?? null,
    observationDueDate: record.observation?.currentDueDate ?? null,
    previousDueDate: record.previousDueDate,
  }).toISOString(),
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
  reviewTask,
});

const legacyReviewTask = (
  record: ExtensionRecord,
  access: AuthorizationSummary,
): ReviewTaskSummary | null => {
  if (record.status !== "SENT_TO_MANAGER" || record.workflowInstanceId)
    return null;
  const isAreaResponsible =
    record.observationArea?.areaResponsible.id === access.userId ||
    record.actionPlan?.observationArea?.areaResponsible.id === access.userId ||
    (record.observation?.areaAssignments.some(
      (assignment) => assignment.areaResponsibleUserId === access.userId,
    ) ??
      false) ||
    (record.actionPlan?.observation.areaAssignments.some(
      (assignment) => assignment.areaResponsibleUserId === access.userId,
    ) ??
      false);
  const canAct = access.isAdmin || isAreaResponsible;
  const allowedActions = [
    ...(canAct &&
    authorizationService.can(access, "deadline_extensions.approve")
      ? ["APPROVE"]
      : []),
    ...(canAct && authorizationService.can(access, "deadline_extensions.reject")
      ? ["REJECT"]
      : []),
  ];
  return {
    allowedActions,
    canAct: allowedActions.length > 0,
    id: null,
    status: record.status,
  };
};

const formatWithReviewTask = async (
  record: ExtensionRecord,
  access: AuthorizationSummary,
): Promise<ReturnType<typeof format>> => {
  const workflowTask = record.workflowInstanceId
    ? await findActiveWorkflowTaskForEntity({
        entityId: record.id,
        entityType: "deadline_extension_request",
        permissions: extensionWorkflowPermissions(access),
        processType: "DEADLINE_EXTENSION",
        userId: access.userId,
      })
    : null;
  return format(
    record,
    access,
    workflowTask ?? legacyReviewTask(record, access),
  );
};

const accessWhere = (
  access: AuthorizationSummary,
): Prisma.DeadlineExtensionRequestWhereInput =>
  authorizationService.can(access, "deadline_extensions.view") ||
  !authorizationService.can(access, "deadline_extensions.request")
    ? buildExtensionRequestScopeWhere(access)
    : {
        AND: [
          buildExtensionRequestScopeWhere(access),
          { requestedByUserId: access.userId },
        ],
      };

const extensionWorkflowPermissions = (access: AuthorizationSummary) => [
  ...access.permissions,
  ...(authorizationService.can(access, "deadline_extensions.approve")
    ? ["workflow_tasks.approve"]
    : []),
  ...(authorizationService.can(access, "deadline_extensions.reject")
    ? ["workflow_tasks.reject"]
    : []),
];

const legacyReviewableWhere = (
  access: AuthorizationSummary,
): Prisma.DeadlineExtensionRequestWhereInput =>
  access.isAdmin
    ? { workflowInstanceId: null }
    : {
        OR: [
          { observationArea: { areaResponsibleUserId: access.userId } },
          {
            actionPlan: {
              observationArea: { areaResponsibleUserId: access.userId },
            },
          },
          {
            observation: {
              areaAssignments: {
                some: { areaResponsibleUserId: access.userId },
              },
            },
          },
        ],
        workflowInstanceId: null,
      };

export const buildExtensionReviewQueueScopeWhere = (
  access: AuthorizationSummary,
  assignedRequestIds: readonly string[],
): Prisma.DeadlineExtensionRequestWhereInput => ({
  OR: [
    accessWhere(access),
    legacyReviewableWhere(access),
    ...(assignedRequestIds.length
      ? [{ id: { in: [...assignedRequestIds] } }]
      : []),
  ],
});

const find = async (
  id: string,
  access: AuthorizationSummary,
): Promise<ExtensionRecord> => {
  const record = await prisma.deadlineExtensionRequest.findFirst({
    include,
    where: { deletedAt: null, id, ...accessWhere(access) },
  });
  if (!record)
    throw new AppError(
      "No se encontró la solicitud de ampliación de plazo.",
      404,
    );
  return record;
};

const findReviewable = async (
  id: string,
  access: AuthorizationSummary,
): Promise<ExtensionRecord> => {
  const task = await findActiveWorkflowTaskForEntity({
    entityId: id,
    entityType: "deadline_extension_request",
    permissions: extensionWorkflowPermissions(access),
    processType: "DEADLINE_EXTENSION",
    userId: access.userId,
  });
  const record = task
    ? await prisma.deadlineExtensionRequest.findFirst({
        include,
        where: { deletedAt: null, id },
      })
    : await prisma.deadlineExtensionRequest.findFirst({
        include,
        where: {
          AND: [
            { deletedAt: null, id },
            { OR: [accessWhere(access), legacyReviewableWhere(access)] },
          ],
        },
      });
  if (!record)
    throw new AppError(
      "No se encontró la solicitud de ampliación de plazo.",
      404,
    );
  return record;
};

const findById = async (id: string): Promise<ExtensionRecord> => {
  const record = await prisma.deadlineExtensionRequest.findFirst({
    include,
    where: { deletedAt: null, id },
  });
  if (!record)
    throw new AppError(
      "No se encontró la solicitud de ampliación de plazo.",
      404,
    );
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
    throw new AppError("Uno o más archivos de evidencia no son válidos.", 400);
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
    if (!actionPlan)
      throw new AppError("No se encontró el plan de acción.", 404);
    if (!access.isAdmin && actionPlan.responsibleUserId !== access.userId)
      throw new AppError(
        "Solo puede solicitar ampliaciones de sus planes asignados.",
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
        "La fecha propuesta debe ser posterior a la fecha de compromiso vigente.",
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
    return format(await find(created.id, access), access);
  },

  async getById(id: string, access: AuthorizationSummary) {
    return formatWithReviewTask(await findReviewable(id, access), access);
  },

  async list(query: ListExtensionRequestsQuery, access: AuthorizationSummary) {
    if (
      !authorizationService.can(access, "deadline_extensions.view") &&
      !authorizationService.can(access, "deadline_extensions.request") &&
      !query.reviewQueue
    )
      throw new AppError(
        "Solo puede consultar la bandeja de ampliaciones pendientes.",
        403,
      );
    const reviewTasks = query.reviewQueue
      ? await findActiveWorkflowTasksForEntities({
          entityType: "deadline_extension_request",
          permissions: extensionWorkflowPermissions(access),
          processType: "DEADLINE_EXTENSION",
          userId: access.userId,
        })
      : new Map<string, ActiveWorkflowTaskSummary>();
    const filters: Prisma.DeadlineExtensionRequestWhereInput[] = [
      { deletedAt: null },
      query.reviewQueue
        ? buildExtensionReviewQueueScopeWhere(access, [...reviewTasks.keys()])
        : accessWhere(access),
      ...(query.actionPlanId ? [{ actionPlanId: query.actionPlanId }] : []),
      ...(query.areaId?.length
        ? [
            {
              OR: [
                ...query.areaId.map((areaId) => ({
                  observationArea: { areaId },
                })),
                ...query.areaId.map((areaId) => ({
                  actionPlan: { observationArea: { areaId } },
                })),
                ...query.areaId.map((areaId) => ({
                  observation: { areaAssignments: { some: { areaId } } },
                })),
              ],
            },
          ]
        : []),
      ...(query.executorUserId?.length
        ? [
            {
              actionPlan: {
                responsibleUserId: { in: query.executorUserId },
              },
            },
          ]
        : []),
      ...(query.observationId
        ? [
            {
              OR: [
                { observationId: query.observationId },
                { actionPlan: { observationId: query.observationId } },
              ],
            },
          ]
        : []),
      ...(query.requestedByUserId
        ? [{ requestedByUserId: query.requestedByUserId }]
        : []),
      ...(query.responsibleUserId?.length
        ? [
            {
              OR: [
                ...query.responsibleUserId.map((responsibleUserId) => ({
                  observationArea: { areaResponsibleUserId: responsibleUserId },
                })),
                ...query.responsibleUserId.map((responsibleUserId) => ({
                  actionPlan: {
                    observationArea: {
                      areaResponsibleUserId: responsibleUserId,
                    },
                  },
                })),
                ...query.responsibleUserId.map((responsibleUserId) => ({
                  observation: {
                    areaAssignments: {
                      some: { areaResponsibleUserId: responsibleUserId },
                    },
                  },
                })),
              ],
            },
          ]
        : []),
      ...(query.status?.length ? [{ status: { in: query.status } }] : []),
      ...(query.targetType ? [{ targetType: query.targetType }] : []),
      ...(query.search
        ? [
            {
              OR: [
                { reason: { contains: query.search } },
                { observation: { title: { contains: query.search } } },
                { actionPlan: { title: { contains: query.search } } },
              ],
            },
          ]
        : []),
    ];
    if (query.reviewQueue) {
      filters.push({
        OR: [
          ...(reviewTasks.size
            ? [{ id: { in: [...reviewTasks.keys()] } }]
            : []),
          {
            ...legacyReviewableWhere(access),
            status: "SENT_TO_MANAGER",
          },
        ],
      });
      filters.push({ status: "SENT_TO_MANAGER" });
    }
    const where: Prisma.DeadlineExtensionRequestWhereInput = {
      AND: filters,
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
      data: records.map((record) =>
        format(
          record,
          access,
          query.reviewQueue
            ? (reviewTasks.get(record.id) ?? legacyReviewTask(record, access))
            : null,
        ),
      ),
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
    if (
      !access.isAdmin &&
      previous.actionPlan &&
      previous.actionPlan.responsibleUser.id !== access.userId
    )
      throw new AppError(
        "Solo puede solicitar ampliaciones de sus planes asignados.",
        403,
      );
    if (!EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status))
      throw new AppError("Esta solicitud ya no se puede editar.", 409);
    if (!access.isAdmin && previous.requestedByUserId !== access.userId)
      throw new AppError("No tiene permiso para editar esta solicitud.", 403);
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
          throw new AppError("El destino de la ampliación no es válido.", 409);
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
      current: format(await find(id, access), access),
      previous: format(previous, access),
    };
  },

  async submit(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para enviar ampliaciones.", 403);
    const previous = await find(id, access);
    if (
      !access.isAdmin &&
      previous.actionPlan &&
      previous.actionPlan.responsibleUser.id !== access.userId
    )
      throw new AppError(
        "Solo puede solicitar ampliaciones de sus planes asignados.",
        403,
      );
    if (
      !EDITABLE_EXTENSION_REQUEST_STATUSES.has(previous.status) &&
      !(previous.status === "SENT_TO_MANAGER" && previous.workflowInstanceId)
    )
      throw new AppError("Esta solicitud no se puede enviar.", 409);
    if (!access.isAdmin && previous.requestedByUserId !== access.userId)
      throw new AppError(
        "Solo el solicitante puede enviar la ampliación.",
        403,
      );
    let replaceInstanceId: string | undefined;
    if (previous.workflowInstanceId) {
      const priorInstance = await prisma.workflowInstance.findUnique({
        select: { status: true },
        where: { id: previous.workflowInstanceId },
      });
      if (
        priorInstance &&
        ["CANCELLED", "COMPLETED", "REJECTED"].includes(priorInstance.status)
      ) {
        replaceInstanceId = previous.workflowInstanceId;
      }
    }
    const workflow = await workflowIntegrationService.startForEntity({
      access: { ...access, ipAddress: null },
      actorUserId: access.userId,
      entityId: id,
      entityType: "deadline_extension_request",
      processType: "DEADLINE_EXTENSION",
      replaceInstanceId,
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
      current: format(await find(id, access), access),
      previous: format(previous, access),
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
    const previous = await findReviewable(id, access);
    const alreadyReviewedStatus = approved
      ? "MANAGER_APPROVED"
      : "MANAGER_REJECTED";
    if (previous.status === alreadyReviewedStatus)
      return {
        current: format(previous, access),
        previous: format(previous, access),
      };
    if (previous.status !== "SENT_TO_MANAGER")
      throw new AppError(
        "Esta solicitud no está pendiente de revisión por Gerencia.",
        409,
      );
    if (!approved && !input.comment)
      throw new AppError(
        "Debe ingresar un comentario para rechazar la ampliación.",
        400,
      );
    const workflowInstanceId = previous.workflowInstanceId;
    const usedWorkflow = Boolean(workflowInstanceId);
    if (
      !workflowInstanceId &&
      !access.isAdmin &&
      !(await prisma.deadlineExtensionRequest.findFirst({
        select: { id: true },
        where: {
          AND: [{ deletedAt: null, id }, legacyReviewableWhere(access)],
        },
      }))
    )
      throw new AppError(
        "Solo el responsable del área puede decidir esta ampliación.",
        403,
      );
    if (workflowInstanceId) {
      const task = await findActiveWorkflowTaskForEntity({
        entityId: id,
        entityType: "deadline_extension_request",
        permissions: extensionWorkflowPermissions(access),
        processType: "DEADLINE_EXTENSION",
        userId: access.userId,
      });
      if (!task)
        throw new AppError(
          "No está autorizado para decidir la tarea pendiente de esta ampliación.",
          403,
        );
      await workflowTaskService.actOnTask(
        task.id,
        approved ? "APPROVE" : "REJECT",
        { comment: input.comment ?? undefined },
        {
          ...access,
          ipAddress: null,
          permissions: [
            ...access.permissions,
            approved ? "workflow_tasks.approve" : "workflow_tasks.reject",
          ],
        },
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
        if (approved && previous.observationId)
          await tx.observation.update({
            data: { currentDueDate: previous.proposedDueDate },
            where: { id: previous.observationId },
          });
      });
    }
    if (!usedWorkflow && previous.requestedByUserId !== access.userId) {
      const eventType = approved ? "EXTENSION_APPROVED" : "EXTENSION_REJECTED";
      const message = approved
        ? `La ampliación fue aprobada hasta el ${previous.proposedDueDate.toISOString().slice(0, 10)}.`
        : "La solicitud de ampliación fue rechazada.";
      const title = "Solicitud de ampliación revisada";
      const targetUrl = extensionTargetUrl(previous);
      await Promise.all([
        notificationService.create({
          entityId: previous.id,
          entityType: "DEADLINE_EXTENSION_REQUEST",
          eventType,
          message,
          title,
          targetUrl,
          type: approved ? "success" : "warning",
          userId: previous.requestedByUserId,
        }),
        notificationService.sendEmailNotification({
          eventType,
          message,
          title,
          targetUrl,
          userId: previous.requestedByUserId,
        }),
      ]);
    }
    return {
      current: format(await findById(id), access),
      previous: format(previous, access),
    };
  },

  async cancel(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "deadline_extensions.request"))
      throw new AppError("No tiene permiso para cancelar ampliaciones.", 403);
    const previous = await find(id, access);
    if (!access.isAdmin && previous.requestedByUserId !== access.userId)
      throw new AppError("No tiene permiso para cancelar esta solicitud.", 403);
    if (previous.workflowInstanceId) {
      const workflowInstance = await prisma.workflowInstance.findUnique({
        select: { status: true },
        where: { id: previous.workflowInstanceId },
      });
      if (
        workflowInstance &&
        isActiveWorkflowInstanceStatus(workflowInstance.status)
      ) {
        await workflowInstanceService.cancelInstance(
          previous.workflowInstanceId,
          { ...access, ipAddress: null },
          { internal: true },
        );
      }
    }
    await prisma.deadlineExtensionRequest.update({
      data: { status: "CANCELLED" },
      where: { id },
    });
    return {
      current: format(await find(id, access), access),
      previous: format(previous, access),
    };
  },
};
