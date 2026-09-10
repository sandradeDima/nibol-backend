import type { Prisma } from "../../../generated/prisma/client.js";

import {
  authorizationService,
  buildActionPlanScopeWhere,
  buildObservationAreaScopeWhere,
  buildObservationScopeWhere,
  buildRemediationPlanScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { observationAggregationService } from "../observations/observation-aggregation.service.js";
import { observationDeadlineService } from "../observations/observation-deadline.service.js";
import { workflowIntegrationService } from "../workflows/workflow-integration.service.js";
import {
  getActionPlanDeadlineStatus,
  getEffectiveActionPlanDueDate,
  getOfficialActionPlanProgress,
  isApprovedDeadlineExtension,
} from "../reports/reporting-definitions.js";
import type {
  ActionPlanDetail,
  CreateActionPlanInput,
  CreateRemediationPlanInput,
  ListActionPlansQuery,
  UpdateActionPlanInput,
  UpdateRemediationPlanInput,
} from "./remediation.types.js";

const userSelect = {
  email: true,
  id: true,
  jobTitle: true,
  name: true,
} as const;
const include = {
  _count: { select: { evidenceFiles: true, progressEvaluations: true } },
  deadlineExtensionRequests: {
    select: {
      finalApprovedAt: true,
      proposedDueDate: true,
      status: true,
    },
    where: { deletedAt: null },
  },
  observation: {
    select: {
      auditReport: { select: { reportNumber: true } },
      id: true,
      observationNumber: true,
      title: true,
    },
  },
  observationArea: {
    select: {
      area: { select: { id: true, name: true } },
      areaResponsible: { select: userSelect },
      processOwner: { select: userSelect },
    },
  },
  responsibleUser: { select: userSelect },
} satisfies Prisma.ActionPlanInclude;

type ActionPlanRecord = Prisma.ActionPlanGetPayload<{
  include: typeof include;
}>;

const labels = {
  CONCLUDED: "Concluido",
  NOT_STARTED: "No iniciado",
  STARTED: "Iniciado",
  WITH_PROGRESS: "Con avance",
} as const;

const format = (record: ActionPlanRecord): ActionPlanDetail => {
  const officialProgress = getOfficialActionPlanProgress(record.status);
  const effectiveDueDate = getEffectiveActionPlanDueDate(record);
  const deadlineStatus = getActionPlanDeadlineStatus(record);
  return {
    area: record.observationArea.area,
    areaResponsible: record.observationArea.areaResponsible,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    currentDueDate: record.currentDueDate.toISOString(),
    deadlineStatus,
    description: record.description,
    evidenceCount: record._count.evidenceFiles,
    effectiveDueDate: effectiveDueDate.toISOString(),
    id: record.id,
    isOverdue: deadlineStatus === "VENCIDO",
    observation: {
      displayCode: `${record.observation.auditReport.reportNumber} / OBS-${String(record.observation.observationNumber).padStart(3, "0")}`,
      id: record.observation.id,
      observationNumber: record.observation.observationNumber,
      reportNumber: record.observation.auditReport.reportNumber,
      title: record.observation.title,
    },
    observationAreaId: record.observationAreaId,
    originalDueDate: record.originalDueDate.toISOString(),
    processOwner: record.observationArea.processOwner,
    progressEvaluationCount: record._count.progressEvaluations,
    officialProgressCode: officialProgress.code,
    officialProgressPercent: officialProgress.percent,
    progressPercent: officialProgress.percent,
    reprogrammed: Boolean(
      record.deadlineExtensionRequests.find(isApprovedDeadlineExtension),
    ),
    responsibleUser: record.responsibleUser,
    sortOrder: record.sortOrder,
    status: record.status,
    statusLabel: labels[record.status],
    updatedAt: record.updatedAt.toISOString(),
  };
};

const accessWhere = (
  access: AuthorizationSummary,
): Prisma.ActionPlanWhereInput => buildActionPlanScopeWhere(access);

const validateDueDate = async (observationId: string, dueDate: Date) => {
  const observation = await prisma.observation.findUnique({
    select: {
      auditReport: { select: { reportDate: true } },
      riskLevel: { select: { maxRemediationDays: true, name: true } },
    },
    where: { id: observationId },
  });
  if (!observation?.riskLevel)
    throw new AppError(
      "La observación no tiene un nivel de riesgo válido.",
      400,
    );
  let maximumDate: Date;
  try {
    maximumDate = observationDeadlineService.calculate(
      observation.auditReport.reportDate,
      observation.riskLevel.maxRemediationDays,
    );
  } catch {
    throw new AppError(
      "El nivel de riesgo no tiene un plazo máximo configurado.",
      400,
    );
  }
  if (dueDate > maximumDate)
    throw new AppError(
      `La fecha seleccionada supera el plazo máximo permitido para el nivel de riesgo ${observation.riskLevel.name}.`,
      400,
    );
};

const find = async (
  id: string,
  access: AuthorizationSummary,
): Promise<ActionPlanRecord> => {
  const record = await prisma.actionPlan.findFirst({
    include,
    where: { deletedAt: null, id, ...accessWhere(access) },
  });
  if (!record) throw new AppError("No se encontró el plan de acción.", 404);
  return record;
};

const validateAssignment = async (
  observationId: string,
  observationAreaId: string,
  responsibleUserId: string,
  access: AuthorizationSummary,
) => {
  const [observationArea, user] = await Promise.all([
    prisma.observationArea.findFirst({
      select: { id: true },
      where: {
        id: observationAreaId,
        observationId,
        ...buildObservationAreaScopeWhere(access),
      },
    }),
    prisma.user.findFirst({
      select: { id: true },
      where: { deletedAt: null, id: responsibleUserId, isActive: true },
    }),
  ]);
  if (!observationArea)
    throw new AppError(
      "El área seleccionada no pertenece a esta observación.",
      400,
    );
  if (!user)
    throw new AppError(
      "El ejecutor seleccionado no existe o está inactivo.",
      400,
    );
  const executorRole = await prisma.userRole.findFirst({
    select: { userId: true },
    where: { userId: responsibleUserId, role: { code: "EXECUTOR" } },
  });
  if (!executorRole)
    throw new AppError("El usuario seleccionado no es un ejecutor.", 400);
};

const remediationPlanInclude = {
  area: { select: { id: true, name: true } },
  ownerUser: { select: userSelect },
} satisfies Prisma.RemediationPlanInclude;

type RemediationPlanRecord = Prisma.RemediationPlanGetPayload<{
  include: typeof remediationPlanInclude;
}>;

const formatRemediationPlan = (record: RemediationPlanRecord) => ({
  additionalComments: record.additionalComments,
  area: record.area,
  createdAt: record.createdAt.toISOString(),
  id: record.id,
  mitigationText: record.mitigationText,
  observationId: record.observationId,
  ownerUser: record.ownerUser,
  returnReason: record.returnReason,
  status: record.status,
  strategyText: record.strategyText,
  updatedAt: record.updatedAt.toISOString(),
  workflowInstanceId: record.workflowInstanceId,
});

const findRemediationPlan = async (
  id: string,
  access: AuthorizationSummary,
): Promise<RemediationPlanRecord> => {
  const record = await prisma.remediationPlan.findFirst({
    include: remediationPlanInclude,
    where: {
      deletedAt: null,
      id,
      observation: buildObservationScopeWhere(access),
    },
  });
  if (!record)
    throw new AppError("No se encontró el plan de acción recomendado.", 404);
  if (access.dataScope === "AREA") {
    const allowedArea = await prisma.observationArea.findFirst({
      select: { id: true },
      where: {
        observationId: record.observationId,
        areaId: record.area.id,
        ...buildObservationAreaScopeWhere(access),
      },
    });
    if (!allowedArea)
      throw new AppError("No se encontró el plan de acción recomendado.", 404);
  }
  return record;
};

export const recalculateObservationFromActionPlans = async (
  tx: Prisma.TransactionClient,
  observationId: string,
) => {
  const [observation, actionPlans] = await Promise.all([
    tx.observation.findUnique({
      select: { status: { select: { isFinal: true } } },
      where: { id: observationId },
    }),
    tx.actionPlan.findMany({
      select: { progressPercent: true, status: true },
      where: { deletedAt: null, observationId },
    }),
  ]);
  if (!observation) return;
  const progressPercent =
    observationAggregationService.calculateProgress(actionPlans);
  const key = observationAggregationService.calculateStatus(
    actionPlans,
    observation.status.isFinal,
  );
  const status = await tx.observationStatus.findFirst({
    select: { id: true },
    where: { active: true, deletedAt: null, key },
  });
  await tx.observation.update({
    data: {
      progressPercent,
      ...(status ? { statusId: status.id } : {}),
    },
    where: { id: observationId },
  });
};

export const remediationService = {
  async createRemediationPlan(
    observationId: string,
    input: CreateRemediationPlanInput,
    access: AuthorizationSummary,
  ) {
    if (!authorizationService.can(access, "recommended_action_plans.create"))
      throw new AppError(
        "No tiene permiso para crear planes recomendados.",
        403,
      );
    const [observationArea, owner] = await Promise.all([
      prisma.observationArea.findFirst({
        select: { id: true },
        where: {
          areaId: input.areaId,
          observation: {
            deletedAt: null,
            id: observationId,
            ...buildObservationScopeWhere(access),
          },
          ...buildObservationAreaScopeWhere(access),
        },
      }),
      input.ownerUserId
        ? prisma.user.findFirst({
            select: { id: true },
            where: {
              deletedAt: null,
              id: input.ownerUserId,
              isActive: true,
              userRoles: { some: { role: { code: "EXECUTOR" } } },
            },
          })
        : Promise.resolve(null),
    ]);
    if (!observationArea)
      throw new AppError("El área no pertenece a la observación.", 400);
    if (input.ownerUserId && !owner)
      throw new AppError("El responsable no existe o está inactivo.", 400);
    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.remediationPlan.create({
        data: {
          additionalComments: input.additionalComments ?? null,
          areaId: input.areaId,
          createdByUserId: access.userId,
          mitigationText: input.mitigationText ?? null,
          observationId,
          ownerUserId: input.ownerUserId ?? null,
          strategyText: input.strategyText,
        },
        select: { id: true },
      });
      await tx.actionPlan.updateMany({
        data: { remediationPlanId: plan.id },
        where: {
          deletedAt: null,
          observationArea: { areaId: input.areaId },
          observationId,
          remediationPlanId: null,
        },
      });
      return plan;
    });
    return formatRemediationPlan(await findRemediationPlan(created.id, access));
  },

  async listRemediationPlans(
    observationId: string,
    access: AuthorizationSummary,
  ) {
    if (!authorizationService.can(access, "recommended_action_plans.view"))
      throw new AppError("No tiene permiso para ver planes recomendados.", 403);
    const observation = await prisma.observation.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: observationId,
        ...buildObservationScopeWhere(access),
      },
    });
    if (!observation) throw new AppError("No se encontró la observación.", 404);
    const plans = await prisma.remediationPlan.findMany({
      include: remediationPlanInclude,
      orderBy: [{ area: { name: "asc" } }, { createdAt: "asc" }],
      where: buildRemediationPlanScopeWhere(access, observationId),
    });
    return plans.map(formatRemediationPlan);
  },

  async updateRemediationPlan(
    id: string,
    input: UpdateRemediationPlanInput,
    access: AuthorizationSummary,
  ) {
    const canAssignExecutor = authorizationService.can(
      access,
      "action_plans.assign_executor",
    );
    const canEdit = authorizationService.can(
      access,
      "recommended_action_plans.edit",
    );
    if (!canEdit && !canAssignExecutor)
      throw new AppError(
        "No tiene permiso para editar planes recomendados.",
        403,
      );
    const previous = await findRemediationPlan(id, access);
    if (previous.status !== "DRAFT" && previous.status !== "RETURNED")
      throw new AppError("El plan no está disponible para edición.", 409);
    if (!canEdit && Object.keys(input).some((key) => key !== "ownerUserId")) {
      throw new AppError(
        "Solo puede reasignar el ejecutor del plan recomendado.",
        403,
      );
    }
    if (input.ownerUserId) {
      const owner = await prisma.user.findFirst({
        select: { id: true },
        where: {
          deletedAt: null,
          id: input.ownerUserId,
          isActive: true,
          userRoles: { some: { role: { code: "EXECUTOR" } } },
        },
      });
      if (!owner)
        throw new AppError("El responsable no existe o está inactivo.", 400);
    }
    const data: Prisma.RemediationPlanUncheckedUpdateInput = {
      ...(input.additionalComments !== undefined
        ? { additionalComments: input.additionalComments }
        : {}),
      ...(input.mitigationText !== undefined
        ? { mitigationText: input.mitigationText }
        : {}),
      ...(input.ownerUserId !== undefined
        ? { ownerUserId: input.ownerUserId }
        : {}),
      ...(input.strategyText !== undefined
        ? { strategyText: input.strategyText }
        : {}),
      ...(previous.status === "RETURNED"
        ? { returnReason: null, returnedAt: null, returnedByUserId: null }
        : {}),
    };
    await prisma.remediationPlan.update({
      data,
      where: { id },
    });
    return {
      current: formatRemediationPlan(await findRemediationPlan(id, access)),
      previous: formatRemediationPlan(previous),
    };
  },

  async deleteRemediationPlan(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "recommended_action_plans.delete"))
      throw new AppError(
        "No tiene permiso para eliminar planes recomendados.",
        403,
      );
    const previous = await findRemediationPlan(id, access);
    if (previous.status !== "DRAFT" && previous.status !== "RETURNED") {
      throw new AppError("El plan no está disponible para eliminación.", 409);
    }
    const actionPlanCount = await prisma.actionPlan.count({
      where: { deletedAt: null, remediationPlanId: id },
    });
    if (actionPlanCount > 0) {
      throw new AppError(
        "No se puede eliminar un plan recomendado con planes de acción asociados.",
        409,
      );
    }
    await prisma.remediationPlan.update({
      data: { deletedAt: new Date() },
      where: { id },
    });
    return previous;
  },

  async submitRemediationPlan(id: string, access: AuthorizationSummary) {
    if (
      !authorizationService.can(
        access,
        "recommended_action_plans.submit_to_audit",
      )
    )
      throw new AppError(
        "Solo Auditoría puede enviar planes recomendados.",
        403,
      );
    const previous = await findRemediationPlan(id, access);
    if (previous.status !== "DRAFT" && previous.status !== "RETURNED")
      throw new AppError("El plan no está disponible para envío.", 409);
    if (previous.status === "RETURNED" && previous.workflowInstanceId) {
      const priorInstance = await prisma.workflowInstance.findUnique({
        select: { status: true },
        where: { id: previous.workflowInstanceId },
      });
      if (
        priorInstance &&
        ["CANCELLED", "COMPLETED", "REJECTED"].includes(priorInstance.status)
      ) {
        await prisma.remediationPlan.update({
          data: { workflowInstanceId: null },
          where: { id },
        });
      }
    }
    const workflow = await workflowIntegrationService.startForEntity({
      access: { ...access, ipAddress: null },
      actorUserId: access.userId,
      entityId: id,
      entityType: "remediation_plan",
      processType: "REMEDIATION_PLAN_APPROVAL",
    });
    if (!workflow.instanceId)
      throw new AppError(
        "No existe un flujo publicado para aprobar planes de remediación.",
        409,
      );
    await prisma.remediationPlan.update({
      data: {
        sentToAuditAt: new Date(),
        status: "SENT_TO_AUDIT",
        workflowInstanceId: workflow.instanceId,
      },
      where: { id },
    });
    return {
      current: formatRemediationPlan(await findRemediationPlan(id, access)),
      previous: formatRemediationPlan(previous),
    };
  },

  async createActionPlan(
    observationId: string,
    input: CreateActionPlanInput,
    access: AuthorizationSummary,
  ): Promise<ActionPlanDetail> {
    if (!authorizationService.can(access, "action_plans.create"))
      throw new AppError("No tiene permiso para crear planes de acción.", 403);
    const observation = await prisma.observation.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: observationId,
        ...buildObservationScopeWhere(access),
      },
    });
    if (!observation) throw new AppError("No se encontró la observación.", 404);
    await validateDueDate(observationId, input.dueDate);
    if (
      access.dataScope === "ASSIGNED" &&
      input.responsibleUserId !== access.userId
    ) {
      throw new AppError("No puede asignar un plan a otro ejecutor.", 403);
    }
    await validateAssignment(
      observationId,
      input.observationAreaId,
      input.responsibleUserId,
      access,
    );
    const created = await prisma.$transaction(async (tx) => {
      const actionPlan = await tx.actionPlan.create({
        data: {
          currentDueDate: input.dueDate,
          description: input.description,
          observationAreaId: input.observationAreaId,
          observationId,
          originalDueDate: input.dueDate,
          remediationPlanId:
            (
              await tx.remediationPlan.findFirst({
                select: { id: true },
                where: {
                  areaId: (
                    await tx.observationArea.findUniqueOrThrow({
                      select: { areaId: true },
                      where: { id: input.observationAreaId },
                    })
                  ).areaId,
                  deletedAt: null,
                  observationId,
                },
              })
            )?.id ?? null,
          responsibleUserId: input.responsibleUserId,
          sortOrder: input.sortOrder ?? 0,
          // Kept only for backwards compatibility with the current database column.
          title: input.description.slice(0, 191),
        },
        select: { id: true },
      });
      await recalculateObservationFromActionPlans(tx, observationId);
      return actionPlan;
    });
    return format(await find(created.id, access));
  },

  async deleteActionPlan(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "action_plans.delete"))
      throw new AppError(
        "No tiene permiso para eliminar planes de acción.",
        403,
      );
    const previous = await find(id, access);
    if (previous._count.progressEvaluations > 0)
      throw new AppError(
        "No se puede eliminar un plan de acción que ya tiene historial de avance.",
        409,
      );
    await prisma.$transaction(async (tx) => {
      await tx.actionPlan.update({
        data: { deletedAt: new Date() },
        where: { id },
      });
      await recalculateObservationFromActionPlans(tx, previous.observation.id);
    });
    return format(previous);
  },

  async getActionPlanById(id: string, access: AuthorizationSummary) {
    const actionPlan = format(await find(id, access));
    const [evaluations, evidence] = await Promise.all([
      prisma.progressEvaluation.findMany({
        orderBy: { submittedAt: "desc" },
        select: {
          evaluatedStatus: true,
          comment: true,
          id: true,
          reportedProgressPercent: true,
          reviewedAt: true,
          reviewedByUser: { select: userSelect },
          reviewStatus: true,
          submittedAt: true,
          submittedByUser: { select: userSelect },
        },
        where: { actionPlanId: id, deletedAt: null },
      }),
      prisma.evidenceFile.findMany({
        orderBy: { createdAt: "desc" },
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
          uploadedByUser: { select: userSelect },
          workflowInstanceId: true,
        },
        where: { actionPlanId: id, deletedAt: null },
      }),
    ]);
    return {
      ...actionPlan,
      evidence: evidence.map((file) => ({
        ...file,
        createdAt: file.createdAt.toISOString(),
        downloadPath: `/evidences/${file.id}/download`,
        reviewedAt: file.reviewedAt?.toISOString() ?? null,
        sizeBytes: Number(file.sizeBytes),
        submittedAt: file.submittedAt?.toISOString() ?? null,
      })),
      evaluations: evaluations.map((evaluation) => ({
        ...evaluation,
        reviewedAt: evaluation.reviewedAt?.toISOString() ?? null,
        submittedAt: evaluation.submittedAt.toISOString(),
      })),
    };
  },

  async listActionPlans(
    query: ListActionPlansQuery,
    access: AuthorizationSummary,
  ) {
    const now = new Date();
    const where: Prisma.ActionPlanWhereInput = {
      deletedAt: null,
      ...accessWhere(access),
      ...(query.areaId ? { observationArea: { areaId: query.areaId } } : {}),
      ...(query.dueDateFrom || query.dueDateTo
        ? {
            currentDueDate: {
              ...(query.dueDateFrom ? { gte: query.dueDateFrom } : {}),
              ...(query.dueDateTo ? { lte: query.dueDateTo } : {}),
            },
          }
        : {}),
      ...(query.observationId ? { observationId: query.observationId } : {}),
      ...(query.overdue !== undefined
        ? query.overdue
          ? { currentDueDate: { lt: now }, status: { not: "CONCLUDED" } }
          : { OR: [{ currentDueDate: { gte: now } }, { status: "CONCLUDED" }] }
        : {}),
      ...(query.responsibleUserId
        ? { responsibleUserId: query.responsibleUserId }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search } },
              { observation: { title: { contains: query.search } } },
              {
                observation: {
                  auditReport: { reportNumber: { contains: query.search } },
                },
              },
              { responsibleUser: { name: { contains: query.search } } },
              {
                observationArea: { area: { name: { contains: query.search } } },
              },
            ],
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [records, total] = await Promise.all([
      prisma.actionPlan.findMany({
        include,
        orderBy: [
          { [query.sortBy]: query.sortDirection },
          { sortOrder: "asc" },
          { id: "asc" },
        ],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
      prisma.actionPlan.count({ where }),
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

  async markActionPlanComplete(id: string, access: AuthorizationSummary) {
    if (!authorizationService.can(access, "action_plans.evaluate"))
      throw new AppError(
        "No tiene permiso para concluir planes de acción.",
        403,
      );
    const previous = await find(id, access);
    if (previous.progressPercent < 100)
      throw new AppError(
        "El plan de acción debe alcanzar 100% de avance aprobado antes de concluirse.",
        409,
      );
    const approvedEvaluation = await prisma.progressEvaluation.findFirst({
      select: { id: true },
      where: {
        actionPlanId: id,
        deletedAt: null,
        progressPercent: 100,
        reviewStatus: "APPROVED",
      },
    });
    if (!approvedEvaluation)
      throw new AppError(
        "Debe existir una evaluación de avance de 100% aprobada antes de concluir el plan.",
        409,
      );
    await prisma.$transaction(async (tx) => {
      await tx.actionPlan.update({
        data: { completedAt: new Date(), status: "CONCLUDED" },
        where: { id },
      });
      await recalculateObservationFromActionPlans(tx, previous.observation.id);
    });
    return {
      current: format(await find(id, access)),
      previous: format(previous),
    };
  },

  async updateActionPlan(
    id: string,
    input: UpdateActionPlanInput,
    access: AuthorizationSummary,
  ) {
    const previous = await find(id, access);
    const isRecommendedPlan = Boolean(previous.remediationPlanId);
    const canEditRecommendedPlan = authorizationService.can(
      access,
      "recommended_action_plans.edit",
    );
    if (
      input.observationAreaId !== undefined &&
      input.observationAreaId !== previous.observationAreaId
    )
      throw new AppError("El área del plan no puede cambiarse.", 403);
    const hasAssignmentChange = input.responsibleUserId !== undefined;
    const hasContentChange = Object.keys(input).some(
      (key) => !["observationAreaId", "responsibleUserId"].includes(key),
    );
    if (
      hasContentChange &&
      (!authorizationService.can(access, "action_plans.edit") ||
        (isRecommendedPlan && !canEditRecommendedPlan))
    )
      throw new AppError("No tiene permiso para editar este plan.", 403);
    if (
      hasAssignmentChange &&
      !authorizationService.can(access, "action_plans.assign_executor")
    )
      throw new AppError(
        "No tiene permisos para reasignar este plan de acción.",
        403,
      );
    if (
      input.responsibleUserId !== undefined &&
      input.responsibleUserId !== access.userId &&
      access.dataScope === "ASSIGNED"
    ) {
      throw new AppError("No puede cambiar el ejecutor del plan.", 403);
    }
    await validateAssignment(
      previous.observation.id,
      input.observationAreaId ?? previous.observationAreaId,
      input.responsibleUserId ?? previous.responsibleUser.id,
      access,
    );
    const dueDateChanged =
      input.dueDate !== undefined &&
      input.dueDate.toISOString().slice(0, 10) !==
        previous.currentDueDate.toISOString().slice(0, 10);
    if (dueDateChanged && previous._count.progressEvaluations > 0)
      throw new AppError(
        "Después de iniciar la ejecución debe usar una ampliación de plazo para cambiar la fecha límite.",
        409,
      );
    if (dueDateChanged && input.dueDate)
      await validateDueDate(previous.observation.id, input.dueDate);
    await prisma.actionPlan.update({
      data: {
        ...(input.description !== undefined
          ? {
              description: input.description,
              // Kept only for backwards compatibility with the current database column.
              title: input.description.slice(0, 191),
            }
          : {}),
        ...(input.dueDate !== undefined
          ? { currentDueDate: input.dueDate }
          : {}),
        ...(input.observationAreaId !== undefined
          ? { observationAreaId: input.observationAreaId }
          : {}),
        ...(input.responsibleUserId !== undefined
          ? { responsibleUserId: input.responsibleUserId }
          : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
      where: { id },
    });
    return {
      current: format(await find(id, access)),
      previous: format(previous),
    };
  },
};
