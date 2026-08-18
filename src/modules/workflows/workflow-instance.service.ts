import type { Prisma } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";
import type { WorkflowActorContext } from "./workflows.types.js";
import type { WorkflowInstanceStartInput } from "./workflow-runtime.validators.js";
import {
  buildWorkflowRuntimeContext,
  getEvidenceReviewRuntimeSummary,
  getSpecialRequestRuntimeSummary,
  restoreWorkflowRuntimeContext,
} from "./workflow-runtime-context.js";
import {
  executeAutomaticNodes,
  type RuntimeExecutionActor,
  type RuntimeDatabase,
} from "./workflow-runtime.service.js";
import {
  writeRuntimeAuditEvent,
  writeRuntimeTransitionLog,
} from "./workflow-runtime-events.js";
import { loadPinnedWorkflowGraph } from "./workflow-runtime-graph.js";
import {
  WORKFLOW_RUNTIME_ERROR_CODES,
  WorkflowRuntimeError,
} from "./workflow-runtime-errors.js";
import { prisma } from "../../utils/prisma.js";
import { cancelWorkflowInstanceTimers } from "./workflow-timer.service.js";
import { deliverWorkflowNotificationsForInstance } from "./workflow-notification.service.js";
import { getWorkflowEntityAdapter } from "./workflow-entity-adapters.js";
import { WORKFLOW_INSTANCE_PERMISSIONS } from "./workflows.permissions.js";

const asJson = (value: unknown): Prisma.InputJsonValue => {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
};

const runtimeActor = (access: WorkflowActorContext): RuntimeExecutionActor => ({
  ipAddress: access.ipAddress ?? null,
  userId: access.userId,
});

const assertPermission = (access: WorkflowActorContext, permission: string) => {
  if (!access.permissions.includes(permission)) {
    throw new AppError(`Falta el permiso requerido: ${permission}.`, 403);
  }
};

const isTerminal = (status: string): boolean =>
  ["COMPLETED", "REJECTED", "CANCELLED"].includes(status);

const canSeeInstance = async (
  db: RuntimeDatabase,
  instanceId: string,
  access: WorkflowActorContext,
): Promise<boolean> => {
  if (
    access.permissions.includes("workflows.view_instances") ||
    access.permissions.includes("workflow_tasks.view")
  ) {
    return true;
  }

  const ownInstance = await db.workflowInstance.findFirst({
    select: { id: true },
    where: { id: instanceId, startedById: access.userId },
  });
  if (ownInstance) return true;

  const task = await db.workflowTask.findFirst({
    select: { id: true },
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      workflowInstanceId: instanceId,
      OR: [
        { assignedUserId: access.userId },
        {
          assignedRole: {
            userRoles: { some: { userId: access.userId } },
          },
        },
        { assignedArea: { managerUserId: access.userId } },
      ],
    },
  });
  return Boolean(task);
};

const getInstanceForDetail = async (db: RuntimeDatabase, instanceId: string) =>
  db.workflowInstance.findUnique({
    include: {
      currentNode: {
        select: { id: true, name: true, nodeKey: true, type: true },
      },
      definition: {
        select: { id: true, name: true, processType: true, status: true },
      },
      startedBy: { select: { email: true, id: true, name: true } },
      tasks: {
        include: {
          assignedArea: { select: { id: true, name: true } },
          assignedRole: { select: { id: true, name: true } },
          assignedUser: { select: { email: true, id: true, name: true } },
          node: { select: { id: true, name: true, nodeKey: true, type: true } },
          timers: {
            select: {
              executeAt: true,
              executedAt: true,
              id: true,
              lastError: true,
              status: true,
              timerType: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { entrySequence: "asc" }],
      },
      transitions: {
        include: {
          performedBy: { select: { email: true, id: true, name: true } },
          sourceNode: {
            select: { id: true, name: true, nodeKey: true, type: true },
          },
          targetNode: {
            select: { id: true, name: true, nodeKey: true, type: true },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      version: { select: { id: true, status: true, versionNumber: true } },
    },
    where: { id: instanceId },
  });

const parseArrayJson = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const buildTimeline = (
  record: Awaited<ReturnType<typeof getInstanceForDetail>>,
) => {
  if (!record) return [];
  const events: Array<{
    actor: { email: string; id: string; name: string } | null;
    comment?: string | null;
    date: string;
    decision?: string | null;
    details?: unknown;
    eventType: string;
    fromNode?: {
      id: string;
      name: string;
      nodeKey: string;
      type: string;
    } | null;
    node?: { id: string; name: string; nodeKey: string; type: string } | null;
    taskId?: string;
    toNode?: { id: string; name: string; nodeKey: string; type: string } | null;
  }> = [
    {
      actor: record.startedBy,
      date: record.startedAt.toISOString(),
      eventType: "INSTANCE_STARTED",
      node: null,
    },
  ];

  for (const transition of record.transitions) {
    events.push({
      actor: transition.performedBy,
      date: transition.createdAt.toISOString(),
      decision: transition.decision,
      details: transition.detailsJson,
      eventType: transition.eventType ?? transition.triggerType,
      fromNode: transition.sourceNode,
      node: transition.targetNode,
      toNode: transition.targetNode,
    });
  }

  for (const task of record.tasks) {
    if (task.completedAt) {
      events.push({
        actor: task.assignedUser,
        comment: task.comments,
        date: task.completedAt.toISOString(),
        decision: task.decision,
        eventType: "TASK_COMPLETED",
        node: task.node,
        taskId: task.id,
      });
    }
    for (const assignment of parseArrayJson(task.assignmentHistoryJson)) {
      if (typeof assignment !== "object" || assignment === null) continue;
      const entry = assignment as Record<string, unknown>;
      if (typeof entry.date !== "string") continue;
      events.push({
        actor: record.startedBy,
        comment: typeof entry.comment === "string" ? entry.comment : null,
        date: entry.date,
        details: entry,
        eventType: "TASK_REASSIGNED",
        node: task.node,
        taskId: task.id,
      });
    }
  }

  return events.sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    return dateOrder || left.eventType.localeCompare(right.eventType);
  });
};

const mapInstance = (
  record: Awaited<ReturnType<typeof getInstanceForDetail>>,
) => {
  if (!record) return null;
  const currentTask =
    record.tasks.find((task) =>
      ["PENDING", "IN_PROGRESS"].includes(task.status),
    ) ?? null;
  const context = restoreWorkflowRuntimeContext(
    record.processType,
    record.contextJson,
  );
  const relatedRecordUrl = getWorkflowEntityAdapter(
    record.processType,
  )?.getEntityLink?.(record.entityId, context);
  const specialRequest = getSpecialRequestRuntimeSummary(context);
  const evidenceReview = getEvidenceReviewRuntimeSummary(context);
  return {
    completedAt: record.completedAt?.toISOString() ?? null,
    context: {
      areaId: context.areaId ?? null,
      currentNodeKey: context.currentNodeKey ?? null,
      daysOverdue: context.daysOverdue ?? null,
      dueDate: context.dueDate ?? null,
      evidenceCount: context.evidenceCount ?? null,
      hasEvidence: context.hasEvidence ?? null,
      observationStatus: context.observationStatus ?? null,
      previousDecision: context.previousDecision ?? null,
      processType: context.processType,
      remediationPlanStatus: context.remediationPlanStatus ?? null,
      requestType: context.requestType ?? null,
      requestedExtensionDays: context.requestedExtensionDays ?? null,
      requesterUserId: context.requesterUserId ?? null,
      responsibleUserId: context.responsibleUserId ?? null,
      riskLevel: context.riskLevel ?? null,
    },
    currentNode: record.currentNode,
    currentTask,
    definition: record.definition,
    entityId: record.entityId,
    entityType: record.entityType,
    evidenceReview,
    relatedRecordUrl: relatedRecordUrl ?? null,
    specialRequest,
    finalResult: record.finalResult,
    id: record.id,
    runtimeError: record.runtimeErrorCode
      ? { code: record.runtimeErrorCode, message: record.runtimeErrorMessage }
      : null,
    startedAt: record.startedAt.toISOString(),
    startedBy: record.startedBy,
    status: record.status,
    tasks: record.tasks.map((task) => ({
      assignedArea: task.assignedArea,
      assignedRole: task.assignedRole,
      assignedUser: task.assignedUser,
      assignmentSnapshot: task.assignmentSnapshotJson,
      comments: task.comments,
      completedAt: task.completedAt?.toISOString() ?? null,
      createdAt: task.createdAt.toISOString(),
      decision: task.decision,
      dueAt: task.dueAt?.toISOString() ?? null,
      entrySequence: task.entrySequence,
      id: task.id,
      node: task.node,
      status: task.status,
      timers: task.timers.map((timer) => ({
        executeAt: timer.executeAt.toISOString(),
        executedAt: timer.executedAt?.toISOString() ?? null,
        id: timer.id,
        lastError: timer.lastError,
        status: timer.status,
        timerType: timer.timerType,
      })),
    })),
    timeline: buildTimeline(record),
    version: {
      id: record.version.id,
      status: record.version.status,
      versionNumber: record.version.versionNumber,
    },
    workflow: record.definition,
  };
};

export const workflowInstanceService = {
  async getStartOptions(access: WorkflowActorContext) {
    assertPermission(access, WORKFLOW_INSTANCE_PERMISSIONS.start);
    const [workflows, users, areas, riskLevels] = await prisma.$transaction([
      prisma.workflowDefinition.findMany({
        orderBy: { name: "asc" },
        select: {
          activeVersion: {
            select: { id: true, versionNumber: true },
          },
          description: true,
          id: true,
          name: true,
        },
        where: {
          activeVersionId: { not: null },
          archivedAt: null,
          processType: "SPECIAL_REQUEST",
          status: "PUBLISHED",
        },
      }),
      prisma.user.findMany({
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: { email: true, id: true, name: true },
        where: { deletedAt: null, isActive: true },
      }),
      prisma.area.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        where: { active: true, deletedAt: null },
      }),
      prisma.riskLevel.findMany({
        orderBy: [{ severityOrder: "asc" }, { name: "asc" }],
        select: { key: true, name: true },
        where: { active: true, deletedAt: null },
      }),
    ]);
    return { areas, riskLevels, users, workflows };
  },

  async startInstance(
    input: WorkflowInstanceStartInput,
    access: WorkflowActorContext,
    options?: { deferNotifications?: boolean; internal?: boolean },
  ) {
    if (!options?.internal)
      assertPermission(access, WORKFLOW_INSTANCE_PERMISSIONS.start);
    const actor = runtimeActor(access);
    const createdId = await (
      await import("../../utils/prisma.js")
    ).prisma.$transaction(async (db) => {
      const definition = input.workflowDefinitionId
        ? await db.workflowDefinition.findUnique({
            include: { activeVersion: true },
            where: { id: input.workflowDefinitionId },
          })
        : null;
      const definitions = definition
        ? [definition]
        : await db.workflowDefinition.findMany({
            include: { activeVersion: true },
            orderBy: { id: "asc" },
            where: {
              activeVersionId: { not: null },
              processType: input.processType,
              status: "PUBLISHED",
            },
          });

      if (definitions.length === 0) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.NO_ACTIVE_VERSION,
          "No existe un workflow publicado y activo para este tipo de proceso.",
        );
      }
      if (definitions.length > 1) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
          "Hay varios workflows activos para este tipo de proceso; seleccione un workflow explícitamente.",
        );
      }

      const selected = definitions[0];
      if (!selected || selected.status !== "PUBLISHED" || selected.archivedAt) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
          "El workflow seleccionado está archivado o no está publicado.",
        );
      }
      if (selected.processType !== input.processType) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
          "El workflow seleccionado no corresponde al tipo de proceso solicitado.",
        );
      }
      const version = selected.activeVersion;
      if (!version || selected.activeVersionId !== version.id) {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.NO_ACTIVE_VERSION,
          "El workflow no tiene una versión activa.",
        );
      }
      if (version.status !== "PUBLISHED") {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.VERSION_NOT_PUBLISHED,
          "La versión activa del workflow no está publicada.",
        );
      }

      const context = buildWorkflowRuntimeContext({
        actorUserId: access.userId,
        context: input.context,
        processType: input.processType,
      });
      const now = new Date();
      const instance = await db.workflowInstance.create({
        data: {
          contextJson: asJson(context),
          entityId: input.entityId,
          entityType: input.entityType,
          processType: input.processType,
          startedById: access.userId,
          startedAt: now,
          status: "PENDING",
          workflowDefinitionId: selected.id,
          workflowVersionId: version.id,
        },
        select: { id: true },
      });
      await writeRuntimeTransitionLog({
        context,
        db,
        details: {
          definitionId: selected.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
        },
        eventType: "INSTANCE_STARTED",
        instanceId: instance.id,
        performedById: access.userId,
        triggerType: "INSTANCE_START",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.instance.started",
        actor,
        db,
        entityId: instance.id,
        entityType: "workflow_instance",
        metadata: {
          entityId: input.entityId,
          entityType: input.entityType,
          processType: input.processType,
          versionId: version.id,
        },
        newValues: {
          status: "PENDING",
          workflowDefinitionId: selected.id,
          workflowVersionId: version.id,
        },
      });
      await executeAutomaticNodes({ actor, db, instanceId: instance.id, now });
      return instance.id;
    });
    const created = await prisma.workflowInstance.findUniqueOrThrow({
      select: { id: true, status: true },
      where: { id: createdId },
    });
    if (!options?.deferNotifications) {
      await deliverWorkflowNotificationsForInstance(created.id);
    }
    if (options?.internal) return created;
    return this.getInstance(created.id, access);
  },

  async getHistory(instanceId: string, access: WorkflowActorContext) {
    const detail = await this.getInstance(instanceId, access);
    return detail.timeline;
  },

  async getInstance(instanceId: string, access: WorkflowActorContext) {
    const visible = await canSeeInstance(prisma, instanceId, access);
    if (!visible) {
      throw new AppError("No se encontró la instancia solicitada.", 404);
    }
    const record = await getInstanceForDetail(prisma, instanceId);
    if (!record) {
      throw new AppError("No se encontró la instancia solicitada.", 404);
    }
    const mapped = mapInstance(record);
    if (!mapped) {
      throw new AppError("No se encontró la instancia solicitada.", 404);
    }
    return mapped;
  },

  async cancelInstance(instanceId: string, access: WorkflowActorContext) {
    assertPermission(access, "workflow_instances.cancel");
    const actor = runtimeActor(access);
    return prisma.$transaction(async (db) => {
      const instance = await db.workflowInstance.findUnique({
        select: {
          contextJson: true,
          currentNodeId: true,
          processType: true,
          status: true,
        },
        where: { id: instanceId },
      });
      if (!instance)
        throw new AppError("No se encontró la instancia solicitada.", 404);
      if (isTerminal(instance.status) || instance.status === "FAILED") {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.INSTANCE_NOT_ACTIONABLE,
          "La instancia ya no puede cancelarse en su estado actual.",
        );
      }
      const now = new Date();
      const context = restoreWorkflowRuntimeContext(
        instance.processType,
        instance.contextJson,
      );
      await db.workflowTask.updateMany({
        data: { completedAt: now, status: "CANCELLED" },
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          workflowInstanceId: instanceId,
        },
      });
      await cancelWorkflowInstanceTimers(db, instanceId);
      await db.workflowInstance.update({
        data: {
          completedAt: now,
          finalResult: "CANCELLED",
          lastExecutionAt: now,
          status: "CANCELLED",
        },
        where: { id: instanceId },
      });
      await writeRuntimeTransitionLog({
        context,
        db,
        eventType: "INSTANCE_CANCELLED",
        instanceId,
        performedById: access.userId,
        ...(instance.currentNodeId
          ? { sourceNodeId: instance.currentNodeId }
          : {}),
        triggerType: "CANCELLED",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.instance.cancelled",
        actor,
        db,
        entityId: instanceId,
        entityType: "workflow_instance",
        metadata: { previousStatus: instance.status },
        newValues: {
          completedAt: now.toISOString(),
          finalResult: "CANCELLED",
          status: "CANCELLED",
        },
      });
      return this.getInstanceWithinTransaction(db, instanceId);
    });
  },

  async retryInstance(instanceId: string, access: WorkflowActorContext) {
    assertPermission(access, "workflow_instances.retry");
    const actor = runtimeActor(access);
    await prisma.$transaction(async (db) => {
      const instance = await db.workflowInstance.findUnique({
        select: {
          contextJson: true,
          currentNodeId: true,
          processType: true,
          status: true,
          workflowVersionId: true,
        },
        where: { id: instanceId },
      });
      if (!instance)
        throw new AppError("No se encontró la instancia solicitada.", 404);
      if (instance.status !== "FAILED") {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.INSTANCE_NOT_ACTIONABLE,
          "Solo se pueden reintentar instancias fallidas.",
        );
      }
      const graph = await loadPinnedWorkflowGraph(
        db,
        instance.workflowVersionId,
      );
      const node = instance.currentNodeId
        ? graph.nodes.find(
            (candidate) => candidate.id === instance.currentNodeId,
          )
        : null;
      if (!node || node.type === "STAGE" || node.type === "APPROVAL") {
        throw new WorkflowRuntimeError(
          WORKFLOW_RUNTIME_ERROR_CODES.INSTANCE_NOT_ACTIONABLE,
          "El reintento solo está disponible para fallos de nodos automáticos.",
        );
      }
      const now = new Date();
      await db.workflowInstance.update({
        data: {
          lastExecutionAt: now,
          runtimeErrorCode: null,
          runtimeErrorMessage: null,
          status: "ACTIVE",
        },
        where: { id: instanceId },
      });
      const context = restoreWorkflowRuntimeContext(
        instance.processType,
        instance.contextJson,
      );
      await writeRuntimeTransitionLog({
        context,
        db,
        details: { nodeKey: node.nodeKey },
        eventType: "INSTANCE_RETRY",
        instanceId,
        performedById: access.userId,
        sourceNodeId: node.id,
        triggerType: "RETRY",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.instance.retry",
        actor,
        db,
        entityId: instanceId,
        entityType: "workflow_instance",
        metadata: { nodeKey: node.nodeKey },
        newValues: { status: "ACTIVE" },
      });
      await executeAutomaticNodes({ actor, db, instanceId, now });
    });
    await deliverWorkflowNotificationsForInstance(instanceId);
    return this.getInstance(instanceId, access);
  },

  async getInstanceWithinTransaction(db: RuntimeDatabase, instanceId: string) {
    const record = await getInstanceForDetail(db, instanceId);
    if (!record)
      throw new AppError("No se encontró la instancia solicitada.", 404);
    return mapInstance(record);
  },
};
