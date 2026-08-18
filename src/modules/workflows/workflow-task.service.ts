import type { Prisma } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import type { WorkflowActorContext } from "./workflows.types.js";
import {
  getEvidenceReviewRuntimeSummary,
  getSpecialRequestRuntimeSummary,
  restoreWorkflowRuntimeContext,
  type WorkflowRuntimeContext,
} from "./workflow-runtime-context.js";
import {
  writeRuntimeAuditEvent,
  writeRuntimeTransitionLog,
} from "./workflow-runtime-events.js";
import { loadPinnedWorkflowGraph } from "./workflow-runtime-graph.js";
import {
  WORKFLOW_RUNTIME_ERROR_CODES,
  WorkflowRuntimeError,
} from "./workflow-runtime-errors.js";
import {
  executeAutomaticNodes,
  type RuntimeDatabase,
} from "./workflow-runtime.service.js";
import { getWorkflowEntityAdapter } from "./workflow-entity-adapters.js";
import {
  createWorkflowDecisionNotification,
  deliverWorkflowNotificationsForInstance,
} from "./workflow-notification.service.js";
import { cancelWorkflowTaskTimers } from "./workflow-timer.service.js";
import { WORKFLOW_DEFAULT_DUE_SOON_HOURS } from "./workflows.constants.js";
import { getWorkflowSlaState } from "./workflow-sla.js";
import { selectRuntimeTransition } from "./workflow-transition-resolver.js";
import {
  workflowTaskActionPermissions,
  type WorkflowTaskActionInput,
  type WorkflowTaskListQuery,
  type WorkflowTaskReassignInput,
} from "./workflow-runtime.validators.js";
import { workflowNodeConfigurationSchema } from "./workflows.validators.js";

type TaskAction = keyof typeof workflowTaskActionPermissions;

const asJson = (value: unknown): Prisma.InputJsonValue =>
  (value as Prisma.InputJsonValue) ?? {};

const assertPermission = (access: WorkflowActorContext, permission: string) => {
  if (!access.permissions.includes(permission)) {
    throw new AppError(`Falta el permiso requerido: ${permission}.`, 403);
  }
};

const taskIsActionable = (status: string): boolean =>
  status === "PENDING" || status === "IN_PROGRESS";

const taskAuthorizationWhere = (userId: string) => ({
  OR: [
    { assignedUserId: userId },
    { assignedRole: { userRoles: { some: { userId } } } },
    { assignedArea: { managerUserId: userId } },
  ],
});

const isTaskActor = async (
  db: RuntimeDatabase,
  task: {
    assignedAreaId: string | null;
    assignedRoleId: string | null;
    assignedUserId: string | null;
  },
  userId: string,
): Promise<boolean> => {
  if (task.assignedUserId === userId) return true;
  if (task.assignedRoleId) {
    const roleMembership = await db.userRole.findFirst({
      select: { id: true },
      where: { roleId: task.assignedRoleId, userId },
    });
    if (roleMembership) return true;
  }
  if (task.assignedAreaId) {
    const managedArea = await db.area.findFirst({
      select: { id: true },
      where: { id: task.assignedAreaId, managerUserId: userId },
    });
    if (managedArea) return true;
  }
  return false;
};

const getTaskRecord = async (db: RuntimeDatabase, taskId: string) =>
  db.workflowTask.findUnique({
    include: {
      assignedArea: { select: { id: true, name: true } },
      assignedRole: { select: { id: true, name: true } },
      assignedUser: { select: { email: true, id: true, name: true } },
      instance: {
        include: {
          definition: {
            select: { id: true, name: true, processType: true, status: true },
          },
          startedBy: { select: { email: true, id: true, name: true } },
          version: { select: { id: true, status: true, versionNumber: true } },
        },
      },
      node: true,
      timers: true,
    },
    where: { id: taskId },
  });

const getNodeConfiguration = (configurationJson: unknown) => {
  const parsed = workflowNodeConfigurationSchema.safeParse(configurationJson);
  if (!parsed.success) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      "La configuración publicada de la tarea no es válida.",
    );
  }
  return parsed.data;
};

const getTaskDueState = (
  dueAt: Date | null,
  timers: Array<{
    executeAt: Date;
    status: string;
    timerType: string;
  }>,
): "DUE_SOON" | "NO_SLA" | "ON_TIME" | "OVERDUE" => {
  const now = new Date();
  const reminderAt = timers.find(
    (timer) => timer.timerType === "REMINDER" && timer.status !== "CANCELLED",
  )?.executeAt;
  return getWorkflowSlaState({
    dueAt,
    dueSoonAt:
      reminderAt ??
      new Date(now.getTime() + WORKFLOW_DEFAULT_DUE_SOON_HOURS * 3_600_000),
    now,
  });
};

const actionStatus: Record<
  TaskAction,
  "APPROVED" | "OBSERVED" | "REJECTED" | "CORRECTION_REQUESTED"
> = {
  APPROVE: "APPROVED",
  COMPLETE: "APPROVED",
  OBSERVE: "OBSERVED",
  REJECT: "REJECTED",
  REQUEST_CORRECTION: "CORRECTION_REQUESTED",
};

const getAllowedActions = (
  configuration: ReturnType<typeof getNodeConfiguration>,
) =>
  configuration.nodeType === "STAGE" || configuration.nodeType === "APPROVAL"
    ? configuration.allowedActions
    : [];

const assertActionRequirements = ({
  action,
  comment,
  configuration,
  context,
  evidenceReferences,
}: {
  action: TaskAction;
  comment?: string;
  configuration: ReturnType<typeof getNodeConfiguration>;
  context: WorkflowRuntimeContext;
  evidenceReferences?: string[];
}) => {
  if (
    configuration.nodeType !== "STAGE" &&
    configuration.nodeType !== "APPROVAL"
  ) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED,
      "Esta tarea no corresponde a una etapa humana.",
    );
  }
  if (!configuration.allowedActions.includes(action as never)) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED,
      `La acción ${action} no está disponible para esta tarea.`,
    );
  }
  const commentRequired =
    configuration.nodeType === "STAGE"
      ? configuration.requiredComment
      : configuration.commentRequired;
  const evidenceRequired =
    configuration.nodeType === "STAGE"
      ? configuration.requiredEvidence
      : configuration.evidenceRequired;
  if (commentRequired && !comment?.trim()) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED,
      "Debe ingresar un comentario para completar esta acción.",
      400,
    );
  }
  if (
    evidenceRequired &&
    context.hasEvidence !== true &&
    !(context.evidenceCount && context.evidenceCount > 0) &&
    !(evidenceReferences && evidenceReferences.length > 0)
  ) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED,
      "Esta acción requiere evidencia disponible en el contexto o referencias controladas.",
      400,
    );
  }
};

const mapTask = (
  task: Awaited<ReturnType<typeof getTaskRecord>>,
  access: WorkflowActorContext,
  canAct: boolean,
) => {
  if (!task) return null;
  const configuration = getNodeConfiguration(task.node.configurationJson);
  const allowedActions = getAllowedActions(configuration);
  const context = restoreWorkflowRuntimeContext(
    task.instance.processType,
    task.instance.contextJson,
  );
  const relatedRecordUrl = getWorkflowEntityAdapter(
    task.instance.processType,
  )?.getEntityLink?.(task.instance.entityId, context);
  return {
    assignedArea: task.assignedArea,
    assignedRole: task.assignedRole,
    assignedUser: task.assignedUser,
    assignmentSnapshot: task.assignmentSnapshotJson,
    canAct,
    comments: task.comments,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    decision: task.decision,
    dueAt: task.dueAt?.toISOString() ?? null,
    dueState: getTaskDueState(task.dueAt, task.timers),
    entrySequence: task.entrySequence,
    evidenceReferences: task.evidenceReferencesJson,
    id: task.id,
    instance: {
      entityId: task.instance.entityId,
      entityType: task.instance.entityType,
      evidenceReview: getEvidenceReviewRuntimeSummary(context),
      id: task.instance.id,
      processType: task.instance.processType,
      relatedRecordUrl: relatedRecordUrl ?? null,
      specialRequest: getSpecialRequestRuntimeSummary(context),
      startedAt: task.instance.startedAt.toISOString(),
      startedBy: task.instance.startedBy,
      status: task.instance.status,
      version: task.instance.version,
      workflow: task.instance.definition,
    },
    node: {
      configuration,
      id: task.node.id,
      name: task.node.name,
      nodeKey: task.node.nodeKey,
      type: task.node.type,
    },
    status: task.status,
    allowedActions: [
      ...allowedActions,
      ...(access.permissions.includes("workflow_tasks.reassign") &&
      taskIsActionable(task.status)
        ? ["REASSIGN"]
        : []),
    ],
  };
};

const buildTaskWhere = (
  userId: string,
  query: WorkflowTaskListQuery,
): Prisma.WorkflowTaskWhereInput => {
  const now = new Date();
  const defaultDueSoonAt = new Date(
    now.getTime() + WORKFLOW_DEFAULT_DUE_SOON_HOURS * 3_600_000,
  );
  const activeReminder = {
    status: { not: "CANCELLED" as const },
    timerType: "REMINDER" as const,
  };
  const dueStateWhere: Prisma.WorkflowTaskWhereInput =
    query.dueState === "OVERDUE"
      ? { dueAt: { lt: now } }
      : query.dueState === "DUE_SOON"
        ? {
            AND: [
              { dueAt: { gte: now } },
              {
                OR: [
                  {
                    timers: {
                      some: {
                        ...activeReminder,
                        executeAt: { lte: now },
                      },
                    },
                  },
                  {
                    dueAt: { lte: defaultDueSoonAt },
                    timers: { none: activeReminder },
                  },
                ],
              },
            ],
          }
        : query.dueState === "ON_TIME"
          ? {
              AND: [
                { dueAt: { gt: now } },
                {
                  OR: [
                    {
                      dueAt: { gt: defaultDueSoonAt },
                      timers: { none: activeReminder },
                    },
                    {
                      timers: {
                        some: {
                          ...activeReminder,
                          executeAt: { gt: now },
                        },
                      },
                    },
                  ],
                },
              ],
            }
          : query.dueState === "NO_SLA" || query.dueState === "NO_DUE"
            ? { dueAt: null }
            : {};
  const searchFilter = query.search
    ? {
        OR: [
          { instance: { entityId: { contains: query.search } } },
          { instance: { definition: { name: { contains: query.search } } } },
          { instance: { startedBy: { name: { contains: query.search } } } },
          { node: { name: { contains: query.search } } },
        ],
      }
    : null;

  return {
    AND: [
      taskAuthorizationWhere(userId),
      ...(searchFilter ? [searchFilter] : []),
    ],
    ...dueStateWhere,
    ...(query.dateFrom || query.dateTo
      ? {
          createdAt: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        }
      : {}),
    ...(query.nodeId ? { nodeId: query.nodeId } : {}),
    ...(query.processType || query.workflowDefinitionId
      ? {
          instance: {
            ...(query.processType ? { processType: query.processType } : {}),
            ...(query.workflowDefinitionId
              ? { workflowDefinitionId: query.workflowDefinitionId }
              : {}),
          },
        }
      : {}),
    status: { in: ["PENDING", "IN_PROGRESS"] },
  };
};

const sortOrder = (
  query: WorkflowTaskListQuery,
): Prisma.WorkflowTaskOrderByWithRelationInput[] => {
  const direction = query.sortDirection;
  switch (query.sortBy) {
    case "dueAt":
      return [{ dueAt: direction }, { createdAt: direction }];
    case "processType":
      return [
        { instance: { processType: direction } },
        { createdAt: direction },
      ];
    case "workflow":
      return [
        { instance: { definition: { name: direction } } },
        { createdAt: direction },
      ];
    case "createdAt":
    default:
      return [{ createdAt: direction }, { id: direction }];
  }
};

export const workflowTaskService = {
  async listMyPending(
    query: WorkflowTaskListQuery,
    access: WorkflowActorContext,
  ) {
    assertPermission(access, "workflow_tasks.view");
    const where = buildTaskWhere(access.userId, query);
    const [total, tasks] = await prisma.$transaction([
      prisma.workflowTask.count({ where }),
      prisma.workflowTask.findMany({
        include: {
          assignedArea: { select: { id: true, name: true } },
          assignedRole: { select: { id: true, name: true } },
          assignedUser: { select: { email: true, id: true, name: true } },
          instance: {
            include: {
              definition: {
                select: { id: true, name: true, processType: true },
              },
              startedBy: { select: { email: true, id: true, name: true } },
              version: {
                select: { id: true, status: true, versionNumber: true },
              },
            },
          },
          timers: {
            select: { executeAt: true, status: true, timerType: true },
          },
          node: true,
        },
        orderBy: sortOrder(query),
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: tasks.map((task) => {
        const configuration = getNodeConfiguration(task.node.configurationJson);
        const context = restoreWorkflowRuntimeContext(
          task.instance.processType,
          task.instance.contextJson,
        );
        const assignment = task.assignmentSnapshotJson;
        const assignmentRecord =
          assignment &&
          typeof assignment === "object" &&
          !Array.isArray(assignment)
            ? (assignment as { strategy?: unknown })
            : null;
        return {
          assignedArea: task.assignedArea,
          assignedRole: task.assignedRole,
          assignedUser: task.assignedUser,
          assignmentStrategy:
            typeof assignmentRecord?.strategy === "string"
              ? assignmentRecord.strategy
              : "—",
          createdAt: task.createdAt.toISOString(),
          dueAt: task.dueAt?.toISOString() ?? null,
          dueState: getTaskDueState(task.dueAt, task.timers),
          entrySequence: task.entrySequence,
          id: task.id,
          instance: {
            entityId: task.instance.entityId,
            entityType: task.instance.entityType,
            evidenceReview: getEvidenceReviewRuntimeSummary(context),
            id: task.instance.id,
            processType: task.instance.processType,
            relatedRecordUrl:
              getWorkflowEntityAdapter(
                task.instance.processType,
              )?.getEntityLink?.(task.instance.entityId, context) ?? null,
            specialRequest: getSpecialRequestRuntimeSummary(context),
            startedBy: task.instance.startedBy,
            version: task.instance.version,
            workflow: task.instance.definition,
          },
          node: {
            id: task.node.id,
            name: task.node.name,
            nodeKey: task.node.nodeKey,
            type: task.node.type,
          },
          priority: null,
          status: task.status,
          allowedActions:
            configuration.nodeType === "STAGE" ||
            configuration.nodeType === "APPROVAL"
              ? configuration.allowedActions
              : [],
        };
      }),
      pagination: { page: query.page, perPage: query.perPage, total },
    };
  },

  async getTask(taskId: string, access: WorkflowActorContext) {
    assertPermission(access, "workflow_tasks.view");
    const task = await getTaskRecord(prisma, taskId);
    if (!task) throw new AppError("No se encontró la tarea solicitada.", 404);
    const canAct = taskIsActionable(task.status)
      ? await isTaskActor(prisma, task, access.userId)
      : false;
    return mapTask(task, access, canAct);
  },

  async actOnTask(
    taskId: string,
    action: TaskAction,
    input: WorkflowTaskActionInput,
    access: WorkflowActorContext,
  ) {
    assertPermission(access, workflowTaskActionPermissions[action]);
    const result = await prisma.$transaction(async (db) => {
      const task = await getTaskRecord(db, taskId);
      if (!task) throw new AppError("No se encontró la tarea solicitada.", 404);
      if (!taskIsActionable(task.status)) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.TASK_ALREADY_COMPLETED,
          "La tarea ya fue atendida y no admite otra decisión.",
          409,
        );
      }
      if (!["ACTIVE", "WAITING"].includes(task.instance.status)) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.INSTANCE_NOT_ACTIONABLE,
          "La instancia ya no está disponible para decisiones.",
        );
      }
      if (!(await isTaskActor(db, task, access.userId))) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.TASK_UNAUTHORIZED,
          "No está autorizado para actuar sobre esta tarea.",
          403,
        );
      }

      const graph = await loadPinnedWorkflowGraph(
        db,
        task.instance.workflowVersionId,
      );
      const node = graph.nodes.find(
        (candidate) => candidate.id === task.nodeId,
      );
      if (!node) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
          "La tarea apunta a un nodo que no existe en la versión fijada.",
        );
      }
      const configuration = getNodeConfiguration(node.configurationJson);
      const context = restoreWorkflowRuntimeContext(
        task.instance.processType,
        task.instance.contextJson,
      );
      assertActionRequirements({
        action,
        configuration,
        context,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.evidenceReferences
          ? { evidenceReferences: input.evidenceReferences }
          : {}),
      });
      const adapter = getWorkflowEntityAdapter(task.instance.processType);
      if (adapter?.validateTaskAction) {
        await adapter.validateTaskAction({
          action,
          actorUserId: access.userId,
          db,
          entityId: task.instance.entityId,
          node: configuration,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        });
      }
      const nextContext: WorkflowRuntimeContext = {
        ...context,
        currentNodeKey: null,
        previousDecision: action,
      };
      const selection = selectRuntimeTransition({
        context: nextContext,
        decision: action,
        graph,
        node,
        now: new Date(),
      });
      if (!selection.selected) {
        throw new WorkflowRuntimeError(
          (selection.errorCode as (typeof WORKFLOW_RUNTIME_ERROR_CODES)[keyof typeof WORKFLOW_RUNTIME_ERROR_CODES]) ??
            WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND,
          selection.errorMessage ?? "No se encontró una ruta para la decisión.",
        );
      }
      const targetNode = graph.nodes.find(
        (candidate) => candidate.id === selection.selected?.targetNodeId,
      );
      if (!targetNode) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND,
          "La decisión apunta a un nodo inexistente.",
        );
      }
      nextContext.currentNodeKey = targetNode.nodeKey;
      const now = new Date();
      const claimed = await db.workflowTask.updateMany({
        data: {
          ...(input.comment !== undefined
            ? { comments: input.comment.trim() || null }
            : {}),
          completedAt: now,
          decision: action,
          ...(input.evidenceReferences
            ? { evidenceReferencesJson: asJson(input.evidenceReferences) }
            : {}),
          status: actionStatus[action],
        },
        where: {
          id: taskId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });
      if (claimed.count !== 1) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.TASK_ALREADY_COMPLETED,
          "La tarea ya fue atendida por otra solicitud.",
          409,
        );
      }
      await db.workflowInstance.update({
        data: {
          contextJson: asJson(nextContext),
          currentNodeId: targetNode.id,
          lastExecutionAt: now,
          status: "ACTIVE",
        },
        where: { id: task.instance.id },
      });
      await writeRuntimeTransitionLog({
        context: nextContext,
        db,
        decision: action,
        details: {
          conditionEvaluations: [],
          entrySequence: task.entrySequence,
          usedFallback: selection.usedFallback,
        },
        eventType: "TASK_DECISION",
        instanceId: task.instance.id,
        performedById: access.userId,
        sourceNodeId: node.id,
        targetNodeId: targetNode.id,
        triggerType: "HUMAN_DECISION",
      });
      const auditAction: Record<TaskAction, string> = {
        APPROVE: "workflow.task.approved",
        COMPLETE: "workflow.task.completed",
        OBSERVE: "workflow.task.observed",
        REJECT: "workflow.task.rejected",
        REQUEST_CORRECTION: "workflow.task.correction_requested",
      };
      await writeRuntimeAuditEvent({
        action: auditAction[action],
        actor: { ipAddress: access.ipAddress ?? null, userId: access.userId },
        db,
        entityId: taskId,
        entityType: "workflow_task",
        metadata: {
          decision: action,
          entrySequence: task.entrySequence,
          instanceId: task.instance.id,
          nodeKey: node.nodeKey,
        },
        newValues: {
          completedAt: now.toISOString(),
          decision: action,
          status: actionStatus[action],
        },
        oldValues: { status: task.status },
      });
      if (adapter?.applyDecision) {
        await adapter.applyDecision({
          action,
          actorUserId: access.userId,
          db,
          entityId: task.instance.entityId,
          instanceId: task.instance.id,
          node: configuration,
          taskId,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
        });
      }
      const decisionNotification = await createWorkflowDecisionNotification({
        action,
        actorUserId: access.userId,
        context: nextContext,
        db,
        instanceId: task.instance.id,
        task: {
          id: task.id,
          nodeName: node.name,
          visitSequence: task.entrySequence,
        },
      });
      if (decisionNotification.recipientCount > 0) {
        await writeRuntimeTransitionLog({
          context: nextContext,
          db,
          details: {
            action,
            createdDeliveries: decisionNotification.createdDeliveries.length,
            recipientCount: decisionNotification.recipientCount,
            taskId: task.id,
          },
          eventType: "NOTIFICATION_CREATED",
          instanceId: task.instance.id,
          sourceNodeId: node.id,
          targetNodeId: node.id,
          triggerType: "TASK_DECISION",
        });
      }
      await cancelWorkflowTaskTimers(db, taskId);
      await executeAutomaticNodes({
        actor: { ipAddress: access.ipAddress ?? null, userId: access.userId },
        db,
        instanceId: task.instance.id,
        now,
      });
      const refreshed = await getTaskRecord(db, taskId);
      if (!refreshed)
        throw new AppError("No se encontró la tarea actualizada.", 404);
      return {
        instanceId: task.instance.id,
        task: mapTask(refreshed, access, false),
      };
    });
    await deliverWorkflowNotificationsForInstance(result.instanceId);
    return result.task;
  },

  async reassignTask(
    taskId: string,
    input: WorkflowTaskReassignInput,
    access: WorkflowActorContext,
  ) {
    assertPermission(access, "workflow_tasks.reassign");
    return prisma.$transaction(async (db) => {
      const task = await getTaskRecord(db, taskId);
      if (!task) throw new AppError("No se encontró la tarea solicitada.", 404);
      if (!taskIsActionable(task.status)) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.TASK_ALREADY_COMPLETED,
          "Solo se pueden reasignar tareas activas.",
        );
      }
      const configuration = getNodeConfiguration(task.node.configurationJson);
      if (
        configuration.nodeType !== "STAGE" &&
        configuration.nodeType !== "APPROVAL"
      ) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED,
          "Solo se pueden reasignar tareas humanas.",
        );
      }
      if (input.assignedUserId) {
        const user = await db.user.findFirst({
          select: { id: true },
          where: { deletedAt: null, id: input.assignedUserId, isActive: true },
        });
        if (!user)
          throw new AppError("El usuario destino no está activo.", 400);
      }
      if (input.assignedRoleId) {
        const role = await db.role.findFirst({
          select: { id: true },
          where: { deletedAt: null, id: input.assignedRoleId },
        });
        if (!role) throw new AppError("El rol destino no está activo.", 400);
      }
      if (input.assignedAreaId) {
        const area = await db.area.findFirst({
          select: { id: true },
          where: { active: true, deletedAt: null, id: input.assignedAreaId },
        });
        if (!area) throw new AppError("El área destino no está activa.", 400);
      }

      const now = new Date();
      const previousAssignment = {
        assignedAreaId: task.assignedAreaId,
        assignedRoleId: task.assignedRoleId,
        assignedUserId: task.assignedUserId,
      };
      const history = [
        ...(Array.isArray(task.assignmentHistoryJson)
          ? task.assignmentHistoryJson
          : []),
        {
          actorUserId: access.userId,
          comment: input.comment?.trim() || null,
          date: now.toISOString(),
          next: {
            assignedAreaId: input.assignedAreaId ?? null,
            assignedRoleId: input.assignedRoleId ?? null,
            assignedUserId: input.assignedUserId ?? null,
          },
          previous: previousAssignment,
        },
      ];
      const updated = await db.workflowTask.update({
        data: {
          assignedAreaId: input.assignedAreaId ?? null,
          assignedRoleId: input.assignedRoleId ?? null,
          assignedUserId: input.assignedUserId ?? null,
          assignmentHistoryJson: asJson(history),
        },
        where: { id: taskId },
      });
      const context = restoreWorkflowRuntimeContext(
        task.instance.processType,
        task.instance.contextJson,
      );
      await writeRuntimeTransitionLog({
        context,
        db,
        details: {
          next: {
            assignedAreaId: input.assignedAreaId ?? null,
            assignedRoleId: input.assignedRoleId ?? null,
            assignedUserId: input.assignedUserId ?? null,
          },
          previous: previousAssignment,
        },
        eventType: "TASK_REASSIGNED",
        instanceId: task.instance.id,
        performedById: access.userId,
        sourceNodeId: task.nodeId,
        targetNodeId: task.nodeId,
        triggerType: "REASSIGNMENT",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.task.reassigned",
        actor: { ipAddress: access.ipAddress ?? null, userId: access.userId },
        db,
        entityId: taskId,
        entityType: "workflow_task",
        metadata: { instanceId: task.instance.id, nodeKey: task.node.nodeKey },
        newValues: {
          assignedAreaId: updated.assignedAreaId,
          assignedRoleId: updated.assignedRoleId,
          assignedUserId: updated.assignedUserId,
        },
        oldValues: previousAssignment,
      });
      const refreshed = await getTaskRecord(db, taskId);
      if (!refreshed)
        throw new AppError("No se encontró la tarea actualizada.", 404);
      return mapTask(refreshed, access, false);
    });
  },
};
