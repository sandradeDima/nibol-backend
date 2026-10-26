import type { Prisma } from "../../../generated/prisma/client.js";
import {
  ActionPlanStatus,
  parseDatabaseEnum,
  type ActionPlanStatus as ActionPlanStatusValue,
} from "../../types/database-enums.js";

import {
  authorizationService,
  buildAssignedObservationAreaScopeWhere,
  buildActionPlanScopeWhere,
  buildObservationScopeWhere,
  buildRemediationPlanScopeWhere,
  type AuthorizationSummary,
} from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import {
  lockObservationForActionPlanUpdate,
  recalculateObservationFromActionPlans,
} from "../observations/observation-aggregation.service.js";
import {
  notifyActionPlanAssigned,
  notifyActionPlanExecutorChanged,
} from "./action-plan-notification.service.js";
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
  ActionPlanFilterOptions,
  ActionPlanOptionsQuery,
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

const labels: Record<ActionPlanStatusValue, string> = {
  CONCLUDED: "Concluido",
  NOT_STARTED: "No iniciado",
  STARTED: "Iniciado",
  WITH_PROGRESS: "Con avance",
} as const;

type ActionPlanDeadlineStatus = NonNullable<
  ListActionPlansQuery["deadlineStatus"]
>[number];

const approvedExtensionFilter = {
  deletedAt: null,
  status: "MANAGER_APPROVED" as const,
};

const buildEffectiveDueDateWhere = (
  range: Prisma.DateTimeFilter,
): Prisma.ActionPlanWhereInput => ({
  OR: [
    {
      currentDueDate: range,
      deadlineExtensionRequests: { none: approvedExtensionFilter },
    },
    {
      deadlineExtensionRequests: {
        some: { ...approvedExtensionFilter, proposedDueDate: range },
      },
    },
  ],
});

const buildActionPlanDeadlineWhere = (
  status: ActionPlanDeadlineStatus,
  today: Date,
): Prisma.ActionPlanWhereInput => {
  switch (status) {
    case "REPROGRAMADO":
      return {
        deadlineExtensionRequests: {
          some: {
            deletedAt: null,
            status: "MANAGER_APPROVED",
          },
        },
      };
    case "VENCIDO":
      return {
        ...buildEffectiveDueDateWhere({ lt: today }),
        status: { not: "CONCLUDED" },
      };
    case "VIGENTE":
      return {
        OR: [
          buildEffectiveDueDateWhere({ gte: today }),
          { status: "CONCLUDED" },
        ],
      };
  }
};

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
    status: parseDatabaseEnum(
      ActionPlanStatus,
      record.status,
      "action_plans.status",
    ),
    statusLabel:
      labels[
        parseDatabaseEnum(
          ActionPlanStatus,
          record.status,
          "action_plans.status",
        )
      ],
    updatedAt: record.updatedAt.toISOString(),
  };
};

const assignmentContext = (record: ActionPlanRecord) => ({
  areaResponsibleUserId: record.observationArea.areaResponsible.id,
  executorUserId: record.responsibleUser.id,
  processOwnerUserId: record.observationArea.processOwner.id,
});

const accessWhere = (
  access: AuthorizationSummary,
): Prisma.ActionPlanWhereInput => buildActionPlanScopeWhere(access);

export const buildApprovedCompletionEvaluationWhere = (
  actionPlanId: string,
): Prisma.ProgressEvaluationWhereInput => ({
  actionPlanId,
  deletedAt: null,
  reportedProgressPercent: 100,
  reviewStatus: "APPROVED",
});

const uniqueById = <T extends { id: string }>(items: T[]): T[] => [
  ...new Map(items.map((item) => [item.id, item])).values(),
];

const cancelLinkedWorkflowInstances = async (
  tx: Prisma.TransactionClient,
  workflowInstanceIds: string[],
  cancelledAt: Date,
) => {
  if (workflowInstanceIds.length === 0) return;
  await tx.workflowTimer.updateMany({
    data: { status: "CANCELLED" },
    where: {
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      workflowInstanceId: { in: workflowInstanceIds },
    },
  });
  await tx.workflowTask.updateMany({
    data: { completedAt: cancelledAt, status: "CANCELLED" },
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      workflowInstanceId: { in: workflowInstanceIds },
    },
  });
  await tx.workflowInstance.updateMany({
    data: {
      completedAt: cancelledAt,
      finalResult: "CANCELLED",
      lastExecutionAt: cancelledAt,
      status: "CANCELLED",
    },
    where: {
      id: { in: workflowInstanceIds },
      status: { in: ["PENDING", "ACTIVE", "WAITING", "FAILED"] },
    },
  });
};

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
      select: {
        areaResponsibleUserId: true,
        id: true,
        processOwnerUserId: true,
      },
      where: {
        id: observationAreaId,
        observationId,
        ...buildAssignedObservationAreaScopeWhere(access),
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
  return observationArea;
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
        ...buildAssignedObservationAreaScopeWhere(access),
      },
    });
    if (!allowedArea)
      throw new AppError("No se encontró el plan de acción recomendado.", 404);
  }
  return record;
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
          ...buildAssignedObservationAreaScopeWhere(access),
        },
      }),
      input.ownerUserId
        ? prisma.user.findFirst({
            select: { id: true },
            where: {
              deletedAt: null,
              id: input.ownerUserId,
              isActive: true,
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
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      if (previous.workflowInstanceId) {
        await cancelLinkedWorkflowInstances(
          tx,
          [previous.workflowInstanceId],
          deletedAt,
        );
      }
      const deleted = await tx.remediationPlan.updateMany({
        data: { deletedAt, deletedById: access.userId },
        where: { deletedAt: null, id },
      });
      if (deleted.count !== 1)
        throw new AppError("El plan recomendado ya no está disponible.", 409);
      await tx.notification.updateMany({
        data: { deletedAt },
        where: {
          deletedAt: null,
          entityId: id,
          entityType: { in: ["REMEDIATION_PLAN", "remediation_plan"] },
        },
      });
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
    const areaAssignment = await validateAssignment(
      observationId,
      input.observationAreaId,
      input.responsibleUserId,
      access,
    );
    const assignments = {
      areaResponsibleUserId: areaAssignment.areaResponsibleUserId,
      processOwnerUserId: areaAssignment.processOwnerUserId,
    };
    if (
      !(await authorizationService.canForAssignments(
        access,
        "action_plans.create",
        assignments,
      ))
    )
      throw new AppError("No tiene permiso para crear planes de acción.", 403);
    if (
      input.responsibleUserId !== access.userId &&
      !(await authorizationService.canForAssignments(
        access,
        "action_plans.assign_executor",
        assignments,
        false,
      ))
    )
      throw new AppError("No puede asignar un plan a otro ejecutor.", 403);
    const created = await prisma.$transaction(async (tx) => {
      await lockObservationForActionPlanUpdate(tx, observationId);
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
    const actionPlan = await find(created.id, access);
    await notifyActionPlanAssigned({
      dedupeKey: `action-plan-created-after-observation:${actionPlan.id}`,
      entityId: actionPlan.id,
      entityType: "ACTION_PLAN",
      eventType: "ACTION_PLAN_CREATED_AFTER_OBSERVATION",
      observationDisplayCode: `${actionPlan.observation.auditReport.reportNumber} / OBS-${String(actionPlan.observation.observationNumber).padStart(3, "0")}`,
      observationId: actionPlan.observation.id,
      observationTitle: actionPlan.observation.title,
      planDescription: actionPlan.description,
      userId: actionPlan.responsibleUser.id,
    });
    return format(actionPlan);
  },

  async deleteActionPlan(id: string, access: AuthorizationSummary) {
    const previous = await find(id, access);
    if (
      !(await authorizationService.canForAssignments(
        access,
        "action_plans.delete",
        assignmentContext(previous),
        false,
      ))
    )
      throw new AppError(
        "No tiene permiso para eliminar planes de acción.",
        403,
      );
    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const [evaluations, evidence, extensions] = await Promise.all([
        tx.progressEvaluation.findMany({
          select: { workflowInstanceId: true },
          where: { actionPlanId: id, workflowInstanceId: { not: null } },
        }),
        tx.evidenceFile.findMany({
          select: { workflowInstanceId: true },
          where: { actionPlanId: id, workflowInstanceId: { not: null } },
        }),
        tx.deadlineExtensionRequest.findMany({
          select: { workflowInstanceId: true },
          where: { actionPlanId: id, workflowInstanceId: { not: null } },
        }),
      ]);
      const workflowInstanceIds = [
        ...new Set(
          [...evaluations, ...evidence, ...extensions]
            .map((record) => record.workflowInstanceId)
            .filter((workflowInstanceId): workflowInstanceId is string =>
              Boolean(workflowInstanceId),
            ),
        ),
      ];
      await cancelLinkedWorkflowInstances(tx, workflowInstanceIds, deletedAt);
      await lockObservationForActionPlanUpdate(tx, previous.observation.id);
      const deleted = await tx.actionPlan.updateMany({
        data: { deletedAt, deletedById: access.userId },
        where: { deletedAt: null, id },
      });
      if (deleted.count !== 1)
        throw new AppError("El plan de acción ya no está disponible.", 409);
      await tx.notification.updateMany({
        data: { deletedAt },
        where: {
          deletedAt: null,
          entityId: id,
          entityType: { in: ["ACTION_PLAN", "actionPlan"] },
        },
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

  async getActionPlanOptions(
    query: ActionPlanOptionsQuery,
    access: AuthorizationSummary,
  ): Promise<ActionPlanFilterOptions> {
    if (query.observationId) {
      const observation = await prisma.observation.findFirst({
        select: { id: true },
        where: {
          id: query.observationId,
          ...buildObservationScopeWhere(access),
        },
      });
      if (!observation)
        throw new AppError("No se encontró la observación.", 404);
    }
    if (query.observationAreaId) {
      const observationArea = await prisma.observationArea.findFirst({
        select: { id: true },
        where: {
          id: query.observationAreaId,
          ...(query.observationId
            ? { observationId: query.observationId }
            : {}),
          ...buildAssignedObservationAreaScopeWhere(access),
        },
      });
      if (!observationArea)
        throw new AppError("El área no pertenece a la observación.", 404);
    }

    const optionWhere: Prisma.ActionPlanWhereInput[] = [accessWhere(access)];
    if (query.observationAreaId)
      optionWhere.push({ observationAreaId: query.observationAreaId });
    if (query.observationId)
      optionWhere.push({ observationId: query.observationId });
    if (
      query.areaId?.length ||
      query.areaResponsibleUserId?.length ||
      query.processOwnerUserId?.length
    ) {
      optionWhere.push({
        observationArea: {
          ...(query.areaId?.length ? { areaId: { in: query.areaId } } : {}),
          ...(query.areaResponsibleUserId?.length
            ? { areaResponsibleUserId: { in: query.areaResponsibleUserId } }
            : {}),
          ...(query.processOwnerUserId?.length
            ? { processOwnerUserId: { in: query.processOwnerUserId } }
            : {}),
        },
      });
    }

    const [records, riskLevels] = await Promise.all([
      prisma.actionPlan.findMany({
        select: {
          observationArea: {
            select: {
              area: { select: { id: true, name: true } },
              areaResponsible: { select: userSelect },
              processOwner: { select: userSelect },
            },
          },
          responsibleUser: { select: userSelect },
        },
        where: { AND: optionWhere, deletedAt: null },
      }),
      prisma.riskLevel.findMany({
        orderBy: { severityOrder: "asc" },
        select: { id: true, name: true },
        where: { active: true, deletedAt: null },
      }),
    ]);
    const executorWhere: Prisma.UserWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(access.dataScope === "ASSIGNED" ? { id: access.userId } : {}),
    };
    const executorCandidates =
      query.observationId || query.observationAreaId
        ? await prisma.user.findMany({
            orderBy: { name: "asc" },
            select: userSelect,
            where: executorWhere,
          })
        : [];

    return {
      areaResponsibles: uniqueById(
        records.map((record) => record.observationArea.areaResponsible),
      ),
      areas: uniqueById(records.map((record) => record.observationArea.area)),
      executorCandidates,
      executors:
        query.observationId || query.observationAreaId
          ? executorCandidates
          : uniqueById(records.map((record) => record.responsibleUser)),
      processOwners: uniqueById(
        records.map((record) => record.observationArea.processOwner),
      ),
      riskLevels,
    };
  },

  async listActionPlans(
    query: ListActionPlansQuery,
    access: AuthorizationSummary,
  ) {
    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    const progressStatuses = query.progressStatus?.length
      ? query.progressStatus
      : (query.status ?? []);
    const where: Prisma.ActionPlanWhereInput = {
      AND: [
        accessWhere(access),
        ...(query.deadlineStatus?.length
          ? [
              {
                OR: query.deadlineStatus.map((status) =>
                  buildActionPlanDeadlineWhere(status, today),
                ),
              },
            ]
          : []),
        ...(query.overdue !== undefined
          ? [
              query.overdue
                ? {
                    ...buildEffectiveDueDateWhere({ lt: today }),
                    status: { not: "CONCLUDED" as const },
                  }
                : {
                    OR: [
                      buildEffectiveDueDateWhere({ gte: today }),
                      { status: "CONCLUDED" as const },
                    ],
                  },
            ]
          : []),
        ...(query.dueDateFrom || query.dueDateTo
          ? [
              buildEffectiveDueDateWhere({
                ...(query.dueDateFrom ? { gte: query.dueDateFrom } : {}),
                ...(query.dueDateTo ? { lte: query.dueDateTo } : {}),
              }),
            ]
          : []),
        ...(query.areaId?.length ||
        query.areaResponsibleUserId?.length ||
        query.processOwnerUserId?.length
          ? [
              {
                observationArea: {
                  ...(query.areaId?.length
                    ? { areaId: { in: query.areaId } }
                    : {}),
                  ...(query.areaResponsibleUserId?.length
                    ? {
                        areaResponsibleUserId: {
                          in: query.areaResponsibleUserId,
                        },
                      }
                    : {}),
                  ...(query.processOwnerUserId?.length
                    ? {
                        processOwnerUserId: {
                          in: query.processOwnerUserId,
                        },
                      }
                    : {}),
                },
              },
            ]
          : []),
        ...(query.observationId?.length
          ? [{ observationId: { in: query.observationId } }]
          : []),
        ...(progressStatuses.length
          ? [{ status: { in: progressStatuses } }]
          : []),
        ...(query.reportNumber
          ? [
              {
                observation: {
                  auditReport: {
                    reportNumber: { contains: query.reportNumber },
                  },
                },
              },
            ]
          : []),
        ...(query.riskLevelId?.length
          ? [{ observation: { riskLevelId: { in: query.riskLevelId } } }]
          : []),
        ...(query.responsibleUserId?.length
          ? [{ responsibleUserId: { in: query.responsibleUserId } }]
          : []),
        ...(query.search
          ? [
              {
                OR: [
                  { title: { contains: query.search } },
                  { description: { contains: query.search } },
                  { observation: { title: { contains: query.search } } },
                  {
                    observation: {
                      auditReport: {
                        reportNumber: { contains: query.search },
                      },
                    },
                  },
                  { responsibleUser: { name: { contains: query.search } } },
                  {
                    observationArea: {
                      area: { name: { contains: query.search } },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
      deletedAt: null,
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
      where: buildApprovedCompletionEvaluationWhere(id),
    });
    if (!approvedEvaluation)
      throw new AppError(
        "Debe existir una evaluación de avance de 100% aprobada antes de concluir el plan.",
        409,
      );
    const pendingEvaluation = await prisma.progressEvaluation.findFirst({
      select: { id: true },
      where: {
        actionPlanId: id,
        deletedAt: null,
        reviewStatus: "SENT_TO_AUDIT",
      },
    });
    if (pendingEvaluation)
      throw new AppError(
        "No se puede concluir un plan con un avance pendiente de revisión.",
        409,
      );
    await prisma.$transaction(async (tx) => {
      await lockObservationForActionPlanUpdate(tx, previous.observation.id);
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
    const assignments = assignmentContext(previous);
    const canEditRecommendedPlan = await authorizationService.canForAssignments(
      access,
      "recommended_action_plans.edit",
      assignments,
    );
    if (
      input.observationAreaId !== undefined &&
      input.observationAreaId !== previous.observationAreaId
    )
      throw new AppError("El área del plan no puede cambiarse.", 403);
    const hasAssignmentChange =
      input.responsibleUserId !== undefined &&
      input.responsibleUserId !== previous.responsibleUser.id;
    const hasContentChange = Object.keys(input).some(
      (key) => !["observationAreaId", "responsibleUserId"].includes(key),
    );
    if (
      hasContentChange &&
      (!(await authorizationService.canForAssignments(
        access,
        "action_plans.edit",
        assignments,
      )) ||
        (isRecommendedPlan && !canEditRecommendedPlan))
    )
      throw new AppError("No tiene permiso para editar este plan.", 403);
    if (
      hasAssignmentChange &&
      !(await authorizationService.canForAssignments(
        access,
        "action_plans.assign_executor",
        assignments,
        false,
      ))
    )
      throw new AppError(
        "No tiene permisos para reasignar este plan de acción.",
        403,
      );
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
    const current = await find(id, access);
    if (
      hasAssignmentChange &&
      current.responsibleUser.id !== previous.responsibleUser.id
    ) {
      const observationDisplayCode = `${previous.observation.auditReport.reportNumber} / OBS-${String(previous.observation.observationNumber).padStart(3, "0")}`;
      await notifyActionPlanExecutorChanged({
        actionPlanId: id,
        newExecutor: current.responsibleUser,
        observationDisplayCode,
        observationId: previous.observation.id,
        observationTitle: previous.observation.title,
        planDescription: current.description,
        previousExecutor: previous.responsibleUser,
      });
    }
    return {
      current: format(current),
      previous: format(previous),
    };
  },
};
