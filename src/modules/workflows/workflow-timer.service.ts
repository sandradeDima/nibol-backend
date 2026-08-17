import { randomUUID } from "node:crypto";

import {
  NotificationDeliveryStatus,
  NotificationPriority,
  ScheduledJobExecutionStatus,
  type Prisma,
} from "../../../generated/prisma/client.js";
import type { ScheduledJobTrigger } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../utils/prisma.js";
import { env } from "../../utils/env.js";
import {
  WORKFLOW_DEFAULT_DUE_SOON_HOURS,
  WORKFLOW_TIMER_MAX_ATTEMPTS,
  WORKFLOW_TIMER_PROCESSING_TIMEOUT_MS,
  WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
  WORKFLOW_TIMER_TYPES,
  type WorkflowTimerType,
} from "./workflows.constants.js";
import {
  calculateWorkflowDeadline,
  calculateWorkflowThresholdAt,
  getWorkflowSlaState,
  type WorkflowSlaUnit,
} from "./workflow-sla.js";
import type { WorkflowNodeConfiguration } from "./workflows.validators.js";
import {
  buildWorkflowInstanceUrl,
  createWorkflowNotificationIntent,
  createWorkflowOverdueNotification,
  createWorkflowReminderNotification,
  deliverPendingWorkflowNotificationDeliveries,
  getWorkflowTaskAssignmentRecipients,
  getWorkflowTaskAssignmentRecipientsForTask,
} from "./workflow-notification.service.js";
import {
  restoreWorkflowRuntimeContext,
  type WorkflowRuntimeContext,
} from "./workflow-runtime-context.js";
import {
  writeRuntimeAuditEvent,
  writeRuntimeTransitionLog,
} from "./workflow-runtime-events.js";
import { loadPinnedWorkflowGraph } from "./workflow-runtime-graph.js";

export type WorkflowTimerConfiguration = {
  actionOnBreach?: string;
  alternateTargetNodeKey?: string | null;
  escalationAreaId?: string | null;
  escalationMode?:
    | "NOTIFY_ONLY"
    | "ADD_VISIBILITY"
    | "REASSIGN"
    | "ALTERNATE_ROUTE";
  escalationRoleId?: string | null;
  escalationStrategy?: "SUPERVISOR" | "AREA_MANAGER" | "FIXED_USER" | "ROLE";
  escalationUserId?: string | null;
  entrySequence?: number;
  reminderThreshold?: number | null;
  sourceNodeId?: string | null;
  timerType?: WorkflowTimerType;
  unit?: WorkflowSlaUnit;
};

export type WorkflowTimerProcessorSummary = {
  batchLimit: number;
  claimedCount: number;
  completedCount: number;
  examinedCount: number;
  failedCount: number;
  failures: Array<{ errorCode: string; message: string; timerId: string }>;
  jobName: string;
  skippedCount: number;
  startedAt: string;
  finishedAt: string;
  emailsSent: number;
  lockSkipped: boolean;
};

const asJson = (value: unknown): Prisma.InputJsonValue =>
  (value === null || value === undefined ? {} : value) as Prisma.InputJsonValue;

const isTimerType = (value: string): value is WorkflowTimerType =>
  (WORKFLOW_TIMER_TYPES as readonly string[]).includes(value);

const configRecord = (value: unknown): WorkflowTimerConfiguration => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return value as WorkflowTimerConfiguration;
};

const getSlaForHumanNode = (configuration: WorkflowNodeConfiguration) =>
  configuration.nodeType === "STAGE" || configuration.nodeType === "APPROVAL"
    ? (configuration.sla ?? null)
    : null;

const createTimerIfMissing = async (
  db: Prisma.TransactionClient,
  input: {
    configuration: WorkflowTimerConfiguration;
    context: WorkflowRuntimeContext;
    executeAt: Date;
    instanceId: string;
    sourceNodeId: string;
    taskId: string;
    timerType: WorkflowTimerType;
  },
) => {
  const existing = await db.workflowTimer.findFirst({
    select: { id: true },
    where: {
      timerType: input.timerType,
      workflowTaskId: input.taskId,
    },
  });
  if (existing) return existing.id;

  try {
    const timer = await db.workflowTimer.create({
      data: {
        configurationJson: asJson({
          ...input.configuration,
          entrySequence: input.configuration.entrySequence,
          sourceNodeId: input.sourceNodeId,
          timerType: input.timerType,
        }),
        executeAt: input.executeAt,
        timerType: input.timerType,
        workflowInstanceId: input.instanceId,
        workflowTaskId: input.taskId,
      },
      select: { id: true },
    });
    await writeRuntimeTransitionLog({
      context: input.context,
      db,
      details: {
        executeAt: input.executeAt.toISOString(),
        timerType: input.timerType,
      },
      eventType: "TIMER_CREATED",
      instanceId: input.instanceId,
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.sourceNodeId,
      triggerType: "TIMER_CREATED",
    });
    return timer.id;
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return (
      await db.workflowTimer.findFirstOrThrow({
        select: { id: true },
        where: { timerType: input.timerType, workflowTaskId: input.taskId },
      })
    ).id;
  }
};

export const createWorkflowTaskTimers = async ({
  configuration,
  context,
  db,
  instanceId,
  startedAt,
  sourceNodeId,
  taskId,
  entrySequence,
}: {
  configuration: WorkflowNodeConfiguration;
  context: WorkflowRuntimeContext;
  db: Prisma.TransactionClient;
  instanceId: string;
  startedAt: Date;
  sourceNodeId: string;
  taskId: string;
  entrySequence: number;
}): Promise<{ dueAt: Date | null; timerIds: string[] }> => {
  const schedule = calculateWorkflowTimerSchedule({
    configuration,
    entrySequence,
    sourceNodeId,
    startedAt,
  });
  const timerIds: string[] = [];

  for (const timer of schedule.timers) {
    timerIds.push(
      await createTimerIfMissing(db, {
        configuration: timer.configuration,
        context,
        executeAt: timer.executeAt,
        instanceId,
        sourceNodeId,
        taskId,
        timerType: timer.timerType,
      }),
    );
  }

  await db.workflowTask.update({
    data: { dueAt: schedule.dueAt },
    where: { id: taskId },
  });
  return { dueAt: schedule.dueAt, timerIds };
};

export const calculateWorkflowTimerSchedule = ({
  configuration,
  entrySequence,
  sourceNodeId,
  startedAt,
}: {
  configuration: WorkflowNodeConfiguration;
  entrySequence: number;
  sourceNodeId: string;
  startedAt: Date;
}): {
  dueAt: Date | null;
  timers: Array<{
    configuration: WorkflowTimerConfiguration;
    executeAt: Date;
    timerType: WorkflowTimerType;
  }>;
} => {
  const sla = getSlaForHumanNode(configuration);
  if (!sla) return { dueAt: null, timers: [] };

  const dueAt = calculateWorkflowDeadline({
    duration: sla.duration,
    startedAt,
    unit: sla.unit,
  });
  const baseConfiguration: WorkflowTimerConfiguration = {
    alternateTargetNodeKey: sla.alternateTargetNodeKey ?? null,
    entrySequence,
    reminderThreshold: sla.reminderThreshold,
    unit: sla.unit,
  };
  const timers: Array<{
    configuration: WorkflowTimerConfiguration;
    executeAt: Date;
    timerType: WorkflowTimerType;
  }> = [];

  if (sla.reminderEnabled && sla.reminderThreshold !== null) {
    const executeAt = calculateWorkflowThresholdAt({
      startedAt,
      threshold: sla.reminderThreshold,
      unit: sla.unit,
    });
    if (executeAt) {
      timers.push({
        configuration: baseConfiguration,
        executeAt,
        timerType: "REMINDER",
      });
    }
  }

  timers.push({
    configuration: baseConfiguration,
    executeAt: dueAt,
    timerType: "DUE",
  });

  if (sla.escalationEnabled && sla.escalationThreshold !== null) {
    const escalationAt = calculateWorkflowThresholdAt({
      startedAt,
      threshold: sla.escalationThreshold,
      unit: sla.unit,
    });
    if (escalationAt) {
      timers.push({
        configuration: {
          ...baseConfiguration,
          escalationAreaId: sla.escalationAreaId ?? null,
          escalationMode: sla.escalationMode ?? "NOTIFY_ONLY",
          escalationRoleId: sla.escalationRoleId ?? null,
          escalationStrategy: sla.escalationStrategy ?? "AREA_MANAGER",
          escalationUserId: sla.escalationUserId ?? null,
          sourceNodeId,
        },
        executeAt: escalationAt,
        timerType:
          sla.escalationMode === "ALTERNATE_ROUTE"
            ? "ALTERNATE_ROUTE"
            : "ESCALATION",
      });
    }
  }

  return { dueAt, timers };
};

export const cancelWorkflowTaskTimers = async (
  db: Prisma.TransactionClient,
  taskId: string,
): Promise<number> =>
  (
    await db.workflowTimer.updateMany({
      data: { status: "CANCELLED" },
      where: {
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        workflowTaskId: taskId,
      },
    })
  ).count;

export const cancelWorkflowInstanceTimers = async (
  db: Prisma.TransactionClient,
  instanceId: string,
): Promise<number> =>
  (
    await db.workflowTimer.updateMany({
      data: { status: "CANCELLED" },
      where: {
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        workflowInstanceId: instanceId,
      },
    })
  ).count;

const safeError = (error: unknown): { code: string; message: string } => ({
  code:
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "WORKFLOW_TIMER_FAILED",
  message: (error instanceof Error
    ? error.message
    : "No se pudo procesar el timer."
  ).slice(0, 500),
});

const acquireWorkflowTimerLock = async (): Promise<
  (() => Promise<void>) | null
> => {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + WORKFLOW_TIMER_PROCESSING_TIMEOUT_MS,
  );
  const lockToken = randomUUID();
  const existing = await prisma.scheduledJobLock.findUnique({
    where: { jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME },
  });

  if (!existing) {
    try {
      await prisma.scheduledJobLock.create({
        data: {
          acquiredAt: now,
          expiresAt,
          jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
          lockToken,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      return null;
    }
  } else {
    const claimed = await prisma.scheduledJobLock.updateMany({
      data: { acquiredAt: now, expiresAt, lockToken },
      where: {
        expiresAt: { lte: now },
        jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
      },
    });
    if (claimed.count !== 1) return null;
  }

  return async () => {
    await prisma.scheduledJobLock.deleteMany({
      where: { jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME, lockToken },
    });
  };
};

const getTaskRecipients = async (
  db: Prisma.TransactionClient,
  instanceId: string,
  taskId: string,
) => {
  const recipients = await getWorkflowTaskAssignmentRecipientsForTask(
    db,
    taskId,
  );
  if (recipients.length > 0) return recipients;
  const task = await db.workflowTask.findUnique({
    include: { instance: true },
    where: { id: taskId },
  });
  if (!task) return [];
  return getWorkflowTaskAssignmentRecipients(db, task.workflowInstanceId);
};

type TimerTaskRecord = {
  assignedAreaId: string | null;
  assignedRoleId: string | null;
  assignedUserId: string | null;
  assignmentHistoryJson: Prisma.JsonValue | null;
  assignmentSnapshotJson: Prisma.JsonValue | null;
  comments: string | null;
  entrySequence: number;
  id: string;
  node: {
    id: string;
    name: string;
    nodeKey: string;
    type: string;
    configurationJson: Prisma.JsonValue;
  };
  status: string;
  workflowInstanceId: string;
};

const resolveEscalationRecipients = async ({
  configuration,
  context,
  db,
}: {
  configuration: WorkflowTimerConfiguration;
  context: WorkflowRuntimeContext;
  db: Prisma.TransactionClient;
}) => {
  switch (configuration.escalationStrategy ?? "AREA_MANAGER") {
    case "FIXED_USER":
      return configuration.escalationUserId
        ? db.user.findMany({
            select: { email: true, id: true, name: true },
            where: {
              deletedAt: null,
              id: configuration.escalationUserId,
              isActive: true,
            },
          })
        : [];
    case "ROLE":
      return configuration.escalationRoleId
        ? db.user.findMany({
            select: { email: true, id: true, name: true },
            where: {
              deletedAt: null,
              isActive: true,
              userRoles: { some: { roleId: configuration.escalationRoleId } },
            },
          })
        : [];
    case "SUPERVISOR":
    case "AREA_MANAGER": {
      const areaId = configuration.escalationAreaId ?? context.areaId;
      if (!areaId) return [];
      const area = await db.area.findFirst({
        select: {
          managerUser: { select: { email: true, id: true, name: true } },
        },
        where: { active: true, deletedAt: null, id: areaId },
      });
      return area?.managerUser ? [area.managerUser] : [];
    }
  }
};

const executeEscalation = async ({
  configuration,
  context,
  db,
  instance,
  task,
  timerId,
  now,
}: {
  configuration: WorkflowTimerConfiguration;
  context: WorkflowRuntimeContext;
  db: Prisma.TransactionClient;
  instance: {
    contextJson: Prisma.JsonValue;
    id: string;
    processType: string;
    workflowVersionId: string;
  };
  task: TimerTaskRecord;
  timerId: string;
  now: Date;
}) => {
  let recipients = await resolveEscalationRecipients({
    configuration,
    context,
    db,
  });
  if (recipients.length === 0 && configuration.escalationUserId) {
    recipients = await db.user.findMany({
      select: { email: true, id: true, name: true },
      where: {
        deletedAt: null,
        id: configuration.escalationUserId,
        isActive: true,
      },
    });
  }
  if (recipients.length === 0) {
    const admins = await db.user.findMany({
      select: { email: true, id: true, name: true },
      where: {
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: { role: { name: { in: ["Admin", "Sistemas", "Systems"] } } },
        },
      },
    });
    await createWorkflowNotificationIntent(db, {
      channel: "INTERNAL",
      eventType: "workflow.timer.escalation_failed",
      instanceId: instance.id,
      message: `No se pudo resolver el destinatario de escalamiento para la tarea ${task.node.name}.`,
      priority: NotificationPriority.CRITICAL,
      recipients: admins,
      targetUrl: buildWorkflowInstanceUrl(instance.id),
      title: "Escalamiento requiere configuración",
      taskId: task.id,
      visitSequence: task.entrySequence,
    });
    await writeRuntimeAuditEvent({
      action: "workflow.timer.escalation_failed",
      actor: { userId: null },
      db,
      entityId: timerId,
      entityType: "workflow_timer",
      metadata: {
        instanceId: instance.id,
        reason: "TARGET_MISSING",
        taskId: task.id,
      },
    });
    await writeRuntimeTransitionLog({
      context,
      db,
      details: { reason: "TARGET_MISSING", timerId },
      eventType: "ESCALATION_FAILED",
      instanceId: instance.id,
      targetNodeId: task.node.id,
      triggerType: "SLA_ESCALATION",
    });
    return false;
  }

  const mode = configuration.escalationMode ?? "NOTIFY_ONLY";
  const recipientIds = recipients.map((recipient) => recipient.id);
  await createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    eventType:
      mode === "REASSIGN"
        ? "workflow.task.reassigned"
        : "workflow.timer.escalation_processed",
    instanceId: instance.id,
    message:
      mode === "REASSIGN"
        ? `La tarea “${task.node.name}” fue reasignada por vencimiento del SLA.`
        : `La tarea “${task.node.name}” fue escalada y requiere atención.`,
    priority: NotificationPriority.HIGH,
    recipients,
    targetUrl: buildWorkflowInstanceUrl(instance.id),
    title: mode === "REASSIGN" ? "Tarea reasignada" : "Escalamiento de tarea",
    taskId: `${task.id}:${timerId}`,
    visitSequence: task.entrySequence,
  });

  if (mode === "REASSIGN") {
    const previous = {
      assignedAreaId: task.assignedAreaId,
      assignedRoleId: task.assignedRoleId,
      assignedUserId: task.assignedUserId,
    };
    const next =
      recipients.length === 1
        ? {
            assignedAreaId: null,
            assignedRoleId: null,
            assignedUserId: recipients[0]?.id ?? null,
          }
        : {
            assignedAreaId: null,
            assignedRoleId: configuration.escalationRoleId ?? null,
            assignedUserId: null,
          };
    const history = [
      ...(Array.isArray(task.assignmentHistoryJson)
        ? task.assignmentHistoryJson
        : []),
      {
        actorType: "SYSTEM",
        date: now.toISOString(),
        next,
        previous,
        reason: "SLA_ESCALATION",
      },
    ];
    await db.workflowTask.update({
      data: {
        assignedAreaId: next.assignedAreaId,
        assignedRoleId: next.assignedRoleId,
        assignedUserId: next.assignedUserId,
        assignmentHistoryJson: asJson(history),
      },
      where: { id: task.id },
    });
    await writeRuntimeTransitionLog({
      context,
      db,
      details: { mode, next, previous, recipientIds, timerId },
      eventType: "TASK_REASSIGNED",
      instanceId: instance.id,
      targetNodeId: task.node.id,
      triggerType: "SLA_ESCALATION",
    });
    await writeRuntimeAuditEvent({
      action: "workflow.task.reassigned",
      actor: { userId: null },
      db,
      entityId: task.id,
      entityType: "workflow_task",
      metadata: { instanceId: instance.id, timerId, reason: "SLA_ESCALATION" },
      newValues: next,
      oldValues: previous,
    });
  } else {
    await writeRuntimeTransitionLog({
      context,
      db,
      details: { mode, recipientIds, timerId },
      eventType: "ESCALATION_EXECUTED",
      instanceId: instance.id,
      targetNodeId: task.node.id,
      triggerType: "SLA_ESCALATION",
    });
    await writeRuntimeAuditEvent({
      action: "workflow.timer.escalation_processed",
      actor: { userId: null },
      db,
      entityId: timerId,
      entityType: "workflow_timer",
      metadata: { instanceId: instance.id, taskId: task.id, mode },
    });
  }
  return true;
};

const executeAlternateRoute = async ({
  configuration,
  context,
  db,
  instance,
  task,
  timerId,
  now,
}: Parameters<typeof executeEscalation>[0]) => {
  if (!configuration.alternateTargetNodeKey) {
    throw Object.assign(
      new Error("No se configuró una ruta alternativa para el SLA."),
      {
        code: "WORKFLOW_ALTERNATE_ROUTE_MISSING",
      },
    );
  }
  const graph = await loadPinnedWorkflowGraph(db, instance.workflowVersionId);
  const target = graph.nodes.find(
    (node) => node.nodeKey === configuration.alternateTargetNodeKey,
  );
  if (!target) {
    throw Object.assign(
      new Error("La ruta alternativa del SLA no existe en la versión fijada."),
      {
        code: "WORKFLOW_ALTERNATE_ROUTE_INVALID",
      },
    );
  }
  await db.workflowTask.update({
    data: { completedAt: now, status: "EXPIRED" },
    where: { id: task.id },
  });
  await cancelWorkflowTaskTimers(db, task.id);
  await db.workflowInstance.update({
    data: { currentNodeId: target.id, lastExecutionAt: now, status: "ACTIVE" },
    where: { id: instance.id },
  });
  await writeRuntimeTransitionLog({
    context,
    db,
    details: { targetNodeKey: target.nodeKey, timerId },
    eventType: "ALTERNATE_ROUTE_EXECUTED",
    instanceId: instance.id,
    sourceNodeId: task.node.id,
    targetNodeId: target.id,
    triggerType: "SLA_ESCALATION",
  });
  const { executeAutomaticNodes } =
    await import("./workflow-runtime.service.js");
  await executeAutomaticNodes({ db, instanceId: instance.id, now });
};

const processClaimedTimer = async (timerId: string, now: Date) => {
  const outcome = await prisma.$transaction(async (db) => {
    const timer = await db.workflowTimer.findUnique({
      include: {
        instance: {
          select: {
            contextJson: true,
            id: true,
            processType: true,
            status: true,
            workflowVersionId: true,
          },
        },
        task: {
          include: {
            node: {
              select: {
                configurationJson: true,
                id: true,
                name: true,
                nodeKey: true,
                type: true,
              },
            },
          },
        },
      },
      where: { id: timerId },
    });
    if (!timer || timer.status !== "PROCESSING")
      return { status: "SKIPPED" as const, emailsSent: 0 };
    if (
      ["COMPLETED", "REJECTED", "CANCELLED", "FAILED"].includes(
        timer.instance.status,
      )
    ) {
      await db.workflowTimer.update({
        data: { status: "CANCELLED" },
        where: { id: timerId },
      });
      return { status: "SKIPPED" as const, emailsSent: 0 };
    }
    const task = timer.task as TimerTaskRecord | null;
    if (!task || !["PENDING", "IN_PROGRESS"].includes(task.status)) {
      await db.workflowTimer.update({
        data: { status: "CANCELLED" },
        where: { id: timerId },
      });
      return { status: "SKIPPED" as const, emailsSent: 0 };
    }
    const configuration = configRecord(timer.configurationJson);
    const context = restoreWorkflowRuntimeContext(
      timer.instance.processType,
      timer.instance.contextJson,
    );
    if (
      configuration.entrySequence &&
      configuration.entrySequence !== task.entrySequence
    ) {
      await db.workflowTimer.update({
        data: { status: "CANCELLED" },
        where: { id: timerId },
      });
      return { status: "SKIPPED" as const, emailsSent: 0 };
    }

    const recipients = await getTaskRecipients(db, timer.instance.id, task.id);
    if (!isTimerType(timer.timerType)) {
      throw Object.assign(new Error("Tipo de timer no soportado."), {
        code: "WORKFLOW_TIMER_TYPE_INVALID",
      });
    }
    if (timer.timerType === "REMINDER") {
      await createWorkflowReminderNotification({
        db,
        instance: timer.instance,
        recipients,
        task: {
          id: task.id,
          nodeName: task.node.name,
          visitSequence: task.entrySequence,
        },
        timerId,
      });
      await writeRuntimeTransitionLog({
        context,
        db,
        details: { timerId },
        eventType: "REMINDER_SENT",
        instanceId: timer.instance.id,
        targetNodeId: task.node.id,
        triggerType: "SLA_TIMER",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.timer.reminder_processed",
        actor: { userId: null },
        db,
        entityId: timerId,
        entityType: "workflow_timer",
        metadata: { instanceId: timer.instance.id, taskId: task.id },
      });
    } else if (timer.timerType === "DUE") {
      await createWorkflowOverdueNotification({
        db,
        instance: timer.instance,
        recipients,
        task: {
          id: task.id,
          nodeName: task.node.name,
          visitSequence: task.entrySequence,
        },
        timerId,
      });
      await writeRuntimeTransitionLog({
        context,
        db,
        details: { dueAt: timer.executeAt.toISOString(), timerId },
        eventType: "SLA_OVERDUE",
        instanceId: timer.instance.id,
        targetNodeId: task.node.id,
        triggerType: "SLA_TIMER",
      });
      await writeRuntimeAuditEvent({
        action: "workflow.timer.due_processed",
        actor: { userId: null },
        db,
        entityId: timerId,
        entityType: "workflow_timer",
        metadata: { instanceId: timer.instance.id, taskId: task.id },
      });
    } else if (timer.timerType === "ALTERNATE_ROUTE") {
      await executeAlternateRoute({
        configuration,
        context,
        db,
        instance: timer.instance,
        task,
        timerId,
        now,
      });
    } else {
      const escalationSucceeded = await executeEscalation({
        configuration,
        context,
        db,
        instance: timer.instance,
        task,
        timerId,
        now,
      });
      if (!escalationSucceeded) {
        const errorMessage =
          "No se pudo resolver el destinatario de escalamiento.";
        await db.workflowTimer.update({
          data: { lastError: errorMessage, status: "FAILED" },
          where: { id: timerId },
        });
        return {
          error: errorMessage,
          status: "FAILED" as const,
          emailsSent: 0,
        };
      }
    }

    await db.workflowTimer.update({
      data: { executedAt: now, lastError: null, status: "COMPLETED" },
      where: { id: timerId },
    });
    return { status: "COMPLETED" as const, emailsSent: 0 };
  });

  if (outcome.status === "COMPLETED") {
    const deliveryResults = await (
      await import("./workflow-notification.service.js")
    ).deliverWorkflowNotificationsForInstance(
      (
        await prisma.workflowTimer.findUnique({
          select: { workflowInstanceId: true },
          where: { id: timerId },
        })
      )?.workflowInstanceId ?? "",
    );
    return {
      ...outcome,
      emailsSent: deliveryResults.filter(
        (result) => result.status === "SENT" && result.attempted,
      ).length,
    };
  }
  return outcome;
};

const claimDueTimerIds = async (
  now: Date,
  batchLimit: number,
): Promise<string[]> => {
  await prisma.workflowTimer.updateMany({
    data: { status: "PENDING" },
    where: {
      attempts: { lt: WORKFLOW_TIMER_MAX_ATTEMPTS },
      lastAttemptAt: {
        lt: new Date(now.getTime() - WORKFLOW_TIMER_PROCESSING_TIMEOUT_MS),
      },
      status: "PROCESSING",
    },
  });
  const candidates = await prisma.workflowTimer.findMany({
    orderBy: [{ executeAt: "asc" }, { id: "asc" }],
    select: { id: true },
    take: batchLimit,
    where: {
      executeAt: { lte: now },
      OR: [
        { status: "PENDING" },
        { attempts: { lt: WORKFLOW_TIMER_MAX_ATTEMPTS }, status: "FAILED" },
      ],
    },
  });
  const claimed: string[] = [];
  for (const candidate of candidates) {
    const result = await prisma.workflowTimer.updateMany({
      data: { lastAttemptAt: now, status: "PROCESSING" },
      where: {
        id: candidate.id,
        attempts: { lt: WORKFLOW_TIMER_MAX_ATTEMPTS },
        status: { in: ["PENDING", "FAILED"] },
      },
    });
    if (result.count === 1) {
      await prisma.workflowTimer.update({
        data: { attempts: { increment: 1 } },
        where: { id: candidate.id },
      });
      claimed.push(candidate.id);
    }
  }
  return claimed;
};

export const processPendingWorkflowTimers = async (input?: {
  batchLimit?: number;
  now?: Date;
}): Promise<WorkflowTimerProcessorSummary> => {
  const startedAt = input?.now ?? new Date();
  const batchLimit = Math.max(1, Math.min(500, input?.batchLimit ?? 100));
  const candidates = await prisma.workflowTimer.count({
    where: { executeAt: { lte: startedAt } },
  });
  const claimed = await claimDueTimerIds(startedAt, batchLimit);
  const summary: WorkflowTimerProcessorSummary = {
    batchLimit,
    claimedCount: claimed.length,
    completedCount: 0,
    examinedCount: candidates,
    failedCount: 0,
    failures: [],
    finishedAt: "",
    jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
    skippedCount: 0,
    startedAt: startedAt.toISOString(),
    emailsSent: 0,
    lockSkipped: false,
  };
  for (const timerId of claimed) {
    try {
      const result = await processClaimedTimer(timerId, startedAt);
      if (result.status === "COMPLETED") summary.completedCount += 1;
      else if (result.status === "FAILED") {
        summary.failedCount += 1;
        summary.failures.push({
          errorCode: "WORKFLOW_ESCALATION_TARGET_MISSING",
          message: result.error ?? "No se pudo procesar el timer.",
          timerId,
        });
      } else summary.skippedCount += 1;
      summary.emailsSent += result.emailsSent;
    } catch (error) {
      const failure = safeError(error);
      summary.failedCount += 1;
      summary.failures.push({
        errorCode: failure.code,
        message: failure.message,
        timerId,
      });
      await prisma.workflowTimer
        .update({
          data: { lastError: failure.message, status: "FAILED" },
          where: { id: timerId },
        })
        .catch(() => undefined);
      logger.error("Workflow timer failed.", {
        errorCode: failure.code,
        timerId,
      });
    }
  }
  summary.finishedAt = new Date().toISOString();
  return summary;
};

export const workflowTimerService = {
  async listTimers(query: {
    page: number;
    perPage: number;
    status?: string | undefined;
  }) {
    const where = query.status ? { status: query.status as never } : {};
    const [total, timers] = await prisma.$transaction([
      prisma.workflowTimer.count({ where }),
      prisma.workflowTimer.findMany({
        include: {
          instance: {
            select: {
              entityId: true,
              entityType: true,
              id: true,
              processType: true,
              status: true,
            },
          },
          task: {
            select: {
              dueAt: true,
              id: true,
              node: { select: { id: true, name: true, nodeKey: true } },
            },
          },
        },
        orderBy: [{ executeAt: "asc" }, { id: "asc" }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);
    return {
      data: timers.map((timer) => ({
        ...timer,
        createdAt: timer.createdAt.toISOString(),
        executeAt: timer.executeAt.toISOString(),
        executedAt: timer.executedAt?.toISOString() ?? null,
        lastAttemptAt: timer.lastAttemptAt?.toISOString() ?? null,
        task: timer.task
          ? { ...timer.task, dueAt: timer.task.dueAt?.toISOString() ?? null }
          : null,
        updatedAt: timer.updatedAt.toISOString(),
      })),
      pagination: { page: query.page, perPage: query.perPage, total },
    };
  },

  async retryTimer(timerId: string) {
    const result = await prisma.workflowTimer.updateMany({
      data: {
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        status: "PENDING",
      },
      where: { id: timerId, status: "FAILED" },
    });
    if (result.count === 0) {
      const timer = await prisma.workflowTimer.findUnique({
        select: { id: true, status: true },
        where: { id: timerId },
      });
      if (!timer)
        throw new AppError("No se encontró el timer solicitado.", 404);
      throw new AppError("Solo se pueden reintentar timers fallidos.", 409);
    }
    return prisma.workflowTimer.findUniqueOrThrow({
      select: {
        attempts: true,
        executeAt: true,
        id: true,
        lastError: true,
        status: true,
        timerType: true,
        workflowInstanceId: true,
        workflowTaskId: true,
      },
      where: { id: timerId },
    });
  },

  async run(
    options: {
      triggeredBy: "CRON" | "USER" | "SYSTEM";
      triggeredByUserId?: string;
      batchLimit?: number;
    } = { triggeredBy: "SYSTEM" },
  ) {
    const startedAt = new Date();
    const releaseLock = await acquireWorkflowTimerLock();
    if (!releaseLock) {
      return {
        batchLimit: options.batchLimit ?? env.WORKFLOW_TIMER_BATCH_SIZE,
        claimedCount: 0,
        completedCount: 0,
        examinedCount: 0,
        failedCount: 0,
        failures: [],
        finishedAt: new Date().toISOString(),
        jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
        lockSkipped: true,
        skippedCount: 0,
        startedAt: startedAt.toISOString(),
        emailsSent: 0,
      } satisfies WorkflowTimerProcessorSummary;
    }
    let executionId: string | null = null;
    try {
      const execution = await prisma.scheduledJobExecution.create({
        data: {
          jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME,
          startedAt,
          status: ScheduledJobExecutionStatus.RUNNING,
          triggeredBy: options.triggeredBy as ScheduledJobTrigger,
          ...(options.triggeredByUserId
            ? { triggeredByUserId: options.triggeredByUserId }
            : {}),
        },
      });
      executionId = execution.id;
      const summary = await processPendingWorkflowTimers({
        batchLimit: options.batchLimit ?? env.WORKFLOW_TIMER_BATCH_SIZE,
        now: startedAt,
      });
      const deliveryResults =
        await deliverPendingWorkflowNotificationDeliveries(
          options.batchLimit ?? env.WORKFLOW_TIMER_BATCH_SIZE,
        );
      summary.emailsSent += deliveryResults.filter(
        (result) =>
          result.status === NotificationDeliveryStatus.SENT && result.attempted,
      ).length;
      const deliveryFailures = deliveryResults.filter(
        (result) => result.status === NotificationDeliveryStatus.FAILED,
      );
      summary.failedCount += deliveryFailures.length;
      summary.failures.push(
        ...deliveryFailures.map((result) => ({
          errorCode: "WORKFLOW_NOTIFICATION_EMAIL_FAILED",
          message:
            result.error ??
            "No fue posible entregar una notificación de workflow.",
          timerId: result.deliveryId,
        })),
      );
      summary.lockSkipped = false;
      await prisma.scheduledJobExecution.update({
        data: {
          detailsJson: asJson(summary),
          emailsSent: summary.emailsSent,
          failuresCount: summary.failedCount,
          finishedAt: new Date(),
          notificationsCreated: summary.completedCount,
          processedCount: summary.examinedCount,
          status:
            summary.failedCount > 0
              ? ScheduledJobExecutionStatus.PARTIAL
              : ScheduledJobExecutionStatus.SUCCESS,
        },
        where: { id: execution.id },
      });
      return { ...summary, executionId: execution.id };
    } catch (error) {
      const failure = safeError(error);
      if (executionId) {
        await prisma.scheduledJobExecution.update({
          data: {
            errorMessage: failure.message,
            finishedAt: new Date(),
            failuresCount: 1,
            status: ScheduledJobExecutionStatus.FAILED,
          },
          where: { id: executionId },
        });
      }
      throw error;
    } finally {
      await releaseLock();
    }
  },

  async listExecutions(page: number, perPage: number) {
    const [total, data] = await prisma.$transaction([
      prisma.scheduledJobExecution.count({
        where: { jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME },
      }),
      prisma.scheduledJobExecution.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        where: { jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME },
      }),
    ]);
    return {
      data: data.map((execution) => ({
        ...execution,
        createdAt: execution.createdAt.toISOString(),
        finishedAt: execution.finishedAt?.toISOString() ?? null,
        startedAt: execution.startedAt.toISOString(),
      })),
      pagination: { page, perPage, total },
    };
  },

  async getLatestExecution() {
    const execution = await prisma.scheduledJobExecution.findFirst({
      orderBy: { startedAt: "desc" },
      where: { jobName: WORKFLOW_TIMER_PROCESSOR_JOB_NAME },
    });
    return execution
      ? {
          ...execution,
          createdAt: execution.createdAt.toISOString(),
          finishedAt: execution.finishedAt?.toISOString() ?? null,
          startedAt: execution.startedAt.toISOString(),
        }
      : null;
  },
};

export const workflowTimerDisplayState = (input: {
  dueAt: Date | null;
  now?: Date;
  reminderAt?: Date | null;
}) => {
  const now = input.now ?? new Date();
  const dueSoonAt =
    input.reminderAt ??
    new Date(now.getTime() + WORKFLOW_DEFAULT_DUE_SOON_HOURS * 3_600_000);
  return getWorkflowSlaState({ dueAt: input.dueAt, dueSoonAt, now });
};
