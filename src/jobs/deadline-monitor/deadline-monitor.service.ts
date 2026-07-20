/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  NotificationDeliveryChannel,
  NotificationDeliveryStatus,
  NotificationPriority,
  ScheduledJobExecutionStatus,
} from "../../../generated/prisma/client.js";
import type { ScheduledJobTrigger } from "../../../generated/prisma/client.js";

import { emailService } from "../../emails/EmailService.js";
import { prisma } from "../../utils/prisma.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import {
  AUTOMATIC_NOTIFICATION_TYPES,
  DEADLINE_MONITOR_JOB_NAME,
  DEADLINE_MONITOR_PARAMETER_DEFAULTS,
} from "./deadline-monitor.constants.js";

type Trigger = "CRON" | "USER" | "SYSTEM";

type MonitorParameters = {
  notify_area_manager: boolean;
  notify_audit_team: boolean;
  notify_by_email: boolean;
  notify_in_app: boolean;
  notify_observation_assignee: boolean;
  overdue_check_enabled: boolean;
  overdue_status_auto_update_enabled: boolean;
  pending_extension_reminder_hours: number;
  pending_review_reminder_hours: number;
  reminder_days_before_due: number;
  reminder_repeat_days: number;
  returned_progress_reminder_days: number;
};

type JobSummary = {
  emailsSent: number;
  failures: Array<{ entityId: string; entityType: string }>;
  failuresCount: number;
  finishedAt: string;
  jobName: string;
  notificationsCreated: number;
  processedCommitments: number;
  processedCount: number;
  processedObservations: number;
  startedAt: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
};

type Recipient = {
  email: string;
  id: string;
  name: string;
};

type NotificationEvent = {
  actionRequired: string;
  areaName: string;
  code: string;
  currentStatus: string;
  description: string;
  dueDate: string;
  entityId: string;
  entityType: string;
  eventType: string;
  observationId?: string;
  priority: NotificationPriority;
  targetUrl: string;
  title: string;
};

const userSelect = {
  email: true,
  id: true,
  name: true,
} as const;

const observationSelect = {
  area: {
    select: {
      id: true,
      managerUser: { select: userSelect },
      name: true,
    },
  },
  auditorUser: { select: userSelect },
  code: true,
  description: true,
  dueDate: true,
  id: true,
  responsibleUser: { select: userSelect },
  status: { select: { isFinal: true, key: true, name: true } },
  title: true,
} as const;

const commitmentSelect = {
  description: true,
  dueDate: true,
  id: true,
  progressPercent: true,
  remediationPlan: {
    select: {
      area: {
        select: {
          id: true,
          managerUser: { select: userSelect },
          name: true,
        },
      },
      observation: {
        select: {
          auditorUser: { select: userSelect },
          code: true,
          id: true,
        },
      },
      ownerUser: { select: userSelect },
    },
  },
  responsibleUser: { select: userSelect },
  status: true,
  title: true,
} as const;

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const readParameters = async (): Promise<MonitorParameters> => {
  const records = await prisma.systemParameter.findMany({
    select: { key: true, value: true },
    where: {
      active: true,
      deletedAt: null,
      key: { in: Object.keys(DEADLINE_MONITOR_PARAMETER_DEFAULTS) },
    },
  });
  const values = new Map(records.map((record) => [record.key, record.value]));

  return {
    notify_area_manager: parseBoolean(
      values.get("notify_area_manager"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_area_manager,
    ),
    notify_audit_team: parseBoolean(
      values.get("notify_audit_team"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_audit_team,
    ),
    notify_by_email: parseBoolean(
      values.get("notify_by_email"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_by_email,
    ),
    notify_in_app: parseBoolean(
      values.get("notify_in_app"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_in_app,
    ),
    notify_observation_assignee: parseBoolean(
      values.get("notify_observation_assignee"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_observation_assignee,
    ),
    overdue_check_enabled: parseBoolean(
      values.get("overdue_check_enabled"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.overdue_check_enabled,
    ),
    overdue_status_auto_update_enabled: parseBoolean(
      values.get("overdue_status_auto_update_enabled"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.overdue_status_auto_update_enabled,
    ),
    pending_extension_reminder_hours: parseNumber(
      values.get("pending_extension_reminder_hours"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.pending_extension_reminder_hours,
    ),
    pending_review_reminder_hours: parseNumber(
      values.get("pending_review_reminder_hours"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.pending_review_reminder_hours,
    ),
    reminder_days_before_due: parseNumber(
      values.get("reminder_days_before_due"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.reminder_days_before_due,
    ),
    reminder_repeat_days: Math.max(
      1,
      parseNumber(
        values.get("reminder_repeat_days"),
        DEADLINE_MONITOR_PARAMETER_DEFAULTS.reminder_repeat_days,
      ),
    ),
    returned_progress_reminder_days: parseNumber(
      values.get("returned_progress_reminder_days"),
      DEADLINE_MONITOR_PARAMETER_DEFAULTS.returned_progress_reminder_days,
    ),
  };
};

const utcDayStart = (date: Date): Date => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

const daysBetween = (from: Date, to: Date): number =>
  Math.floor((utcDayStart(to).getTime() - utcDayStart(from).getTime()) / 86_400_000);

const dateLabel = (date: Date): string => date.toLocaleDateString("es-BO");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Error desconocido";

const getAuditRecipients = async (): Promise<Recipient[]> => {
  const users = await prisma.user.findMany({
    select: userSelect,
    where: {
      deletedAt: null,
      isActive: true,
      userRoles: {
        some: {
          role: {
            deletedAt: null,
            OR: [
              { name: { contains: "audit" } },
              { name: { contains: "auditor" } },
              { name: { contains: "auditoria" } },
            ],
          },
        },
      },
    },
  });

  return users;
};

const uniqueRecipients = (recipients: Array<Recipient | null | undefined>): Recipient[] => {
  const byId = new Map<string, Recipient>();
  for (const recipient of recipients) {
    if (recipient?.id) byId.set(recipient.id, recipient);
  }
  return [...byId.values()];
};

const createDelivery = async (input: {
  channel: NotificationDeliveryChannel;
  dedupeKey: string;
  notificationId?: string;
  recipientEmail?: string;
  recipientUserId?: string;
  status?: NotificationDeliveryStatus;
}) => {
  const existing = await prisma.notificationDelivery.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });
  if (existing) return existing;

  try {
    return await prisma.notificationDelivery.create({
      data: {
        channel: input.channel,
        dedupeKey: input.dedupeKey,
        ...(input.notificationId ? { notificationId: input.notificationId } : {}),
        ...(input.recipientEmail ? { recipientEmail: input.recipientEmail } : {}),
        ...(input.recipientUserId ? { recipientUserId: input.recipientUserId } : {}),
        status: input.status ?? NotificationDeliveryStatus.PENDING,
      },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return prisma.notificationDelivery.findUniqueOrThrow({
        where: { dedupeKey: input.dedupeKey },
      });
    }
    throw error;
  }
};

type RunContext = {
  parameters: MonitorParameters;
  summary: JobSummary;
};

const emitEvent = async (
  context: RunContext,
  event: NotificationEvent,
  recipient: Recipient,
  cycle: string,
): Promise<void> => {
  const baseKey = `${event.eventType}:${event.entityType}:${event.entityId}:${recipient.id}:${cycle}`;

  if (context.parameters.notify_in_app) {
    const dedupeKey = `${baseKey}:IN_APP`;
    let notification = await prisma.notification.findUnique({
      where: { dedupeKey },
    });
    if (!notification) {
      notification = await prisma.notification.create({
        data: {
          dedupeKey,
          entityId: event.entityId,
          entityType: event.entityType,
          eventType: event.eventType,
          message: event.description,
          priority: event.priority,
          targetUrl: event.targetUrl,
          title: event.title,
          type: event.priority === NotificationPriority.CRITICAL
            ? "ERROR"
            : event.priority === NotificationPriority.HIGH
              ? "WARNING"
              : "INFO",
          userId: recipient.id,
        },
      });
      context.summary.notificationsCreated += 1;
      await entityActivityService.create({
        action: "notification.created",
        activityType: "NOTIFICATION_CREATED",
        actorType: "SYSTEM",
        dedupeKey: `notification-activity:${notification.id}`,
        description: event.description,
        entityId: notification.id,
        entityType: "NOTIFICATION",
        metadata: { eventType: event.eventType, recipientUserId: recipient.id },
        observationId: event.observationId,
        targetUrl: event.targetUrl,
        title: event.title,
      });
    }
    await createDelivery({
      channel: NotificationDeliveryChannel.IN_APP,
      dedupeKey,
      notificationId: notification.id,
      recipientUserId: recipient.id,
      status: NotificationDeliveryStatus.SENT,
    });
  }

  if (!context.parameters.notify_by_email || !recipient.email) return;

  const emailDelivery = await createDelivery({
    channel: NotificationDeliveryChannel.EMAIL,
    dedupeKey: `${baseKey}:EMAIL`,
    recipientEmail: recipient.email,
    recipientUserId: recipient.id,
  });
  if (emailDelivery.status === NotificationDeliveryStatus.SENT) return;

  const attemptedAt = new Date();
  await prisma.notificationDelivery.update({
    data: {
      attempts: { increment: 1 },
      lastAttemptAt: attemptedAt,
      status: NotificationDeliveryStatus.PENDING,
    },
    where: { id: emailDelivery.id },
  });
  const result = await emailService.sendTemplate({
    template: "automationNotification",
    to: recipient.email,
    variables: {
      actionRequired: event.actionRequired,
      areaName: event.areaName,
      code: event.code,
      currentStatus: event.currentStatus,
      description: event.description,
      dueDate: event.dueDate,
      targetUrl: event.targetUrl,
      title: event.title,
      userName: recipient.name,
    },
  });
  if (result.success) {
    await prisma.notificationDelivery.update({
      data: { sentAt: new Date(), status: NotificationDeliveryStatus.SENT },
      where: { id: emailDelivery.id },
    });
    context.summary.emailsSent += 1;
    return;
  }
  await prisma.notificationDelivery.update({
    data: {
      errorMessage: result.error ?? "No fue posible enviar el correo.",
      status: NotificationDeliveryStatus.FAILED,
    },
    where: { id: emailDelivery.id },
  });
  throw new Error(result.error ?? "No fue posible enviar el correo.");
};

const recordFailure = (context: RunContext, entityType: string, entityId: string, error: unknown) => {
  context.summary.failuresCount += 1;
  context.summary.failures.push({ entityId, entityType });
  logger.error("Deadline monitor entity failed.", {
    entityId,
    entityType,
    message: errorMessage(error),
  });
};

const notifyObservation = async (
  context: RunContext,
  observation: typeof prisma.observation extends never ? never : any,
  auditRecipients: Recipient[],
  now: Date,
): Promise<void> => {
  const daysUntilDue = daysBetween(now, observation.dueDate);
  const isOverdue = daysUntilDue < 0;
  const cycle = isOverdue
    ? `overdue-${Math.floor(Math.abs(daysUntilDue) / context.parameters.reminder_repeat_days)}`
    : `due-${Math.floor((context.parameters.reminder_days_before_due - daysUntilDue) / context.parameters.reminder_repeat_days)}`;
  const eventType = isOverdue
    ? AUTOMATIC_NOTIFICATION_TYPES.observationOverdue
    : AUTOMATIC_NOTIFICATION_TYPES.observationDueSoon;
  const recipients = uniqueRecipients([
    context.parameters.notify_observation_assignee ? observation.responsibleUser : null,
    context.parameters.notify_area_manager ? observation.area.managerUser : null,
    ...(context.parameters.notify_audit_team
      ? [observation.auditorUser, ...auditRecipients]
      : []),
  ]);
  const event: NotificationEvent = {
    actionRequired: isOverdue
      ? "Actualice el avance y gestione la regularización del vencimiento."
      : "Revise el avance y complete las acciones antes de la fecha límite.",
    areaName: observation.area.name,
    code: observation.code,
    currentStatus: observation.status.name,
    description: isOverdue
      ? `La observación ${observation.code} se encuentra vencida.`
      : `La observación ${observation.code} vencerá el ${dateLabel(observation.dueDate)}.`,
    dueDate: dateLabel(observation.dueDate),
    entityId: observation.id,
    entityType: "observation",
    eventType,
    observationId: observation.id,
    priority: isOverdue ? NotificationPriority.CRITICAL : NotificationPriority.HIGH,
    targetUrl: `${env.FRONTEND_URL}/observaciones/${observation.id}`,
    title: isOverdue ? "Plazo vencido" : "Próximo vencimiento",
  };
  for (const recipient of recipients) {
    try {
      await emitEvent(context, event, recipient, cycle);
    } catch (error) {
      recordFailure(context, "observation", observation.id, error);
    }
  }
};

const notifyCommitment = async (
  context: RunContext,
  commitment: any,
  auditRecipients: Recipient[],
  now: Date,
): Promise<void> => {
  const daysUntilDue = daysBetween(now, commitment.dueDate);
  const isOverdue = daysUntilDue < 0;
  const cycle = isOverdue
    ? `overdue-${Math.floor(Math.abs(daysUntilDue) / context.parameters.reminder_repeat_days)}`
    : `due-${Math.floor((context.parameters.reminder_days_before_due - daysUntilDue) / context.parameters.reminder_repeat_days)}`;
  const recipients = uniqueRecipients([
    commitment.responsibleUser,
    commitment.remediationPlan.ownerUser,
    context.parameters.notify_area_manager ? commitment.remediationPlan.area.managerUser : null,
    ...(context.parameters.notify_audit_team
      ? [commitment.remediationPlan.observation.auditorUser, ...auditRecipients]
      : []),
  ]);
  const event: NotificationEvent = {
    actionRequired: isOverdue
      ? "Actualice el compromiso y coordine la regularización del plazo."
      : "Revise el plan de remediación y registre el avance comprometido.",
    areaName: commitment.remediationPlan.area.name,
    code: commitment.remediationPlan.observation.code,
    currentStatus: commitment.status,
    description: isOverdue
      ? `El compromiso “${commitment.title}” se encuentra vencido.`
      : `El compromiso “${commitment.title}” vencerá el ${dateLabel(commitment.dueDate)}.`,
    dueDate: dateLabel(commitment.dueDate),
    entityId: commitment.id,
    entityType: "commitment",
    eventType: isOverdue
      ? AUTOMATIC_NOTIFICATION_TYPES.commitmentOverdue
      : AUTOMATIC_NOTIFICATION_TYPES.commitmentDueSoon,
    observationId: commitment.remediationPlan.observation.id,
    priority: isOverdue ? NotificationPriority.CRITICAL : NotificationPriority.HIGH,
    targetUrl: `${env.FRONTEND_URL}/planes-remediacion?observacion=${commitment.remediationPlan.observation.id}`,
    title: isOverdue ? "Compromiso vencido" : "Próximo vencimiento de compromiso",
  };
  for (const recipient of recipients) {
    try {
      await emitEvent(context, event, recipient, cycle);
    } catch (error) {
      recordFailure(context, "commitment", commitment.id, error);
    }
  }
};

const updateOverdueStatuses = async (
  context: RunContext,
  observations: any[],
  commitments: any[],
): Promise<void> => {
  if (!context.parameters.overdue_status_auto_update_enabled) return;
  const overdueStatus = await prisma.observationStatus.findFirst({
    select: { id: true },
    where: { active: true, deletedAt: null, key: "VENCIDA" },
  });
  for (const observation of observations) {
    if (
      !overdueStatus ||
      observation.status.key === "VENCIDA" ||
      observation.status.isFinal ||
      /audit|revision|revisi[oó]n/i.test(observation.status.key)
    ) continue;
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.observation.update({
          data: { statusId: overdueStatus.id },
          where: { id: observation.id },
        });
        await transaction.auditLog.create({
          data: {
            entityId: observation.id,
            entityType: "observation",
            newValues: { status: "VENCIDA" },
            oldValues: { status: observation.status.key },
          },
        });
      });
      await entityActivityService.create({
        action: "overdue.detected",
        activityType: "OVERDUE_DETECTED",
        actorType: "SYSTEM",
        dedupeKey: `overdue-detected:${observation.id}:${new Date().toISOString().slice(0, 10)}`,
        description: `El monitor automático detectó que la observación ${observation.code} está vencida.`,
        entityId: observation.id,
        entityType: "OBSERVATION",
        observationId: observation.id,
        title: "Vencimiento detectado",
      });
      if (overdueStatus) {
        await entityActivityService.create({
          action: "status.automatic-change",
          activityType: "AUTOMATIC_STATUS_CHANGE",
          actorType: "SYSTEM",
          dedupeKey: `automatic-status:${observation.id}:${new Date().toISOString().slice(0, 10)}`,
          description: `El estado cambió de ${observation.status.name} a Vencida.`,
          entityId: observation.id,
          entityType: "OBSERVATION",
          newData: { status: "Vencida" },
          observationId: observation.id,
          previousData: { status: observation.status.name },
          title: "Estado actualizado automáticamente",
        });
      }
    } catch (error) {
      recordFailure(context, "observation-status", observation.id, error);
    }
  }
  for (const commitment of commitments) {
    if (!["PENDING", "IN_PROGRESS"].includes(commitment.status)) continue;
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.commitment.update({
          data: { status: "OVERDUE" },
          where: { id: commitment.id },
        });
        await transaction.auditLog.create({
          data: {
            entityId: commitment.id,
            entityType: "commitment",
            newValues: { status: "OVERDUE" },
            oldValues: { status: commitment.status },
          },
        });
      });
      await entityActivityService.create({
        action: "overdue.detected",
        activityType: "OVERDUE_DETECTED",
        actorType: "SYSTEM",
        dedupeKey: `overdue-detected:${commitment.id}:${new Date().toISOString().slice(0, 10)}`,
        description: `El monitor automático detectó que el compromiso “${commitment.title}” está vencido.`,
        entityId: commitment.id,
        entityType: "COMMITMENT",
        observationId: commitment.remediationPlan.observation.id,
        title: "Compromiso vencido",
      });
      await entityActivityService.create({
        action: "status.automatic-change",
        activityType: "AUTOMATIC_STATUS_CHANGE",
        actorType: "SYSTEM",
        dedupeKey: `automatic-status:${commitment.id}:${new Date().toISOString().slice(0, 10)}`,
        description: `El compromiso cambió de ${commitment.status} a Vencido.`,
        entityId: commitment.id,
        entityType: "COMMITMENT",
        newData: { status: "OVERDUE" },
        observationId: commitment.remediationPlan.observation.id,
        previousData: { status: commitment.status },
        title: "Compromiso marcado como vencido",
      });
    } catch (error) {
      recordFailure(context, "commitment-status", commitment.id, error);
    }
  }
};

const processPendingProgress = async (
  context: RunContext,
  auditRecipients: Recipient[],
  now: Date,
): Promise<void> => {
  const threshold = new Date(
    now.getTime() - context.parameters.pending_review_reminder_hours * 3_600_000,
  );
  const returnedThreshold = new Date(
    now.getTime() - context.parameters.returned_progress_reminder_days * 86_400_000,
  );
  const updates = await prisma.progressUpdate.findMany({
    select: {
      commitment: { select: { responsibleUser: { select: userSelect } } },
      id: true,
      observation: { select: { code: true, id: true, responsibleUser: { select: userSelect }, area: { select: { name: true } }, dueDate: true } },
      reviewedAt: true,
      status: true,
      submittedByUser: { select: userSelect },
      updatedAt: true,
    },
    where: {
      deletedAt: null,
      OR: [
        { status: "SENT_TO_AUDIT", updatedAt: { lte: threshold } },
        { status: "RETURNED", updatedAt: { lte: returnedThreshold } },
      ],
    },
  });
  for (const update of updates) {
    context.summary.processedCount += 1;
    const returned = update.status === "RETURNED";
    const recipients = uniqueRecipients(
      returned
        ? [update.submittedByUser, update.observation.responsibleUser, update.commitment?.responsibleUser]
        : context.parameters.notify_audit_team ? auditRecipients : [],
    );
    const event: NotificationEvent = {
      actionRequired: returned
        ? "Corrija el avance devuelto y envíelo nuevamente a revisión."
        : "Revise y atienda el avance pendiente en la bandeja de Auditoría.",
      areaName: update.observation.area.name,
      code: update.observation.code,
      currentStatus: returned ? "Devuelto" : "Enviado a Auditoría",
      description: returned
        ? `El avance de ${update.observation.code} fue devuelto para corrección.`
        : `El avance de ${update.observation.code} lleva más de ${context.parameters.pending_review_reminder_hours} horas pendiente de revisión.`,
      dueDate: dateLabel(update.observation.dueDate),
      entityId: update.id,
      entityType: "progress_update",
      eventType: returned
        ? AUTOMATIC_NOTIFICATION_TYPES.progressCorrectionPending
        : AUTOMATIC_NOTIFICATION_TYPES.pendingProgressReview,
      observationId: update.observation.id,
      priority: NotificationPriority.HIGH,
      targetUrl: `${env.FRONTEND_URL}/avances-evidencias?observacion=${update.observation.code}`,
      title: returned ? "Avance devuelto para corrección" : "Avance pendiente de revisión",
    };
    for (const recipient of recipients) {
      try {
        const daysSinceUpdate = Math.max(0, daysBetween(update.updatedAt, now));
        await emitEvent(
          context,
          event,
          recipient,
          `${returned ? "returned" : "review"}-${Math.floor(daysSinceUpdate / context.parameters.reminder_repeat_days)}`,
        );
      } catch (error) {
        recordFailure(context, "progress_update", update.id, error);
      }
    }
  }
};

const processPendingExtensions = async (
  context: RunContext,
  auditRecipients: Recipient[],
  now: Date,
): Promise<void> => {
  const threshold = new Date(
    now.getTime() - context.parameters.pending_extension_reminder_hours * 3_600_000,
  );
  const requests = await prisma.deadlineExtensionRequest.findMany({
    select: {
      area: { select: { managerUser: { select: userSelect }, name: true } },
      commitment: { select: { title: true } },
      id: true,
      observation: { select: { code: true, dueDate: true, id: true, title: true } },
      requestedDueDate: true,
      status: true,
      updatedAt: true,
    },
    where: {
      deletedAt: null,
      status: { in: ["SENT_TO_MANAGER", "SENT_TO_AUDIT"] },
      updatedAt: { lte: threshold },
    },
  });
  for (const request of requests) {
    context.summary.processedCount += 1;
    const managerReview = request.status === "SENT_TO_MANAGER";
    const recipients = uniqueRecipients(
      managerReview
        ? context.parameters.notify_area_manager
          ? [request.area.managerUser]
          : []
        : context.parameters.notify_audit_team
          ? auditRecipients
          : [],
    );
    const event: NotificationEvent = {
      actionRequired: managerReview
        ? "Revise la solicitud y apruebe o rechace la ampliación propuesta."
        : "Revise la solicitud de ampliación en la bandeja de Auditoría.",
      areaName: request.area.name,
      code: request.observation.code,
      currentStatus: managerReview ? "Pendiente de Gerencia" : "Pendiente de Auditoría",
      description: `La ampliación de plazo para ${request.commitment?.title ?? request.observation.title} lleva más de ${context.parameters.pending_extension_reminder_hours} horas pendiente.`,
      dueDate: dateLabel(request.requestedDueDate),
      entityId: request.id,
      entityType: "deadline_extension_request",
      eventType: managerReview
        ? AUTOMATIC_NOTIFICATION_TYPES.pendingExtensionManagerReview
        : AUTOMATIC_NOTIFICATION_TYPES.pendingExtensionAuditReview,
      observationId: request.observation.id,
      priority: NotificationPriority.HIGH,
      targetUrl: `${env.FRONTEND_URL}/ampliaciones-plazo/${request.id}`,
      title: managerReview ? "Ampliación pendiente de aprobación" : "Ampliación pendiente en Auditoría",
    };
    for (const recipient of recipients) {
      try {
        await emitEvent(
          context,
          event,
          recipient,
          `${managerReview ? "manager" : "audit"}-${dateKey(request.updatedAt)}`,
        );
      } catch (error) {
        recordFailure(context, "deadline_extension_request", request.id, error);
      }
    }
  }
};

const finalizeExecution = async (
  executionId: string,
  context: RunContext,
  status: "SUCCESS" | "PARTIAL" | "FAILED",
  error?: string,
): Promise<void> => {
  await prisma.scheduledJobExecution.update({
    data: {
      detailsJson: {
        failures: context.summary.failures.slice(0, 100),
        processedCommitments: context.summary.processedCommitments,
        processedObservations: context.summary.processedObservations,
      },
      errorMessage: error ?? null,
      emailsSent: context.summary.emailsSent,
      failuresCount: context.summary.failuresCount,
      finishedAt: new Date(),
      notificationsCreated: context.summary.notificationsCreated,
      processedCount: context.summary.processedCount,
      status,
    },
    where: { id: executionId },
  });
};

export const deadlineMonitorService = {
  async run(options: { triggeredBy: Trigger; triggeredByUserId?: string }): Promise<JobSummary> {
    const startedAt = new Date();
    const execution = await prisma.scheduledJobExecution.create({
      data: {
        jobName: DEADLINE_MONITOR_JOB_NAME,
        startedAt,
        status: ScheduledJobExecutionStatus.RUNNING,
        triggeredBy: options.triggeredBy as ScheduledJobTrigger,
        ...(options.triggeredByUserId ? { triggeredByUserId: options.triggeredByUserId } : {}),
      },
    });
    const summary: JobSummary = {
      emailsSent: 0,
      failures: [],
      failuresCount: 0,
      finishedAt: "",
      jobName: DEADLINE_MONITOR_JOB_NAME,
      notificationsCreated: 0,
      processedCommitments: 0,
      processedCount: 0,
      processedObservations: 0,
      startedAt: startedAt.toISOString(),
      status: "SUCCESS",
    };
    const context: RunContext = {
      parameters: {
        ...DEADLINE_MONITOR_PARAMETER_DEFAULTS,
        reminder_repeat_days: DEADLINE_MONITOR_PARAMETER_DEFAULTS.reminder_repeat_days,
      },
      summary,
    };

    try {
      context.parameters = await readParameters();
      if (!context.parameters.overdue_check_enabled) {
        summary.finishedAt = new Date().toISOString();
        await finalizeExecution(execution.id, context, "SUCCESS");
        return summary;
      }
      const today = utcDayStart(startedAt);
      const reminderEnd = new Date(today.getTime() + context.parameters.reminder_days_before_due * 86_400_000);
      const observations = await prisma.observation.findMany({
        select: observationSelect,
        where: {
          deletedAt: null,
          dueDate: { lte: reminderEnd },
          status: { isFinal: false },
        },
      });
      const commitments = await prisma.commitment.findMany({
        select: commitmentSelect,
        where: {
          deletedAt: null,
          dueDate: { lte: reminderEnd },
          progressPercent: { lt: 100 },
          status: { not: "COMPLETED" },
        },
      });
      const auditRecipients = await getAuditRecipients();
      const overdueObservations = observations.filter((item) => item.dueDate < today);
      const overdueCommitments = commitments.filter((item) => item.dueDate < today);

      await updateOverdueStatuses(context, overdueObservations, overdueCommitments);
      for (const observation of observations) {
        summary.processedCount += 1;
        summary.processedObservations += 1;
        await notifyObservation(context, observation, auditRecipients, startedAt);
      }
      for (const commitment of commitments) {
        summary.processedCount += 1;
        summary.processedCommitments += 1;
        await notifyCommitment(context, commitment, auditRecipients, startedAt);
      }
      await processPendingProgress(context, auditRecipients, startedAt);
      await processPendingExtensions(context, auditRecipients, startedAt);

      summary.status = summary.failuresCount > 0 ? "PARTIAL" : "SUCCESS";
      summary.finishedAt = new Date().toISOString();
      await finalizeExecution(execution.id, context, summary.status);
      return summary;
    } catch (error) {
      summary.status = "FAILED";
      summary.finishedAt = new Date().toISOString();
      await finalizeExecution(execution.id, context, "FAILED", errorMessage(error));
      logger.error("Deadline monitor failed.", { message: errorMessage(error) });
      return summary;
    }
  },

  async listExecutions(page: number, perPage: number) {
    const [total, data] = await prisma.$transaction([
      prisma.scheduledJobExecution.count({ where: { jobName: DEADLINE_MONITOR_JOB_NAME } }),
      prisma.scheduledJobExecution.findMany({
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        where: { jobName: DEADLINE_MONITOR_JOB_NAME },
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
      where: { jobName: DEADLINE_MONITOR_JOB_NAME },
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
