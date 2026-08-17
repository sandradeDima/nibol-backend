import {
  NotificationPriority,
  type Prisma,
} from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";

import {
  resolveRuntimeAssignment,
  type AssignmentResolution,
} from "./workflow-assignment-resolver.js";
import {
  buildWorkflowRuntimeContext,
  restoreWorkflowRuntimeContext,
  type WorkflowRuntimeContext,
} from "./workflow-runtime-context.js";
import {
  writeRuntimeAuditEvent,
  writeRuntimeTransitionLog,
  type RuntimeEventActor,
} from "./workflow-runtime-events.js";
import {
  loadPinnedWorkflowGraph,
  getRuntimeNode,
} from "./workflow-runtime-graph.js";
import {
  WORKFLOW_RUNTIME_ERROR_CODES,
  WorkflowRuntimeError,
} from "./workflow-runtime-errors.js";
import {
  selectRuntimeTransition,
  summarizeConditionEvaluations,
} from "./workflow-transition-resolver.js";
import { WORKFLOW_GRAPH_LIMITS } from "./workflows.constants.js";
import { toLogJsonValue } from "../../services/logging-utils.js";
import { getWorkflowEntityAdapter } from "./workflow-entity-adapters.js";
import {
  buildWorkflowInstanceUrl,
  createTaskAssignedNotification,
  createWorkflowCompletionNotification,
  createWorkflowNotificationIntent,
  getWorkflowTaskAssignmentRecipientsForTask,
  resolveWorkflowNotificationRecipients,
} from "./workflow-notification.service.js";
import { createWorkflowTaskTimers } from "./workflow-timer.service.js";

export type RuntimeDatabase = Prisma.TransactionClient;

export type RuntimeExecutionActor = RuntimeEventActor & {
  userId: string;
};

export type RuntimeExecutionInput = {
  actor?: RuntimeExecutionActor | null;
  db: RuntimeDatabase;
  instanceId: string;
  now?: Date;
};

const asJson = (value: unknown): Prisma.InputJsonValue =>
  toLogJsonValue(value) ?? {};

const getAssignmentSnapshot = (
  resolution: AssignmentResolution,
): Record<string, unknown> => ({
  ...(resolution.assignedAreaId
    ? { assignedAreaId: resolution.assignedAreaId }
    : {}),
  ...(resolution.assignedRoleId
    ? { assignedRoleId: resolution.assignedRoleId }
    : {}),
  ...(resolution.assignedUserId
    ? { assignedUserId: resolution.assignedUserId }
    : {}),
  fallbackApplied: resolution.fallbackApplied,
  ...(resolution.fallbackReason
    ? { fallbackReason: resolution.fallbackReason }
    : {}),
  strategy: resolution.strategy,
});

const ensureHumanTask = async ({
  actor,
  context,
  db,
  instanceId,
  node,
  now,
}: {
  actor: RuntimeExecutionActor | null;
  context: WorkflowRuntimeContext;
  db: RuntimeDatabase;
  instanceId: string;
  node: Awaited<ReturnType<typeof getRuntimeNode>>;
  now: Date;
}) => {
  if (!node || (node.type !== "STAGE" && node.type !== "APPROVAL")) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      "El runtime intentó crear una tarea para un nodo no accionable.",
    );
  }

  const activeTask = await db.workflowTask.findFirst({
    orderBy: { entrySequence: "desc" },
    select: { id: true },
    where: {
      nodeId: node.id,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      workflowInstanceId: instanceId,
    },
  });
  if (activeTask) {
    await db.workflowInstance.update({
      data: { lastExecutionAt: now, status: "WAITING" },
      where: { id: instanceId },
    });
    return activeTask.id;
  }

  const configuration = node.configurationJson;
  if (
    configuration.nodeType !== "STAGE" &&
    configuration.nodeType !== "APPROVAL"
  ) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      "La configuración de la tarea no corresponde a una etapa humana.",
    );
  }

  const resolution = await resolveRuntimeAssignment({
    configuration,
    context,
    db,
  });
  if (
    !resolution.assignedAreaId &&
    !resolution.assignedRoleId &&
    !resolution.assignedUserId
  ) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.ASSIGNMENT_UNRESOLVED,
      `No se pudo resolver un responsable para la etapa ${node.name}.`,
      409,
      { nodeKey: node.nodeKey, strategy: resolution.strategy },
    );
  }

  const latestTask = await db.workflowTask.findFirst({
    orderBy: { entrySequence: "desc" },
    select: { entrySequence: true },
    where: { nodeId: node.id, workflowInstanceId: instanceId },
  });
  const entrySequence = (latestTask?.entrySequence ?? 0) + 1;
  const task = await db.workflowTask.create({
    data: {
      ...(resolution.assignedAreaId
        ? { assignedAreaId: resolution.assignedAreaId }
        : {}),
      ...(resolution.assignedRoleId
        ? { assignedRoleId: resolution.assignedRoleId }
        : {}),
      ...(resolution.assignedUserId
        ? { assignedUserId: resolution.assignedUserId }
        : {}),
      assignmentSnapshotJson: asJson(getAssignmentSnapshot(resolution)),
      createdAt: now,
      dueAt: null,
      entrySequence,
      nodeId: node.id,
      workflowInstanceId: instanceId,
      status: "PENDING",
    },
    select: { id: true },
  });

  const timerSetup = await createWorkflowTaskTimers({
    configuration,
    context,
    db,
    instanceId,
    sourceNodeId: node.id,
    startedAt: now,
    taskId: task.id,
    entrySequence,
  });

  const assignmentRecipients = await getWorkflowTaskAssignmentRecipientsForTask(
    db,
    task.id,
  );
  const assignmentNotification = await createTaskAssignedNotification({
    db,
    instance: { id: instanceId },
    recipients: assignmentRecipients,
    task: {
      dueAt: timerSetup.dueAt,
      id: task.id,
      nodeName: node.name,
      visitSequence: entrySequence,
    },
  });
  if (assignmentNotification.recipientCount > 0) {
    await writeRuntimeTransitionLog({
      context,
      db,
      details: {
        channel: "BOTH",
        createdDeliveries: assignmentNotification.createdDeliveries.length,
        recipientCount: assignmentNotification.recipientCount,
        taskId: task.id,
      },
      eventType: "NOTIFICATION_CREATED",
      instanceId,
      sourceNodeId: node.id,
      targetNodeId: node.id,
      triggerType: "TASK_ASSIGNED",
    });
  }

  await db.workflowInstance.update({
    data: { lastExecutionAt: now, status: "WAITING" },
    where: { id: instanceId },
  });

  await writeRuntimeTransitionLog({
    context,
    db,
    details: {
      assignment: getAssignmentSnapshot(resolution),
      entrySequence,
      nodeKey: node.nodeKey,
    },
    eventType: "TASK_CREATED",
    instanceId,
    performedById: actor?.userId ?? null,
    sourceNodeId: node.id,
    targetNodeId: node.id,
    triggerType: "TASK_CREATED",
  });
  await writeRuntimeAuditEvent({
    action: "workflow.task.created",
    actor: actor ?? { userId: null },
    db,
    entityId: task.id,
    entityType: "workflow_task",
    metadata: {
      entrySequence,
      instanceId,
      nodeKey: node.nodeKey,
      strategy: resolution.strategy,
    },
    newValues: {
      entrySequence,
      instanceId,
      nodeId: node.id,
      status: "PENDING",
    },
  });

  await writeRuntimeAuditEvent({
    action: "workflow.instance.waiting_for_task",
    actor: actor ?? { userId: null },
    db,
    entityId: instanceId,
    entityType: "workflow_instance",
    metadata: { nodeKey: node.nodeKey, taskId: task.id },
    newValues: { currentNodeId: node.id, status: "WAITING" },
  });

  return task.id;
};

const markRuntimeFailure = async ({
  actor,
  context,
  db,
  error,
  instanceId,
  nodeId,
  now,
}: {
  actor: RuntimeExecutionActor | null;
  context: WorkflowRuntimeContext;
  db: RuntimeDatabase;
  error: WorkflowRuntimeError;
  instanceId: string;
  nodeId?: string | null;
  now: Date;
}): Promise<void> => {
  await db.workflowInstance.update({
    data: {
      lastExecutionAt: now,
      runtimeErrorCode: error.code,
      runtimeErrorMessage: error.message,
      status: "FAILED",
    },
    where: { id: instanceId },
  });
  await writeRuntimeTransitionLog({
    context,
    db,
    details: { code: error.code, message: error.message },
    eventType: "INSTANCE_FAILED",
    instanceId,
    performedById: actor?.userId ?? null,
    ...(nodeId ? { sourceNodeId: nodeId } : {}),
    triggerType: "RUNTIME_FAILURE",
  });
  await writeRuntimeAuditEvent({
    action: "workflow.instance.failed",
    actor: actor ?? { userId: null },
    db,
    entityId: instanceId,
    entityType: "workflow_instance",
    metadata: { code: error.code, message: error.message },
    newValues: { runtimeErrorCode: error.code, status: "FAILED" },
  });
};

const mapEndResultToStatus = (
  finalResult: string,
): "COMPLETED" | "REJECTED" | "CANCELLED" => {
  if (["APPROVED", "CLOSED"].includes(finalResult)) return "COMPLETED";
  if (finalResult === "CANCELLED") return "CANCELLED";
  return "REJECTED";
};

const completeAtEnd = async ({
  actor,
  context,
  db,
  instanceId,
  instance,
  node,
  now,
}: {
  actor: RuntimeExecutionActor | null;
  context: WorkflowRuntimeContext;
  db: RuntimeDatabase;
  instanceId: string;
  instance: { entityId: string; entityType: string; processType: string };
  node: Awaited<ReturnType<typeof getRuntimeNode>>;
  now: Date;
}): Promise<"COMPLETED" | "REJECTED" | "CANCELLED"> => {
  if (!node || node.configurationJson.nodeType !== "END") {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      "El runtime intentó completar una instancia fuera de un nodo final.",
    );
  }
  const finalResult = node.configurationJson.finalResult;
  const status = mapEndResultToStatus(finalResult);
  const nextContext = { ...context, currentNodeKey: node.nodeKey };
  const adapter = getWorkflowEntityAdapter(instance.processType);
  try {
    if (adapter?.applyCompletion) {
      await adapter.applyCompletion({
        db,
        entityId: instance.entityId,
        finalResult,
        instanceId,
        ...(actor?.userId ? { actorUserId: actor.userId } : {}),
      });
      await writeRuntimeAuditEvent({
        action: "workflow.integration.applied",
        actor: actor ?? { userId: null },
        db,
        entityId: instance.entityId,
        entityType: instance.entityType,
        metadata: {
          finalResult,
          instanceId,
          processType: instance.processType,
        },
        newValues: { finalResult },
      });
      await writeRuntimeTransitionLog({
        context: nextContext,
        db,
        details: {
          entityId: instance.entityId,
          entityType: instance.entityType,
          finalResult,
        },
        eventType: "INTEGRATION_APPLIED",
        instanceId,
        performedById: actor?.userId ?? null,
        sourceNodeId: node.id,
        targetNodeId: node.id,
        triggerType: "ENTITY_ADAPTER",
      });
    }
  } catch (error) {
    if (error instanceof WorkflowRuntimeError) throw error;
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.INTEGRATION_FAILED,
      error instanceof AppError
        ? error.message
        : "No se pudo actualizar el registro relacionado al completar el workflow.",
      409,
    );
  }
  await db.workflowInstance.update({
    data: {
      completedAt: now,
      contextJson: asJson(nextContext),
      finalResult,
      lastExecutionAt: now,
      runtimeErrorCode: null,
      runtimeErrorMessage: null,
      status,
    },
    where: { id: instanceId },
  });
  await writeRuntimeTransitionLog({
    context: nextContext,
    db,
    details: { finalResult, status },
    eventType: "INSTANCE_COMPLETED",
    instanceId,
    performedById: actor?.userId ?? null,
    sourceNodeId: node.id,
    triggerType: "END_REACHED",
  });
  await writeRuntimeAuditEvent({
    action:
      status === "COMPLETED"
        ? "workflow.instance.completed"
        : status === "CANCELLED"
          ? "workflow.instance.cancelled"
          : "workflow.instance.rejected",
    actor: actor ?? { userId: null },
    db,
    entityId: instanceId,
    entityType: "workflow_instance",
    metadata: { finalResult, nodeKey: node.nodeKey },
    newValues: { completedAt: now.toISOString(), finalResult, status },
  });
  if (node.configurationJson.notifyParticipants) {
    await createWorkflowCompletionNotification({
      context: nextContext,
      db,
      finalResult,
      instanceId,
      targetUrl: buildWorkflowInstanceUrl(instanceId),
    });
  }
  return status;
};

const isTerminalRuntimeStatus = (status: string): boolean =>
  ["COMPLETED", "REJECTED", "CANCELLED"].includes(status);

const executeAutomaticNodesInternal = async ({
  actor = null,
  db,
  instanceId,
  now = new Date(),
}: RuntimeExecutionInput): Promise<{ status: string; taskId?: string }> => {
  const instance = await db.workflowInstance.findUnique({
    select: {
      contextJson: true,
      currentNodeId: true,
      entityId: true,
      entityType: true,
      id: true,
      processType: true,
      status: true,
      workflowVersionId: true,
    },
    where: { id: instanceId },
  });
  if (!instance) {
    throw new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.INSTANCE_NOT_ACTIONABLE,
      "La instancia de workflow no existe.",
      404,
    );
  }
  if (isTerminalRuntimeStatus(instance.status)) {
    return { status: instance.status };
  }

  const graph = await loadPinnedWorkflowGraph(db, instance.workflowVersionId);
  const start = graph.nodes.find((node) => node.type === "START") ?? null;
  if (!start) {
    const error = new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.START_NODE_MISSING,
      "La versión publicada no contiene un nodo Inicio válido.",
    );
    const context = restoreWorkflowRuntimeContext(
      instance.processType,
      instance.contextJson,
    );
    await markRuntimeFailure({ actor, context, db, error, instanceId, now });
    return { status: "FAILED" };
  }

  let context = restoreWorkflowRuntimeContext(
    instance.processType,
    instance.contextJson,
  );
  let currentNodeId = instance.currentNodeId ?? start.id;
  let currentNode = getRuntimeNode(graph, currentNodeId);
  if (!currentNode) {
    const error = new WorkflowRuntimeError(
      WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
      "La instancia apunta a un nodo que no existe en su versión fijada.",
    );
    await markRuntimeFailure({ actor, context, db, error, instanceId, now });
    return { status: "FAILED" };
  }

  await db.workflowInstance.update({
    data: {
      currentNodeId: currentNode.id,
      lastExecutionAt: now,
      status: "ACTIVE",
    },
    where: { id: instanceId },
  });

  for (
    let step = 0;
    step < WORKFLOW_GRAPH_LIMITS.maxSimulationSteps;
    step += 1
  ) {
    if (!currentNode) break;

    if (currentNode.type === "STAGE" || currentNode.type === "APPROVAL") {
      const taskId = await ensureHumanTask({
        actor,
        context,
        db,
        instanceId,
        node: currentNode,
        now,
      });
      return { status: "WAITING", taskId };
    }

    if (currentNode.type === "END") {
      const status = await completeAtEnd({
        actor,
        context,
        db,
        instanceId,
        instance,
        node: currentNode,
        now,
      });
      return { status };
    }

    if (
      currentNode.configurationJson.nodeType === "START" &&
      currentNode.configurationJson.processType !== instance.processType
    ) {
      const error = new WorkflowRuntimeError(
        WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_CONFIGURATION,
        "El nodo Inicio no corresponde al tipo de proceso de la instancia.",
      );
      await markRuntimeFailure({
        actor,
        context,
        db,
        error,
        instanceId,
        nodeId: currentNode.id,
        now,
      });
      return { status: "FAILED" };
    }

    if (currentNode.configurationJson.nodeType === "NOTIFICATION") {
      const notificationConfiguration = currentNode.configurationJson;
      const recipients = await resolveWorkflowNotificationRecipients({
        configuration: notificationConfiguration,
        context,
        db,
        instanceId,
      });
      const adapter = getWorkflowEntityAdapter(instance.processType);
      const targetUrl = notificationConfiguration.includeRelatedRecordLink
        ? (adapter?.getEntityLink?.(instance.entityId, context) ??
          buildWorkflowInstanceUrl(instanceId))
        : buildWorkflowInstanceUrl(instanceId);
      const contextMessage = notificationConfiguration.includeWorkflowContext
        ? ` Proceso: ${instance.processType}. Instancia: ${instanceId}.`
        : "";
      const intent = await createWorkflowNotificationIntent(db, {
        channel: notificationConfiguration.channel,
        // Keep the notification linked to the runtime instance so the
        // post-commit delivery worker can find it. The actionable related
        // record remains available through targetUrl.
        entityId: instanceId,
        entityType: "workflow_instance",
        eventType: "workflow.node.notification",
        instanceId,
        message: `Tiene una notificación de workflow: ${notificationConfiguration.template}.${contextMessage}`,
        priority: NotificationPriority.HIGH,
        recipients,
        targetUrl,
        title: notificationConfiguration.subjectOverride ?? currentNode.name,
        taskId: currentNode.id,
        visitSequence: step,
      });
      await writeRuntimeTransitionLog({
        context,
        db,
        details: {
          channel: currentNode.configurationJson.channel,
          createdDeliveries: intent.createdDeliveries.length,
          recipientCount: intent.recipientCount,
          recipientStrategy: currentNode.configurationJson.recipientStrategy,
          template: currentNode.configurationJson.template,
        },
        eventType: "NOTIFICATION_CREATED",
        instanceId,
        performedById: actor?.userId ?? null,
        sourceNodeId: currentNode.id,
        targetNodeId: currentNode.id,
        triggerType: "NOTIFICATION_CREATED",
      });
    }

    const selection = selectRuntimeTransition({
      context,
      graph,
      node: currentNode,
      now,
    });
    if (!selection.selected) {
      const error = new WorkflowRuntimeError(
        (selection.errorCode as (typeof WORKFLOW_RUNTIME_ERROR_CODES)[keyof typeof WORKFLOW_RUNTIME_ERROR_CODES]) ??
          WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND,
        selection.errorMessage ?? "No se encontró una ruta de ejecución.",
      );
      await markRuntimeFailure({
        actor,
        context,
        db,
        error,
        instanceId,
        nodeId: currentNode.id,
        now,
      });
      return { status: "FAILED" };
    }

    const targetNode = getRuntimeNode(graph, selection.selected.targetNodeId);
    if (!targetNode) {
      const error = new WorkflowRuntimeError(
        WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND,
        "La ruta publicada apunta a un nodo inexistente.",
      );
      await markRuntimeFailure({
        actor,
        context,
        db,
        error,
        instanceId,
        nodeId: currentNode.id,
        now,
      });
      return { status: "FAILED" };
    }

    const nextContext: WorkflowRuntimeContext = {
      ...context,
      currentNodeKey: targetNode.nodeKey,
    };
    await db.workflowInstance.update({
      data: {
        contextJson: asJson(nextContext),
        currentNodeId: targetNode.id,
        lastExecutionAt: now,
        status: "ACTIVE",
      },
      where: { id: instanceId },
    });
    await writeRuntimeTransitionLog({
      context: nextContext,
      db,
      details: {
        conditionEvaluations: summarizeConditionEvaluations(
          selection.conditionEvaluations,
        ),
        ...(currentNode.configurationJson.nodeType === "SLA"
          ? {
              projectedSla: {
                actionOnBreach: currentNode.configurationJson.actionOnBreach,
                duration: currentNode.configurationJson.duration,
                unit: currentNode.configurationJson.unit,
              },
            }
          : {}),
        ...(currentNode.configurationJson.nodeType === "ESCALATION"
          ? { escalationNode: "automatic_pass_through" }
          : {}),
        usedFallback: selection.usedFallback,
      },
      eventType: "AUTOMATIC_TRANSITION",
      instanceId,
      performedById: actor?.userId ?? null,
      sourceNodeId: currentNode.id,
      targetNodeId: targetNode.id,
      triggerType: "AUTOMATIC",
    });

    context = nextContext;
    currentNodeId = targetNode.id;
    currentNode = getRuntimeNode(graph, currentNodeId);
  }

  const error = new WorkflowRuntimeError(
    WORKFLOW_RUNTIME_ERROR_CODES.RUNTIME_STEP_LIMIT,
    `La ejecución superó el máximo de ${WORKFLOW_GRAPH_LIMITS.maxSimulationSteps} pasos.`,
  );
  await markRuntimeFailure({
    actor,
    context,
    db,
    error,
    instanceId,
    ...(currentNode ? { nodeId: currentNode.id } : {}),
    now,
  });
  return { status: "FAILED" };
};

export const executeAutomaticNodes = async (
  input: RuntimeExecutionInput,
): Promise<{ status: string; taskId?: string }> => {
  const now = input.now ?? new Date();
  try {
    return await executeAutomaticNodesInternal({ ...input, now });
  } catch (error) {
    if (!(error instanceof WorkflowRuntimeError)) throw error;

    const instance = await input.db.workflowInstance.findUnique({
      select: {
        contextJson: true,
        currentNodeId: true,
        processType: true,
        status: true,
      },
      where: { id: input.instanceId },
    });
    if (!instance) throw error;
    if (isTerminalRuntimeStatus(instance.status)) {
      return { status: instance.status };
    }

    const context = restoreWorkflowRuntimeContext(
      instance.processType,
      instance.contextJson,
    );
    await markRuntimeFailure({
      actor: input.actor ?? null,
      context,
      db: input.db,
      error,
      instanceId: input.instanceId,
      nodeId: instance.currentNodeId,
      now,
    });
    return { status: "FAILED" };
  }
};

export const buildStartRuntimeContext = buildWorkflowRuntimeContext;
