import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  NotificationType,
  type Prisma,
} from "../../../generated/prisma/client.js";

import { emailService } from "../../emails/EmailService.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../utils/prisma.js";
import { toLogJsonValue } from "../../services/logging-utils.js";
import type { WorkflowRuntimeContext } from "./workflow-runtime-context.js";
import { restoreWorkflowRuntimeContext } from "./workflow-runtime-context.js";
import {
  writeRuntimeAuditEvent,
  writeRuntimeTransitionLog,
} from "./workflow-runtime-events.js";
import type { WorkflowNodeConfiguration } from "./workflows.validators.js";

type WorkflowNotificationDb = Prisma.TransactionClient;

export type WorkflowNotificationRecipient = {
  email: string;
  id: string;
  name: string;
};

export type WorkflowNotificationChannel = "INTERNAL" | "EMAIL" | "BOTH";

export type WorkflowNotificationEvent = {
  actionRequired?: string;
  channel?: WorkflowNotificationChannel;
  entityId?: string;
  entityType?: string;
  eventType: string;
  instanceId: string;
  message: string;
  priority?: NotificationPriority;
  recipients: WorkflowNotificationRecipient[];
  targetUrl?: string | null;
  title: string;
  taskId?: string | null;
  visitSequence?: number | null;
};

type DeliveryOutcome = {
  attempted: boolean;
  deliveryId: string;
  error?: string;
  status: NotificationDeliveryStatus;
};

const WORKFLOW_NOTIFICATION_MAX_ATTEMPTS = 3;
const WORKFLOW_NOTIFICATION_RETRY_DELAY_MS = 5 * 60_000;
const WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS = 15 * 60_000;

const asJson = (value: unknown): Prisma.InputJsonValue =>
  toLogJsonValue(value) ?? {};

const dedupePrefix = (event: WorkflowNotificationEvent): string =>
  [
    "workflow",
    event.eventType,
    event.instanceId,
    event.taskId ?? "instance",
    event.visitSequence ?? "0",
  ].join(":");

export const buildWorkflowNotificationDedupeKey = (
  event: WorkflowNotificationEvent,
  recipientId: string,
  channel: "IN_APP" | "EMAIL",
): string => `${dedupePrefix(event)}:${recipientId}:${channel}`;

const safeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "Error de entrega";
  return message.slice(0, 500);
};

const uniqueRecipients = (
  recipients: WorkflowNotificationRecipient[],
): WorkflowNotificationRecipient[] => {
  const byId = new Map<string, WorkflowNotificationRecipient>();
  for (const recipient of recipients) {
    if (recipient.id) byId.set(recipient.id, recipient);
  }
  return [...byId.values()];
};

const createNotificationIfMissing = async (
  db: WorkflowNotificationDb,
  input: {
    dedupeKey: string;
    entityId: string;
    entityType: string;
    eventType: string;
    message: string;
    priority: NotificationPriority;
    targetUrl: string | null;
    title: string;
    userId: string;
  },
) => {
  const existing = await db.notification.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (existing) return existing;

  try {
    return await db.notification.create({
      data: {
        dedupeKey: input.dedupeKey,
        entityId: input.entityId,
        entityType: input.entityType,
        eventType: input.eventType,
        message: input.message,
        priority: input.priority,
        targetUrl: input.targetUrl,
        title: input.title,
        type:
          input.priority === NotificationPriority.CRITICAL
            ? NotificationType.ERROR
            : input.priority === NotificationPriority.HIGH
              ? NotificationType.WARNING
              : NotificationType.INFO,
        userId: input.userId,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return db.notification.findUniqueOrThrow({
      where: { dedupeKey: input.dedupeKey },
    });
  }
};

const createDeliveryIfMissing = async (
  db: WorkflowNotificationDb,
  input: {
    channel: NotificationDeliveryChannel;
    dedupeKey: string;
    notificationId: string;
    recipient: WorkflowNotificationRecipient;
  },
) => {
  const existing = await db.notificationDelivery.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (existing) return existing;

  try {
    return await db.notificationDelivery.create({
      data: {
        channel: input.channel,
        dedupeKey: input.dedupeKey,
        notificationId: input.notificationId,
        recipientEmail: input.recipient.email,
        recipientUserId: input.recipient.id,
        status:
          input.channel === NotificationDeliveryChannel.IN_APP
            ? NotificationDeliveryStatus.SENT
            : NotificationDeliveryStatus.PENDING,
        ...(input.channel === NotificationDeliveryChannel.IN_APP
          ? { sentAt: new Date() }
          : {}),
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return db.notificationDelivery.findUniqueOrThrow({
      where: { dedupeKey: input.dedupeKey },
    });
  }
};

const getUserRecipients = async (
  db: WorkflowNotificationDb,
  userIds: string[],
): Promise<WorkflowNotificationRecipient[]> => {
  if (userIds.length === 0) return [];
  return db.user.findMany({
    select: { email: true, id: true, name: true },
    where: {
      deletedAt: null,
      id: { in: [...new Set(userIds)] },
      isActive: true,
    },
  });
};

const getRoleRecipients = async (
  db: WorkflowNotificationDb,
  roleId: string,
): Promise<WorkflowNotificationRecipient[]> =>
  db.user.findMany({
    select: { email: true, id: true, name: true },
    where: {
      deletedAt: null,
      isActive: true,
      userRoles: { some: { roleId } },
    },
  });

const getAreaManager = async (
  db: WorkflowNotificationDb,
  areaId: string,
): Promise<WorkflowNotificationRecipient[]> => {
  const area = await db.area.findFirst({
    select: { managerUser: { select: { email: true, id: true, name: true } } },
    where: { active: true, deletedAt: null, id: areaId },
  });
  return area?.managerUser ? [area.managerUser] : [];
};

const getPreviousApprover = async (
  db: WorkflowNotificationDb,
  instanceId: string,
): Promise<WorkflowNotificationRecipient[]> => {
  const transition = await db.workflowTransitionLog.findFirst({
    orderBy: { createdAt: "desc" },
    select: { performedBy: { select: { email: true, id: true, name: true } } },
    where: {
      instanceId,
      performedById: { not: null },
    },
  });
  return transition?.performedBy ? [transition.performedBy] : [];
};

const getCurrentAssignmentRecipients = async (
  db: WorkflowNotificationDb,
  instanceId: string,
): Promise<WorkflowNotificationRecipient[]> => {
  const task = await db.workflowTask.findFirst({
    include: {
      assignedArea: {
        include: {
          managerUser: { select: { email: true, id: true, name: true } },
        },
      },
      assignedRole: true,
      assignedUser: { select: { email: true, id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    where: { workflowInstanceId: instanceId },
  });
  if (!task) return [];
  if (task.assignedUser) return [task.assignedUser];
  if (task.assignedRole) return getRoleRecipients(db, task.assignedRole.id);
  if (task.assignedArea?.managerUser) return [task.assignedArea.managerUser];
  return [];
};

export const getWorkflowTaskAssignmentRecipients =
  getCurrentAssignmentRecipients;

const getAssignmentRecipientsForTask = async (
  db: WorkflowNotificationDb,
  taskId: string,
): Promise<WorkflowNotificationRecipient[]> => {
  const task = await db.workflowTask.findUnique({
    include: {
      assignedArea: {
        include: {
          managerUser: { select: { email: true, id: true, name: true } },
        },
      },
      assignedRole: true,
      assignedUser: { select: { email: true, id: true, name: true } },
    },
    where: { id: taskId },
  });
  if (!task) return [];
  if (task.assignedUser) return [task.assignedUser];
  if (task.assignedRole) return getRoleRecipients(db, task.assignedRole.id);
  if (task.assignedArea?.managerUser) return [task.assignedArea.managerUser];
  return [];
};

export const getWorkflowTaskAssignmentRecipientsForTask =
  getAssignmentRecipientsForTask;

export const getWorkflowParticipantRecipients = async ({
  context,
  db,
  instanceId,
}: {
  context: WorkflowRuntimeContext;
  db: WorkflowNotificationDb;
  instanceId: string;
}): Promise<WorkflowNotificationRecipient[]> => {
  const recipients = [
    ...(context.requesterUserId
      ? await getUserRecipients(db, [context.requesterUserId])
      : []),
    ...(await getCurrentAssignmentRecipients(db, instanceId)),
    ...(await getPreviousApprover(db, instanceId)),
  ];
  return uniqueRecipients(recipients);
};

export const resolveWorkflowNotificationRecipients = async ({
  db,
  instanceId,
  configuration,
  context,
}: {
  db: WorkflowNotificationDb;
  instanceId: string;
  configuration: Extract<
    WorkflowNodeConfiguration,
    { nodeType: "NOTIFICATION" }
  >;
  context: WorkflowRuntimeContext;
}): Promise<WorkflowNotificationRecipient[]> => {
  switch (configuration.recipientStrategy) {
    case "CURRENT_ASSIGNEE":
      return getCurrentAssignmentRecipients(db, instanceId);
    case "REQUESTER":
      return getUserRecipients(
        db,
        context.requesterUserId ? [context.requesterUserId] : [],
      );
    case "PREVIOUS_APPROVER":
      return getPreviousApprover(db, instanceId);
    case "FIXED_USER":
      return getUserRecipients(
        db,
        configuration.recipientUserId ? [configuration.recipientUserId] : [],
      );
    case "ROLE":
      return configuration.recipientRoleId
        ? getRoleRecipients(db, configuration.recipientRoleId)
        : [];
    case "AREA_MANAGER":
      return getAreaManager(
        db,
        configuration.recipientAreaId ?? context.areaId ?? "",
      );
    case "OBSERVATION_RESPONSIBLE":
      return getUserRecipients(
        db,
        context.responsibleUserId ? [context.responsibleUserId] : [],
      );
  }
};

export const createWorkflowNotificationIntent = async (
  db: WorkflowNotificationDb,
  event: WorkflowNotificationEvent,
): Promise<{ createdDeliveries: string[]; recipientCount: number }> => {
  const recipients = uniqueRecipients(event.recipients);
  const channel = event.channel ?? "INTERNAL";
  const baseKey = dedupePrefix(event);
  const entityId = event.entityId ?? event.instanceId;
  const entityType = event.entityType ?? "workflow_instance";
  const priority = event.priority ?? NotificationPriority.NORMAL;
  const targetUrl =
    event.targetUrl ?? `/configuracion/flujos/instancias/${event.instanceId}`;
  const createdDeliveries: string[] = [];

  for (const recipient of recipients) {
    const notification = await createNotificationIfMissing(db, {
      dedupeKey: `${baseKey}:${recipient.id}:notification`,
      entityId,
      entityType,
      eventType: event.eventType,
      message: event.message,
      priority,
      targetUrl,
      title: event.title,
      userId: recipient.id,
    });

    if (channel === "INTERNAL" || channel === "BOTH") {
      const delivery = await createDeliveryIfMissing(db, {
        channel: NotificationDeliveryChannel.IN_APP,
        dedupeKey: buildWorkflowNotificationDedupeKey(
          event,
          recipient.id,
          "IN_APP",
        ),
        notificationId: notification.id,
        recipient,
      });
      createdDeliveries.push(delivery.id);
    }

    if ((channel === "EMAIL" || channel === "BOTH") && recipient.email) {
      const delivery = await createDeliveryIfMissing(db, {
        channel: NotificationDeliveryChannel.EMAIL,
        dedupeKey: buildWorkflowNotificationDedupeKey(
          event,
          recipient.id,
          "EMAIL",
        ),
        notificationId: notification.id,
        recipient,
      });
      createdDeliveries.push(delivery.id);
    }
  }

  return { createdDeliveries, recipientCount: recipients.length };
};

const markDeliveryFailed = async (deliveryId: string, error: unknown) => {
  const message = safeErrorMessage(error);
  await prisma.notificationDelivery.update({
    data: {
      errorMessage: message,
      lastAttemptAt: new Date(),
      status: NotificationDeliveryStatus.FAILED,
    },
    where: { id: deliveryId },
  });
  return message;
};

const recordNotificationFailure = async (
  deliveryId: string,
  message: string,
) => {
  try {
    const delivery = await prisma.notificationDelivery.findUnique({
      include: { notification: true },
      where: { id: deliveryId },
    });
    if (!delivery?.notification) return;

    const notification = delivery.notification;
    if (!notification.entityId) return;
    let instanceId =
      notification.entityType === "workflow_instance"
        ? notification.entityId
        : notification.entityType === "workflow_task"
          ? ((
              await prisma.workflowTask.findUnique({
                select: { workflowInstanceId: true },
                where: { id: notification.entityId },
              })
            )?.workflowInstanceId ?? null)
          : null;
    if (!instanceId && notification.dedupeKey?.startsWith("workflow:")) {
      instanceId = notification.dedupeKey.split(":")[2] ?? null;
    }
    if (!instanceId) return;

    const instance = await prisma.workflowInstance.findUnique({
      select: { contextJson: true, processType: true },
      where: { id: instanceId },
    });
    if (!instance) return;

    const db = prisma as unknown as Prisma.TransactionClient;
    const context = restoreWorkflowRuntimeContext(
      instance.processType,
      instance.contextJson,
    );
    await writeRuntimeTransitionLog({
      context,
      db,
      details: { deliveryId, message },
      eventType: "NOTIFICATION_FAILED",
      instanceId,
      triggerType: "NOTIFICATION_DELIVERY",
    });
    await writeRuntimeAuditEvent({
      action: "workflow.notification.failed",
      actor: { userId: null },
      db,
      entityId: deliveryId,
      entityType: "notification_delivery",
      metadata: { instanceId, message },
    });
  } catch (failure) {
    logger.warn("Could not record workflow notification failure event.", {
      deliveryId,
      errorCode: "WORKFLOW_NOTIFICATION_FAILURE_EVENT_FAILED",
      message: safeErrorMessage(failure),
    });
  }
};

export const deliverWorkflowNotificationDelivery = async (
  deliveryId: string,
): Promise<DeliveryOutcome> => {
  const delivery = await prisma.notificationDelivery.findUnique({
    include: {
      notification: true,
      recipientUser: {
        select: { email: true, id: true, isActive: true, name: true },
      },
    },
    where: { id: deliveryId },
  });
  if (!delivery) {
    return {
      attempted: false,
      deliveryId,
      status: NotificationDeliveryStatus.SKIPPED,
    };
  }
  if (delivery.status === NotificationDeliveryStatus.SENT) {
    return { attempted: false, deliveryId, status: delivery.status };
  }
  if (
    delivery.status === NotificationDeliveryStatus.FAILED &&
    delivery.attempts >= WORKFLOW_NOTIFICATION_MAX_ATTEMPTS
  ) {
    return { attempted: false, deliveryId, status: delivery.status };
  }
  if (delivery.channel !== NotificationDeliveryChannel.EMAIL) {
    return { attempted: false, deliveryId, status: delivery.status };
  }
  if (!delivery.recipientUser?.isActive || !delivery.recipientUser.email) {
    await prisma.notificationDelivery.update({
      data: {
        errorMessage: "El destinatario no está activo o no tiene correo.",
        lastAttemptAt: new Date(),
        status: NotificationDeliveryStatus.SKIPPED,
      },
      where: { id: deliveryId },
    });
    return {
      attempted: false,
      deliveryId,
      status: NotificationDeliveryStatus.SKIPPED,
    };
  }

  const claimNow = new Date();
  const claimed = await prisma.notificationDelivery.updateMany({
    data: {
      attempts: { increment: 1 },
      lastAttemptAt: claimNow,
      status: NotificationDeliveryStatus.PENDING,
    },
    where: {
      id: deliveryId,
      attempts: { lt: WORKFLOW_NOTIFICATION_MAX_ATTEMPTS },
      OR: [
        {
          lastAttemptAt: null,
          status: NotificationDeliveryStatus.PENDING,
        },
        {
          lastAttemptAt: {
            lt: new Date(
              claimNow.getTime() - WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS,
            ),
          },
          status: NotificationDeliveryStatus.PENDING,
        },
        {
          lastAttemptAt: {
            lt: new Date(
              claimNow.getTime() - WORKFLOW_NOTIFICATION_RETRY_DELAY_MS,
            ),
          },
          status: NotificationDeliveryStatus.FAILED,
        },
      ],
    },
  });
  if (claimed.count !== 1) {
    const current = await prisma.notificationDelivery.findUnique({
      select: { status: true },
      where: { id: deliveryId },
    });
    return {
      attempted: false,
      deliveryId,
      status: current?.status ?? NotificationDeliveryStatus.SKIPPED,
    };
  }

  const result = await emailService.sendTemplate({
    template: "genericNotification",
    to: delivery.recipientUser.email,
    variables: {
      ...(delivery.notification?.targetUrl
        ? {
            actionLabel: "Abrir en NIBOL",
            actionLink: delivery.notification.targetUrl,
          }
        : {}),
      message:
        delivery.notification?.message ?? "Tiene una notificación pendiente.",
      title: delivery.notification?.title ?? "Notificación de workflow",
      userName: delivery.recipientUser.name,
    },
  });

  if (!result.success) {
    const error = await markDeliveryFailed(
      deliveryId,
      result.error ?? "No fue posible enviar el correo.",
    );
    await recordNotificationFailure(deliveryId, error);
    logger.warn("Workflow notification email failed.", {
      deliveryId,
      errorCode: "WORKFLOW_NOTIFICATION_EMAIL_FAILED",
    });
    return {
      attempted: true,
      deliveryId,
      error,
      status: NotificationDeliveryStatus.FAILED,
    };
  }

  await prisma.notificationDelivery.update({
    data: {
      errorMessage: null,
      sentAt: new Date(),
      status: NotificationDeliveryStatus.SENT,
    },
    where: { id: deliveryId },
  });
  return {
    attempted: true,
    deliveryId,
    status: NotificationDeliveryStatus.SENT,
  };
};

export const deliverWorkflowNotificationsForInstance = async (
  instanceId: string,
): Promise<DeliveryOutcome[]> => {
  const taskIds = (
    await prisma.workflowTask.findMany({
      select: { id: true },
      where: { workflowInstanceId: instanceId },
    })
  ).map((task) => task.id);
  const deliveries = await prisma.notificationDelivery.findMany({
    select: { id: true },
    where: {
      channel: NotificationDeliveryChannel.EMAIL,
      attempts: { lt: WORKFLOW_NOTIFICATION_MAX_ATTEMPTS },
      notification: {
        OR: [
          { entityId: instanceId, entityType: "workflow_instance" },
          ...(taskIds.length > 0
            ? [{ entityId: { in: taskIds }, entityType: "workflow_task" }]
            : []),
        ],
      },
      status: {
        in: [
          NotificationDeliveryStatus.PENDING,
          NotificationDeliveryStatus.FAILED,
        ],
      },
      OR: [
        { lastAttemptAt: null, status: NotificationDeliveryStatus.PENDING },
        {
          lastAttemptAt: {
            lt: new Date(Date.now() - WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS),
          },
          status: NotificationDeliveryStatus.PENDING,
        },
        {
          lastAttemptAt: {
            lt: new Date(Date.now() - WORKFLOW_NOTIFICATION_RETRY_DELAY_MS),
          },
          status: NotificationDeliveryStatus.FAILED,
        },
      ],
    },
  });
  const outcomes: DeliveryOutcome[] = [];
  for (const delivery of deliveries) {
    outcomes.push(await deliverWorkflowNotificationDelivery(delivery.id));
  }
  return outcomes;
};

export const deliverPendingWorkflowNotificationDeliveries = async (
  limit = 100,
): Promise<DeliveryOutcome[]> => {
  const deliveries = await prisma.notificationDelivery.findMany({
    select: { id: true },
    take: Math.max(1, Math.min(500, limit)),
    orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
    where: {
      channel: NotificationDeliveryChannel.EMAIL,
      attempts: { lt: WORKFLOW_NOTIFICATION_MAX_ATTEMPTS },
      notification: {
        entityType: { in: ["workflow_instance", "workflow_task"] },
      },
      OR: [
        { status: NotificationDeliveryStatus.PENDING, lastAttemptAt: null },
        {
          lastAttemptAt: {
            lt: new Date(Date.now() - WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS),
          },
          status: NotificationDeliveryStatus.PENDING,
        },
        {
          lastAttemptAt: {
            lt: new Date(Date.now() - WORKFLOW_NOTIFICATION_RETRY_DELAY_MS),
          },
          status: NotificationDeliveryStatus.FAILED,
        },
      ],
    },
  });
  const outcomes: DeliveryOutcome[] = [];
  for (const delivery of deliveries) {
    outcomes.push(await deliverWorkflowNotificationDelivery(delivery.id));
  }
  return outcomes;
};

export const buildWorkflowTaskUrl = (taskId: string): string =>
  `/aprobaciones/flujos/${taskId}`;

export const buildWorkflowInstanceUrl = (instanceId: string): string =>
  `/configuracion/flujos/instancias/${instanceId}`;

export const createTaskAssignedNotification = async ({
  db,
  instance,
  task,
  recipients,
}: {
  db: WorkflowNotificationDb;
  instance: { id: string; entityId?: string; entityType?: string };
  recipients: WorkflowNotificationRecipient[];
  task: {
    dueAt: Date | null;
    id: string;
    nodeName: string;
    visitSequence: number;
  };
}) =>
  createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    entityId: task.id,
    entityType: "workflow_task",
    eventType: "workflow.task.assigned",
    instanceId: instance.id,
    message: `Tiene una tarea de workflow pendiente: ${task.nodeName}.`,
    priority: NotificationPriority.HIGH,
    recipients,
    targetUrl: buildWorkflowTaskUrl(task.id),
    title: "Nueva tarea de aprobación",
    taskId: task.id,
    visitSequence: task.visitSequence,
  });

export const createWorkflowReminderNotification = async ({
  db,
  instance,
  task,
  recipients,
  timerId,
}: {
  db: WorkflowNotificationDb;
  instance: { id: string };
  recipients: WorkflowNotificationRecipient[];
  task: { id: string; nodeName: string; visitSequence: number };
  timerId: string;
}) =>
  createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    entityId: task.id,
    entityType: "workflow_task",
    eventType: "workflow.timer.reminder_processed",
    instanceId: instance.id,
    message: `La tarea “${task.nodeName}” está próxima a vencer y requiere atención.`,
    priority: NotificationPriority.HIGH,
    recipients,
    targetUrl: buildWorkflowTaskUrl(task.id),
    title: "Recordatorio de tarea",
    taskId: `${task.id}:${timerId}`,
    visitSequence: task.visitSequence,
  });

export const createWorkflowOverdueNotification = async ({
  db,
  instance,
  task,
  recipients,
  timerId,
}: {
  db: WorkflowNotificationDb;
  instance: { id: string };
  recipients: WorkflowNotificationRecipient[];
  task: { id: string; nodeName: string; visitSequence: number };
  timerId: string;
}) =>
  createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    entityId: task.id,
    entityType: "workflow_task",
    eventType: "workflow.timer.due_processed",
    instanceId: instance.id,
    message: `La tarea “${task.nodeName}” venció y continúa pendiente.`,
    priority: NotificationPriority.CRITICAL,
    recipients,
    targetUrl: buildWorkflowTaskUrl(task.id),
    title: "Tarea vencida",
    taskId: `${task.id}:${timerId}`,
    visitSequence: task.visitSequence,
  });

export const createWorkflowDecisionNotification = async ({
  actorUserId,
  context,
  db,
  instanceId,
  task,
  action,
}: {
  actorUserId?: string;
  action: "APPROVE" | "COMPLETE" | "OBSERVE" | "REJECT" | "REQUEST_CORRECTION";
  context: WorkflowRuntimeContext;
  db: WorkflowNotificationDb;
  instanceId: string;
  task: { id: string; nodeName: string; visitSequence: number };
}) => {
  const recipients = (
    await getWorkflowParticipantRecipients({ context, db, instanceId })
  ).filter((recipient) => recipient.id !== actorUserId);
  const labels: Record<typeof action, string> = {
    APPROVE: "aprobada",
    COMPLETE: "completada",
    OBSERVE: "observada",
    REJECT: "rechazada",
    REQUEST_CORRECTION: "devuelta para corrección",
  };
  return createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    eventType: `workflow.task.${action.toLowerCase()}`,
    instanceId,
    message: `La tarea “${task.nodeName}” fue ${labels[action]}.`,
    priority:
      action === "REJECT" || action === "REQUEST_CORRECTION"
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL,
    recipients,
    targetUrl: buildWorkflowTaskUrl(task.id),
    title: "Actualización de tarea de workflow",
    taskId: task.id,
    visitSequence: task.visitSequence,
  });
};

export const createWorkflowCompletionNotification = async ({
  context,
  db,
  finalResult,
  instanceId,
  targetUrl,
}: {
  context: WorkflowRuntimeContext;
  db: WorkflowNotificationDb;
  finalResult: string;
  instanceId: string;
  targetUrl?: string | null;
}) => {
  const recipients = await getWorkflowParticipantRecipients({
    context,
    db,
    instanceId,
  });
  if (recipients.length === 0)
    return { createdDeliveries: [], recipientCount: 0 };
  const approved = ["APPROVED", "CLOSED"].includes(finalResult);
  return createWorkflowNotificationIntent(db, {
    channel: "BOTH",
    eventType: "workflow.instance.completed",
    instanceId,
    message: approved
      ? "El workflow finalizó correctamente."
      : `El workflow finalizó con resultado ${finalResult}.`,
    priority: approved
      ? NotificationPriority.NORMAL
      : NotificationPriority.HIGH,
    recipients,
    targetUrl: targetUrl ?? buildWorkflowInstanceUrl(instanceId),
    title: approved ? "Workflow completado" : "Workflow finalizado",
    visitSequence: 0,
  });
};

export const getRecipientsForUserIds = getUserRecipients;

export { asJson as notificationJson };
