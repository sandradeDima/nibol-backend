/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority, ScheduledJobExecutionStatus, } from "../../../generated/prisma/client.js";
import { emailService } from "../../emails/EmailService.js";
import { prisma } from "../../utils/prisma.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AUTOMATIC_NOTIFICATION_TYPES, DEADLINE_MONITOR_JOB_NAME, DEADLINE_MONITOR_PARAMETER_DEFAULTS, } from "./deadline-monitor.constants.js";
const userSelect = {
    email: true,
    id: true,
    name: true,
};
const observationSelect = {
    areaAssignments: {
        select: {
            area: {
                select: { id: true, managerUser: { select: userSelect }, name: true },
            },
            areaResponsible: { select: userSelect },
            processOwner: { select: userSelect },
        },
    },
    auditorUser: { select: userSelect },
    auditReport: { select: { reportNumber: true } },
    observationNumber: true,
    description: true,
    currentDueDate: true,
    id: true,
    status: { select: { isFinal: true, key: true, name: true } },
    title: true,
};
const actionPlanSelect = {
    description: true,
    currentDueDate: true,
    id: true,
    progressPercent: true,
    observationArea: {
        select: {
            area: {
                select: {
                    id: true,
                    managerUser: { select: userSelect },
                    name: true,
                },
            },
            areaResponsible: { select: userSelect },
            processOwner: { select: userSelect },
        },
    },
    observation: {
        select: {
            auditReport: { select: { reportNumber: true } },
            auditorUser: { select: userSelect },
            id: true,
            observationNumber: true,
        },
    },
    responsibleUser: { select: userSelect },
    status: true,
    title: true,
};
const parseBoolean = (value, fallback) => {
    if (value === undefined)
        return fallback;
    return value.trim().toLowerCase() === "true";
};
const parseNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const readParameters = async () => {
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
        notify_area_manager: parseBoolean(values.get("notify_area_manager"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_area_manager),
        notify_audit_team: parseBoolean(values.get("notify_audit_team"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_audit_team),
        notify_by_email: parseBoolean(values.get("notify_by_email"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_by_email),
        notify_in_app: parseBoolean(values.get("notify_in_app"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_in_app),
        notify_observation_assignee: parseBoolean(values.get("notify_observation_assignee"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.notify_observation_assignee),
        overdue_check_enabled: parseBoolean(values.get("overdue_check_enabled"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.overdue_check_enabled),
        overdue_activity_enabled: parseBoolean(values.get("overdue_activity_enabled"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.overdue_activity_enabled),
        pending_extension_reminder_hours: parseNumber(values.get("pending_extension_reminder_hours"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.pending_extension_reminder_hours),
        pending_review_reminder_hours: parseNumber(values.get("pending_review_reminder_hours"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.pending_review_reminder_hours),
        reminder_days_before_due: parseNumber(values.get("reminder_days_before_due"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.reminder_days_before_due),
        reminder_repeat_days: Math.max(1, parseNumber(values.get("reminder_repeat_days"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.reminder_repeat_days)),
        returned_progress_reminder_days: parseNumber(values.get("returned_progress_reminder_days"), DEADLINE_MONITOR_PARAMETER_DEFAULTS.returned_progress_reminder_days),
    };
};
const utcDayStart = (date) => {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);
    return value;
};
const dateKey = (date) => date.toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.floor((utcDayStart(to).getTime() - utcDayStart(from).getTime()) / 86_400_000);
const dateLabel = (date) => date.toLocaleDateString("es-BO");
const errorMessage = (error) => error instanceof Error ? error.message : "Error desconocido";
const getAuditRecipients = async () => {
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
const uniqueRecipients = (recipients) => {
    const byId = new Map();
    for (const recipient of recipients) {
        if (recipient?.id)
            byId.set(recipient.id, recipient);
    }
    return [...byId.values()];
};
const createDelivery = async (input) => {
    const existing = await prisma.notificationDelivery.findUnique({
        where: { dedupeKey: input.dedupeKey },
    });
    if (existing)
        return existing;
    try {
        return await prisma.notificationDelivery.create({
            data: {
                channel: input.channel,
                dedupeKey: input.dedupeKey,
                ...(input.notificationId
                    ? { notificationId: input.notificationId }
                    : {}),
                ...(input.recipientEmail
                    ? { recipientEmail: input.recipientEmail }
                    : {}),
                ...(input.recipientUserId
                    ? { recipientUserId: input.recipientUserId }
                    : {}),
                status: input.status ?? NotificationDeliveryStatus.PENDING,
            },
        });
    }
    catch (error) {
        if (error.code === "P2002") {
            return prisma.notificationDelivery.findUniqueOrThrow({
                where: { dedupeKey: input.dedupeKey },
            });
        }
        throw error;
    }
};
const emitEvent = async (context, event, recipient, cycle) => {
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
    if (!context.parameters.notify_by_email || !recipient.email)
        return;
    const emailDelivery = await createDelivery({
        channel: NotificationDeliveryChannel.EMAIL,
        dedupeKey: `${baseKey}:EMAIL`,
        recipientEmail: recipient.email,
        recipientUserId: recipient.id,
    });
    if (emailDelivery.status === NotificationDeliveryStatus.SENT)
        return;
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
const recordFailure = (context, entityType, entityId, error) => {
    context.summary.failuresCount += 1;
    context.summary.failures.push({ entityId, entityType });
    logger.error("Deadline monitor entity failed.", {
        entityId,
        entityType,
        message: errorMessage(error),
    });
};
const notifyObservation = async (context, observation, auditRecipients, now) => {
    const dueDate = observation.currentDueDate;
    const code = `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`;
    const primaryArea = observation.areaAssignments[0];
    const daysUntilDue = daysBetween(now, dueDate);
    const isOverdue = daysUntilDue < 0;
    const cycle = isOverdue
        ? `overdue-${Math.floor(Math.abs(daysUntilDue) / context.parameters.reminder_repeat_days)}`
        : `due-${Math.floor((context.parameters.reminder_days_before_due - daysUntilDue) / context.parameters.reminder_repeat_days)}`;
    const eventType = isOverdue
        ? AUTOMATIC_NOTIFICATION_TYPES.observationOverdue
        : AUTOMATIC_NOTIFICATION_TYPES.observationDueSoon;
    const recipients = uniqueRecipients([
        ...(context.parameters.notify_observation_assignee
            ? observation.areaAssignments.flatMap((assignment) => [
                assignment.areaResponsible,
                assignment.processOwner,
            ])
            : []),
        ...(context.parameters.notify_area_manager
            ? observation.areaAssignments.map((assignment) => assignment.area.managerUser)
            : []),
        ...(context.parameters.notify_audit_team
            ? [observation.auditorUser, ...auditRecipients]
            : []),
    ]);
    const event = {
        actionRequired: isOverdue
            ? "Actualice el avance y gestione la regularización del vencimiento."
            : "Revise el avance y complete las acciones antes de la fecha límite.",
        areaName: primaryArea?.area.name ?? "Sin área",
        code,
        currentStatus: observation.status.name,
        description: isOverdue
            ? `La observación ${code} se encuentra vencida.`
            : `La observación ${code} vencerá el ${dateLabel(dueDate)}.`,
        dueDate: dateLabel(dueDate),
        entityId: observation.id,
        entityType: "observation",
        eventType,
        observationId: observation.id,
        priority: isOverdue
            ? NotificationPriority.CRITICAL
            : NotificationPriority.HIGH,
        targetUrl: `${env.FRONTEND_URL}/observaciones/${observation.id}`,
        title: isOverdue ? "Plazo vencido" : "Próximo vencimiento",
    };
    for (const recipient of recipients) {
        try {
            await emitEvent(context, event, recipient, cycle);
        }
        catch (error) {
            recordFailure(context, "observation", observation.id, error);
        }
    }
};
const notifyActionPlan = async (context, actionPlan, auditRecipients, now) => {
    const dueDate = actionPlan.currentDueDate;
    const code = `${actionPlan.observation.auditReport.reportNumber} / OBS-${String(actionPlan.observation.observationNumber).padStart(3, "0")}`;
    const daysUntilDue = daysBetween(now, dueDate);
    const isOverdue = daysUntilDue < 0;
    const cycle = isOverdue
        ? `overdue-${Math.floor(Math.abs(daysUntilDue) / context.parameters.reminder_repeat_days)}`
        : `due-${Math.floor((context.parameters.reminder_days_before_due - daysUntilDue) / context.parameters.reminder_repeat_days)}`;
    const recipients = uniqueRecipients([
        actionPlan.responsibleUser,
        actionPlan.observationArea.areaResponsible,
        actionPlan.observationArea.processOwner,
        context.parameters.notify_area_manager
            ? actionPlan.observationArea.area.managerUser
            : null,
        ...(context.parameters.notify_audit_team
            ? [actionPlan.observation.auditorUser, ...auditRecipients]
            : []),
    ]);
    const event = {
        actionRequired: isOverdue
            ? "Actualice el plan de acción y coordine la regularización del plazo."
            : "Revise el plan de remediación y registre el avance comprometido.",
        areaName: actionPlan.observationArea.area.name,
        code,
        currentStatus: actionPlan.status,
        description: isOverdue
            ? `El plan de acción “${actionPlan.title}” se encuentra vencido.`
            : `El plan de acción “${actionPlan.title}” vencerá el ${dateLabel(dueDate)}.`,
        dueDate: dateLabel(dueDate),
        entityId: actionPlan.id,
        entityType: "actionPlan",
        eventType: isOverdue
            ? AUTOMATIC_NOTIFICATION_TYPES.actionPlanOverdue
            : AUTOMATIC_NOTIFICATION_TYPES.actionPlanDueSoon,
        observationId: actionPlan.observation.id,
        priority: isOverdue
            ? NotificationPriority.CRITICAL
            : NotificationPriority.HIGH,
        targetUrl: `${env.FRONTEND_URL}/observaciones/${actionPlan.observation.id}`,
        title: isOverdue
            ? "Plan de acción vencido"
            : "Próximo vencimiento del plan de acción",
    };
    for (const recipient of recipients) {
        try {
            await emitEvent(context, event, recipient, cycle);
        }
        catch (error) {
            recordFailure(context, "actionPlan", actionPlan.id, error);
        }
    }
};
const recordOverdueActivity = async (context, observations, actionPlans) => {
    if (!context.parameters.overdue_activity_enabled)
        return;
    for (const observation of observations) {
        if (observation.status.isFinal)
            continue;
        try {
            await entityActivityService.create({
                action: "overdue.detected",
                activityType: "OVERDUE_DETECTED",
                actorType: "SYSTEM",
                dedupeKey: `overdue-detected:${observation.id}:${new Date().toISOString().slice(0, 10)}`,
                description: `El monitor automático detectó que la observación ${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")} está vencida.`,
                entityId: observation.id,
                entityType: "OBSERVATION",
                observationId: observation.id,
                title: "Vencimiento detectado",
            });
        }
        catch (error) {
            recordFailure(context, "observation-status", observation.id, error);
        }
    }
    for (const actionPlan of actionPlans) {
        try {
            await entityActivityService.create({
                action: "overdue.detected",
                activityType: "OVERDUE_DETECTED",
                actorType: "SYSTEM",
                dedupeKey: `overdue-detected:${actionPlan.id}:${new Date().toISOString().slice(0, 10)}`,
                description: `El monitor automático detectó que el plan de acción “${actionPlan.title}” está vencido.`,
                entityId: actionPlan.id,
                entityType: "ACTION_PLAN",
                observationId: actionPlan.observation.id,
                title: "Plan de acción vencido",
            });
        }
        catch (error) {
            recordFailure(context, "actionPlan-status", actionPlan.id, error);
        }
    }
};
const processPendingProgress = async (context, auditRecipients, now) => {
    const threshold = new Date(now.getTime() -
        context.parameters.pending_review_reminder_hours * 3_600_000);
    const returnedThreshold = new Date(now.getTime() -
        context.parameters.returned_progress_reminder_days * 86_400_000);
    const updates = await prisma.progressEvaluation.findMany({
        select: {
            actionPlan: {
                select: {
                    currentDueDate: true,
                    observationArea: { select: { area: { select: { name: true } } } },
                    observation: {
                        select: {
                            auditReport: { select: { reportNumber: true } },
                            id: true,
                            observationNumber: true,
                        },
                    },
                    responsibleUser: { select: userSelect },
                },
            },
            id: true,
            reviewedAt: true,
            reviewStatus: true,
            submittedByUser: { select: userSelect },
            updatedAt: true,
        },
        where: {
            deletedAt: null,
            OR: [
                { reviewStatus: "SENT_TO_AUDIT", updatedAt: { lte: threshold } },
                { reviewStatus: "RETURNED", updatedAt: { lte: returnedThreshold } },
            ],
        },
    });
    for (const update of updates) {
        context.summary.processedCount += 1;
        const returned = update.reviewStatus === "RETURNED";
        const observation = update.actionPlan.observation;
        const code = `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`;
        const recipients = uniqueRecipients(returned
            ? [update.submittedByUser, update.actionPlan.responsibleUser]
            : context.parameters.notify_audit_team
                ? auditRecipients
                : []);
        const event = {
            actionRequired: returned
                ? "Corrija el avance devuelto y envíelo nuevamente a revisión."
                : "Revise y atienda el avance pendiente en la bandeja de Auditoría.",
            areaName: update.actionPlan.observationArea.area.name,
            code,
            currentStatus: returned ? "Devuelto" : "Enviado a Auditoría",
            description: returned
                ? `La evaluación de ${code} fue devuelta para corrección.`
                : `La evaluación de ${code} lleva más de ${context.parameters.pending_review_reminder_hours} horas pendiente de revisión.`,
            dueDate: dateLabel(update.actionPlan.currentDueDate),
            entityId: update.id,
            entityType: "progress_update",
            eventType: returned
                ? AUTOMATIC_NOTIFICATION_TYPES.progressCorrectionPending
                : AUTOMATIC_NOTIFICATION_TYPES.pendingProgressReview,
            observationId: observation.id,
            priority: NotificationPriority.HIGH,
            targetUrl: `${env.FRONTEND_URL}/observaciones/${observation.id}`,
            title: returned
                ? "Avance devuelto para corrección"
                : "Avance pendiente de revisión",
        };
        for (const recipient of recipients) {
            try {
                const daysSinceUpdate = Math.max(0, daysBetween(update.updatedAt, now));
                await emitEvent(context, event, recipient, `${returned ? "returned" : "review"}-${Math.floor(daysSinceUpdate / context.parameters.reminder_repeat_days)}`);
            }
            catch (error) {
                recordFailure(context, "progress_update", update.id, error);
            }
        }
    }
};
const processPendingExtensions = async (context, auditRecipients, now) => {
    const threshold = new Date(now.getTime() -
        context.parameters.pending_extension_reminder_hours * 3_600_000);
    const requests = await prisma.deadlineExtensionRequest.findMany({
        select: {
            observationArea: {
                select: {
                    area: { select: { managerUser: { select: userSelect }, name: true } },
                },
            },
            actionPlan: {
                select: {
                    observation: {
                        select: {
                            auditReport: { select: { reportNumber: true } },
                            id: true,
                            observationNumber: true,
                            title: true,
                        },
                    },
                    title: true,
                },
            },
            id: true,
            observation: {
                select: {
                    auditReport: { select: { reportNumber: true } },
                    areaAssignments: {
                        select: {
                            area: {
                                select: { managerUser: { select: userSelect }, name: true },
                            },
                        },
                        take: 1,
                    },
                    id: true,
                    observationNumber: true,
                    title: true,
                },
            },
            proposedDueDate: true,
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
        const observation = request.observation ?? request.actionPlan?.observation;
        if (!observation)
            continue;
        const area = request.observationArea?.area ??
            request.observation?.areaAssignments[0]?.area;
        const code = `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`;
        const recipients = uniqueRecipients(managerReview
            ? context.parameters.notify_area_manager
                ? [area?.managerUser ?? null]
                : []
            : context.parameters.notify_audit_team
                ? auditRecipients
                : []);
        const event = {
            actionRequired: managerReview
                ? "Revise la solicitud y apruebe o rechace la ampliación propuesta."
                : "Revise la solicitud de ampliación en la bandeja de Auditoría.",
            areaName: area?.name ?? "Sin área",
            code,
            currentStatus: managerReview
                ? "Pendiente de Gerencia"
                : "Pendiente de Auditoría",
            description: `La ampliación de plazo para ${request.actionPlan?.title ?? observation.title} lleva más de ${context.parameters.pending_extension_reminder_hours} horas pendiente.`,
            dueDate: dateLabel(request.proposedDueDate),
            entityId: request.id,
            entityType: "deadline_extension_request",
            eventType: managerReview
                ? AUTOMATIC_NOTIFICATION_TYPES.pendingExtensionManagerReview
                : AUTOMATIC_NOTIFICATION_TYPES.pendingExtensionAuditReview,
            observationId: observation.id,
            priority: NotificationPriority.HIGH,
            targetUrl: `${env.FRONTEND_URL}/ampliaciones-plazo/${request.id}`,
            title: managerReview
                ? "Ampliación pendiente de aprobación"
                : "Ampliación pendiente en Auditoría",
        };
        for (const recipient of recipients) {
            try {
                await emitEvent(context, event, recipient, `${managerReview ? "manager" : "audit"}-${dateKey(request.updatedAt)}`);
            }
            catch (error) {
                recordFailure(context, "deadline_extension_request", request.id, error);
            }
        }
    }
};
const finalizeExecution = async (executionId, context, status, error) => {
    await prisma.scheduledJobExecution.update({
        data: {
            detailsJson: {
                failures: context.summary.failures.slice(0, 100),
                processedActionPlans: context.summary.processedActionPlans,
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
    async run(options) {
        const startedAt = new Date();
        const execution = await prisma.scheduledJobExecution.create({
            data: {
                jobName: DEADLINE_MONITOR_JOB_NAME,
                startedAt,
                status: ScheduledJobExecutionStatus.RUNNING,
                triggeredBy: options.triggeredBy,
                ...(options.triggeredByUserId
                    ? { triggeredByUserId: options.triggeredByUserId }
                    : {}),
            },
        });
        const summary = {
            emailsSent: 0,
            failures: [],
            failuresCount: 0,
            finishedAt: "",
            jobName: DEADLINE_MONITOR_JOB_NAME,
            notificationsCreated: 0,
            processedActionPlans: 0,
            processedCount: 0,
            processedObservations: 0,
            startedAt: startedAt.toISOString(),
            status: "SUCCESS",
        };
        const context = {
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
            const reminderEnd = new Date(today.getTime() +
                context.parameters.reminder_days_before_due * 86_400_000);
            const observations = await prisma.observation.findMany({
                select: observationSelect,
                where: {
                    deletedAt: null,
                    currentDueDate: { lte: reminderEnd },
                    status: { isFinal: false },
                },
            });
            const actionPlans = await prisma.actionPlan.findMany({
                select: actionPlanSelect,
                where: {
                    deletedAt: null,
                    currentDueDate: { lte: reminderEnd },
                    progressPercent: { lt: 100 },
                    status: { not: "CONCLUDED" },
                },
            });
            const auditRecipients = await getAuditRecipients();
            const overdueObservations = observations.filter((item) => item.currentDueDate < today);
            const overdueActionPlans = actionPlans.filter((item) => item.currentDueDate < today);
            await recordOverdueActivity(context, overdueObservations, overdueActionPlans);
            for (const observation of observations) {
                summary.processedCount += 1;
                summary.processedObservations += 1;
                await notifyObservation(context, observation, auditRecipients, startedAt);
            }
            for (const actionPlan of actionPlans) {
                summary.processedCount += 1;
                summary.processedActionPlans += 1;
                await notifyActionPlan(context, actionPlan, auditRecipients, startedAt);
            }
            await processPendingProgress(context, auditRecipients, startedAt);
            await processPendingExtensions(context, auditRecipients, startedAt);
            summary.status = summary.failuresCount > 0 ? "PARTIAL" : "SUCCESS";
            summary.finishedAt = new Date().toISOString();
            await finalizeExecution(execution.id, context, summary.status);
            return summary;
        }
        catch (error) {
            summary.status = "FAILED";
            summary.finishedAt = new Date().toISOString();
            await finalizeExecution(execution.id, context, "FAILED", errorMessage(error));
            logger.error("Deadline monitor failed.", {
                message: errorMessage(error),
            });
            return summary;
        }
    },
    async listExecutions(page, perPage) {
        const [total, data] = await prisma.$transaction([
            prisma.scheduledJobExecution.count({
                where: { jobName: DEADLINE_MONITOR_JOB_NAME },
            }),
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
//# sourceMappingURL=deadline-monitor.service.js.map