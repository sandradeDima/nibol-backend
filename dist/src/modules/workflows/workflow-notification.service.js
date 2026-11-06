import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority, NotificationType, parseDatabaseEnum, } from "../../types/database-enums.js";
import { emailService } from "../../emails/EmailService.js";
import { logger } from "../../utils/logger.js";
import { buildFrontendUrl, resolveNotificationTarget, } from "../../utils/notification-links.js";
import { buildObservationUrl } from "../../utils/observation-links.js";
import { prisma } from "../../utils/prisma.js";
import { toDatabaseJson } from "../../services/logging-utils.js";
import { isNotificationChannelEnabled } from "../../services/notification-preferences.js";
import { restoreWorkflowRuntimeContext } from "./workflow-runtime-context.js";
import { writeRuntimeAuditEvent, writeRuntimeTransitionLog, } from "./workflow-runtime-events.js";
import { buildProgressNotification } from "../progress/progress-notification.js";
const WORKFLOW_NOTIFICATION_MAX_ATTEMPTS = 3;
const WORKFLOW_NOTIFICATION_RETRY_DELAY_MS = 5 * 60_000;
const WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS = 15 * 60_000;
const asJson = (value) => toDatabaseJson(value);
const dedupePrefix = (event) => [
    "workflow",
    event.eventType,
    event.instanceId,
    event.taskId ?? "instance",
    event.visitSequence ?? "0",
].join(":");
export const buildWorkflowNotificationDedupeKey = (event, recipientId, channel) => `${dedupePrefix(event)}:${recipientId}:${channel}`;
const safeErrorMessage = (error) => {
    const message = error instanceof Error ? error.message : "Error de entrega";
    return message.slice(0, 500);
};
const uniqueRecipients = (recipients) => {
    const byId = new Map();
    for (const recipient of recipients) {
        if (recipient.id)
            byId.set(recipient.id, recipient);
    }
    return [...byId.values()];
};
const createNotificationIfMissing = async (db, input) => {
    const existing = await db.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
    });
    if (existing)
        return existing;
    try {
        return await db.notification.create({
            data: {
                dedupeKey: input.dedupeKey,
                entityId: input.entityId,
                entityType: input.entityType,
                eventType: input.eventType,
                message: input.message,
                priority: input.priority,
                ...(input.hideFromInApp ? { deletedAt: new Date() } : {}),
                targetUrl: input.targetUrl,
                title: input.title,
                type: input.type ??
                    (input.priority === NotificationPriority.CRITICAL
                        ? NotificationType.ERROR
                        : input.priority === NotificationPriority.HIGH
                            ? NotificationType.WARNING
                            : NotificationType.INFO),
                userId: input.userId,
            },
        });
    }
    catch (error) {
        if (error.code !== "P2002")
            throw error;
        return db.notification.findUniqueOrThrow({
            where: { dedupeKey: input.dedupeKey },
        });
    }
};
const createDeliveryIfMissing = async (db, input) => {
    const existing = await db.notificationDelivery.findUnique({
        where: { dedupeKey: input.dedupeKey },
    });
    if (existing)
        return existing;
    try {
        return await db.notificationDelivery.create({
            data: {
                channel: input.channel,
                dedupeKey: input.dedupeKey,
                notificationId: input.notificationId,
                recipientEmail: input.recipient.email,
                recipientUserId: input.recipient.id,
                status: input.channel === NotificationDeliveryChannel.IN_APP
                    ? NotificationDeliveryStatus.SENT
                    : NotificationDeliveryStatus.PENDING,
                ...(input.channel === NotificationDeliveryChannel.IN_APP
                    ? { sentAt: new Date() }
                    : {}),
            },
        });
    }
    catch (error) {
        if (error.code !== "P2002")
            throw error;
        return db.notificationDelivery.findUniqueOrThrow({
            where: { dedupeKey: input.dedupeKey },
        });
    }
};
const getUserRecipients = async (db, userIds) => {
    if (userIds.length === 0)
        return [];
    return db.user.findMany({
        select: { email: true, id: true, name: true },
        where: {
            deletedAt: null,
            id: { in: [...new Set(userIds)] },
            isActive: true,
        },
    });
};
const getRoleRecipients = async (db, roleId) => db.user.findMany({
    select: { email: true, id: true, name: true },
    where: {
        deletedAt: null,
        isActive: true,
        userRoles: { some: { roleId } },
    },
});
const getAreaManager = async (db, areaId) => {
    const area = await db.area.findFirst({
        select: { managerUser: { select: { email: true, id: true, name: true } } },
        where: { active: true, deletedAt: null, id: areaId },
    });
    return area?.managerUser ? [area.managerUser] : [];
};
const getPreviousApprover = async (db, instanceId) => {
    const transition = await db.workflowTransitionLog.findFirst({
        orderBy: { createdAt: "desc" },
        select: { performedBy: { select: { email: true, id: true, name: true } } },
        where: {
            workflowInstanceId: instanceId,
            performedById: { not: null },
        },
    });
    return transition?.performedBy ? [transition.performedBy] : [];
};
const getCurrentAssignmentRecipients = async (db, instanceId) => {
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
    if (!task)
        return [];
    if (task.assignedUser)
        return [task.assignedUser];
    if (task.assignedRole)
        return getRoleRecipients(db, task.assignedRole.id);
    if (task.assignedArea?.managerUser)
        return [task.assignedArea.managerUser];
    return [];
};
export const getWorkflowTaskAssignmentRecipients = getCurrentAssignmentRecipients;
const getAssignmentRecipientsForTask = async (db, taskId) => {
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
    if (!task)
        return [];
    if (task.assignedUser)
        return [task.assignedUser];
    if (task.assignedRole)
        return getRoleRecipients(db, task.assignedRole.id);
    if (task.assignedArea?.managerUser)
        return [task.assignedArea.managerUser];
    return [];
};
export const getWorkflowTaskAssignmentRecipientsForTask = getAssignmentRecipientsForTask;
export const getWorkflowParticipantRecipients = async ({ context, db, instanceId, }) => {
    const recipients = [
        ...(context.requesterUserId
            ? await getUserRecipients(db, [context.requesterUserId])
            : []),
        ...(await getCurrentAssignmentRecipients(db, instanceId)),
        ...(await getPreviousApprover(db, instanceId)),
    ];
    return uniqueRecipients(recipients);
};
export const resolveWorkflowNotificationRecipients = async ({ db, instanceId, configuration, context, }) => {
    switch (configuration.recipientStrategy) {
        case "CURRENT_ASSIGNEE":
            return getCurrentAssignmentRecipients(db, instanceId);
        case "REQUESTER":
            return getUserRecipients(db, context.requesterUserId ? [context.requesterUserId] : []);
        case "PREVIOUS_APPROVER":
            return getPreviousApprover(db, instanceId);
        case "FIXED_USER":
            return getUserRecipients(db, configuration.recipientUserId ? [configuration.recipientUserId] : []);
        case "ROLE":
            return configuration.recipientRoleId
                ? getRoleRecipients(db, configuration.recipientRoleId)
                : [];
        case "AREA_MANAGER":
            return getAreaManager(db, configuration.recipientAreaId ?? context.areaId ?? "");
        case "OBSERVATION_RESPONSIBLE":
            return getUserRecipients(db, context.responsibleUserId ? [context.responsibleUserId] : []);
    }
};
export const createWorkflowNotificationIntent = async (db, event) => {
    const recipients = uniqueRecipients(event.recipients);
    const channel = event.channel ?? "INTERNAL";
    const [internalEnabled, emailEnabled] = await Promise.all([
        (channel === "INTERNAL" || channel === "BOTH") &&
            isNotificationChannelEnabled(event.eventType, "internal", db.systemParameter),
        (channel === "EMAIL" || channel === "BOTH") &&
            isNotificationChannelEnabled(event.eventType, "email", db.systemParameter),
    ]);
    if (!internalEnabled && !emailEnabled)
        return { createdDeliveries: [], recipientCount: 0 };
    const baseKey = dedupePrefix(event);
    const entityId = event.entityId ?? event.instanceId;
    const entityType = event.entityType ?? "workflow_instance";
    const priority = event.priority ?? NotificationPriority.NORMAL;
    const targetUrl = event.targetUrl ??
        resolveNotificationTarget({
            entityId,
            entityType,
            eventType: event.eventType,
        }) ??
        `/configuracion/flujos/instancias/${event.instanceId}`;
    const createdDeliveries = [];
    for (const recipient of recipients) {
        const notification = await createNotificationIfMissing(db, {
            dedupeKey: `${baseKey}:${recipient.id}:notification`,
            entityId,
            entityType,
            eventType: event.eventType,
            message: event.message,
            priority,
            hideFromInApp: !internalEnabled,
            targetUrl,
            title: event.title,
            ...(event.type !== undefined ? { type: event.type } : {}),
            userId: recipient.id,
        });
        if (internalEnabled) {
            const delivery = await createDeliveryIfMissing(db, {
                channel: NotificationDeliveryChannel.IN_APP,
                dedupeKey: buildWorkflowNotificationDedupeKey(event, recipient.id, "IN_APP"),
                notificationId: notification.id,
                recipient,
            });
            createdDeliveries.push(delivery.id);
        }
        if (emailEnabled && recipient.email) {
            const delivery = await createDeliveryIfMissing(db, {
                channel: NotificationDeliveryChannel.EMAIL,
                dedupeKey: buildWorkflowNotificationDedupeKey(event, recipient.id, "EMAIL"),
                notificationId: notification.id,
                recipient,
            });
            createdDeliveries.push(delivery.id);
        }
    }
    return { createdDeliveries, recipientCount: recipients.length };
};
const markDeliveryFailed = async (deliveryId, error) => {
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
const recordNotificationFailure = async (deliveryId, message) => {
    try {
        const delivery = await prisma.notificationDelivery.findUnique({
            include: { notification: true },
            where: { id: deliveryId },
        });
        if (!delivery?.notification)
            return;
        const notification = delivery.notification;
        if (!notification.entityId)
            return;
        let instanceId = notification.entityType === "workflow_instance"
            ? notification.entityId
            : notification.entityType === "workflow_task"
                ? ((await prisma.workflowTask.findUnique({
                    select: { workflowInstanceId: true },
                    where: { id: notification.entityId },
                }))?.workflowInstanceId ?? null)
                : null;
        if (!instanceId && notification.dedupeKey?.startsWith("workflow:")) {
            instanceId = notification.dedupeKey.split(":")[2] ?? null;
        }
        if (!instanceId)
            return;
        const instance = await prisma.workflowInstance.findUnique({
            select: { contextJson: true, processType: true },
            where: { id: instanceId },
        });
        if (!instance)
            return;
        const db = prisma;
        const context = restoreWorkflowRuntimeContext(instance.processType, instance.contextJson);
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
    }
    catch (failure) {
        logger.warn("No se pudo registrar el evento de fallo de notificación del flujo de trabajo.", {
            deliveryId,
            errorCode: "WORKFLOW_NOTIFICATION_FAILURE_EVENT_FAILED",
            message: safeErrorMessage(failure),
        });
    }
};
export const deliverWorkflowNotificationDelivery = async (deliveryId) => {
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
    const deliveryStatus = parseDatabaseEnum(NotificationDeliveryStatus, delivery.status, "notification_deliveries.status");
    if (deliveryStatus === NotificationDeliveryStatus.SENT) {
        return { attempted: false, deliveryId, status: deliveryStatus };
    }
    if (delivery.notification &&
        !(await isNotificationChannelEnabled(delivery.notification.eventType, "email"))) {
        await prisma.notificationDelivery.update({
            data: {
                errorMessage: "La categoría de notificación está desactivada.",
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
    if (deliveryStatus === NotificationDeliveryStatus.FAILED &&
        delivery.attempts >= WORKFLOW_NOTIFICATION_MAX_ATTEMPTS) {
        return { attempted: false, deliveryId, status: deliveryStatus };
    }
    if (delivery.channel !== NotificationDeliveryChannel.EMAIL) {
        return { attempted: false, deliveryId, status: deliveryStatus };
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
                        lt: new Date(claimNow.getTime() - WORKFLOW_NOTIFICATION_CLAIM_LEASE_MS),
                    },
                    status: NotificationDeliveryStatus.PENDING,
                },
                {
                    lastAttemptAt: {
                        lt: new Date(claimNow.getTime() - WORKFLOW_NOTIFICATION_RETRY_DELAY_MS),
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
            status: current
                ? parseDatabaseEnum(NotificationDeliveryStatus, current.status, "notification_deliveries.status")
                : NotificationDeliveryStatus.SKIPPED,
        };
    }
    const result = await emailService.sendTemplate({
        template: "genericNotification",
        to: delivery.recipientUser.email,
        variables: {
            ...(delivery.notification?.targetUrl
                ? {
                    actionLabel: "Abrir en NIBOL",
                    actionLink: buildFrontendUrl(delivery.notification.targetUrl),
                }
                : {}),
            message: delivery.notification?.message ?? "Tiene una notificación pendiente.",
            title: delivery.notification?.title ?? "Notificación",
            userName: delivery.recipientUser.name,
        },
    });
    if (!result.success) {
        const error = await markDeliveryFailed(deliveryId, result.error ?? "No fue posible enviar el correo.");
        await recordNotificationFailure(deliveryId, error);
        logger.warn("Falló el correo de notificación del flujo de trabajo.", {
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
export const deliverWorkflowNotificationsForInstance = async (instanceId) => {
    const taskIds = (await prisma.workflowTask.findMany({
        select: { id: true },
        where: { workflowInstanceId: instanceId },
    })).map((task) => task.id);
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
    const outcomes = [];
    for (const delivery of deliveries) {
        outcomes.push(await deliverWorkflowNotificationDelivery(delivery.id));
    }
    return outcomes;
};
export const deliverPendingWorkflowNotificationDeliveries = async (limit = 100) => {
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
    const outcomes = [];
    for (const delivery of deliveries) {
        outcomes.push(await deliverWorkflowNotificationDelivery(delivery.id));
    }
    return outcomes;
};
export const deliverWorkflowNotificationsInBackground = (instanceId) => {
    void deliverWorkflowNotificationsForInstance(instanceId).catch((error) => {
        logger.warn("No se pudo iniciar la entrega de notificaciones del flujo.", {
            error: safeErrorMessage(error),
            instanceId,
        });
    });
};
export const buildWorkflowTaskUrl = (taskId) => `/aprobaciones/flujos/${taskId}`;
export const buildDeadlineExtensionOutcomeNotification = ({ actionPlanTitle, approved, entityId, observationReference, targetUrl, }) => {
    const outcome = approved ? "aprobada" : "rechazada";
    const actionPlan = actionPlanTitle
        ? ` del plan de acción “${actionPlanTitle}”`
        : "";
    const reference = observationReference ? ` (${observationReference})` : "";
    return {
        eventType: approved ? "EXTENSION_APPROVED" : "EXTENSION_REJECTED",
        message: `La solicitud de ampliación de plazo${actionPlan}${reference} fue ${outcome}.`,
        priority: approved
            ? NotificationPriority.NORMAL
            : NotificationPriority.HIGH,
        targetUrl: targetUrl ??
            `/ampliaciones-plazo?extensionId=${encodeURIComponent(entityId)}`,
        title: `Ampliación de plazo ${outcome}`,
        type: approved ? NotificationType.SUCCESS : NotificationType.WARNING,
    };
};
const getWorkflowRecordLabels = async (db, context) => {
    const actionPlanId = context.custom.actionPlanId;
    const observationId = context.custom.observationId;
    const [actionPlan, observation] = await Promise.all([
        typeof actionPlanId === "string"
            ? db.actionPlan.findFirst({
                select: { title: true },
                where: { deletedAt: null, id: actionPlanId },
            })
            : null,
        typeof observationId === "string"
            ? db.observation.findFirst({
                select: {
                    auditReport: { select: { reportNumber: true } },
                    observationNumber: true,
                    title: true,
                },
                where: { deletedAt: null, id: observationId },
            })
            : null,
    ]);
    return {
        actionPlanTitle: actionPlan?.title ?? null,
        evidenceName: typeof context.custom.evidenceName === "string"
            ? context.custom.evidenceName.trim() || null
            : null,
        observationReference: observation
            ? `${observation.auditReport.reportNumber} / OBS-${String(observation.observationNumber).padStart(3, "0")}`
            : null,
        observationTitle: observation?.title ?? null,
        requestTitle: typeof context.custom.title === "string"
            ? context.custom.title.trim() || null
            : null,
    };
};
const getWorkflowApprovalSubject = async (db, context) => {
    const labels = await getWorkflowRecordLabels(db, context);
    const observation = labels.observationTitle
        ? `la observación “${labels.observationTitle}”`
        : "la observación relacionada";
    switch (context.processType) {
        case "DEADLINE_EXTENSION":
            return labels.actionPlanTitle
                ? `la ampliación de plazo del plan de acción “${labels.actionPlanTitle}”`
                : `la ampliación de plazo de ${observation}`;
        case "OBSERVATION_CLOSURE":
            return `el cierre de ${observation}`;
        case "EVIDENCE_REVIEW":
            return labels.evidenceName
                ? `la evidencia “${labels.evidenceName}”`
                : `la revisión de evidencia de ${observation}`;
        case "REMEDIATION_PLAN_APPROVAL":
            return `el plan de acción recomendado para ${observation}`;
        default:
            if (labels.requestTitle)
                return `la solicitud “${labels.requestTitle}”`;
            if (labels.actionPlanTitle)
                return `el plan de acción “${labels.actionPlanTitle}”`;
            return observation;
    }
};
export const buildWorkflowInstanceUrl = (instanceId) => `/configuracion/flujos/instancias/${instanceId}`;
export const createTaskAssignedNotification = async ({ context, db, instance, task, recipients, }) => {
    const labels = instance.processType === "DEADLINE_EXTENSION" ||
        instance.processType === "OBSERVATION_CLOSURE"
        ? await getWorkflowRecordLabels(db, context)
        : null;
    if (instance.processType === "OBSERVATION_CLOSURE") {
        const content = buildProgressNotification("pending", {
            actionPlanTitle: labels?.actionPlanTitle ?? "Plan de acción",
            observationReference: labels?.observationReference ?? "",
            observationTitle: labels?.observationTitle ?? "observación",
        });
        const observationId = String(context.custom.observationId ?? "");
        const planId = String(context.custom.actionPlanId ?? "");
        return createWorkflowNotificationIntent(db, {
            channel: "INTERNAL",
            entityId: instance.entityId,
            entityType: "PROGRESS_EVALUATION",
            eventType: content.eventType,
            instanceId: instance.id,
            message: content.message,
            priority: NotificationPriority.HIGH,
            recipients,
            targetUrl: observationId
                ? buildObservationUrl(observationId, {
                    advanceId: instance.entityId,
                    ...(planId ? { planId } : {}),
                    tab: "plans",
                })
                : buildWorkflowTaskUrl(task.id),
            title: content.title,
            type: content.type,
            taskId: task.id,
            visitSequence: task.visitSequence,
        });
    }
    const targetUrl = instance.processType === "DEADLINE_EXTENSION"
        ? `/aprobaciones/pendientes?tab=extensions&extensionId=${encodeURIComponent(instance.entityId)}`
        : buildWorkflowTaskUrl(task.id);
    const message = instance.processType === "DEADLINE_EXTENSION"
        ? `${task.nodeName} ${labels?.actionPlanTitle
            ? `del plan de acción “${labels.actionPlanTitle}”`
            : `de la observación “${labels?.observationTitle ?? "relacionada"}”`}.`
        : `Tiene una tarea pendiente: ${task.nodeName}.`;
    return createWorkflowNotificationIntent(db, {
        channel: "BOTH",
        entityId: task.id,
        entityType: "workflow_task",
        eventType: "workflow.task.assigned",
        instanceId: instance.id,
        message,
        priority: NotificationPriority.HIGH,
        recipients,
        targetUrl,
        title: instance.processType === "DEADLINE_EXTENSION"
            ? "Ampliación de plazo pendiente de aprobación"
            : "Nueva tarea de aprobación",
        taskId: task.id,
        visitSequence: task.visitSequence,
    });
};
export const createWorkflowReminderNotification = async ({ db, instance, task, recipients, timerId, }) => createWorkflowNotificationIntent(db, {
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
export const createWorkflowOverdueNotification = async ({ db, instance, task, recipients, timerId, }) => createWorkflowNotificationIntent(db, {
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
export const createWorkflowDecisionNotification = async ({ actorUserId, context, db, instanceId, task, action, }) => {
    if (context.processType === "DEADLINE_EXTENSION" ||
        context.processType === "OBSERVATION_CLOSURE") {
        return { createdDeliveries: [], recipientCount: 0 };
    }
    const subject = await getWorkflowApprovalSubject(db, context);
    const recipients = (await getWorkflowParticipantRecipients({ context, db, instanceId })).filter((recipient) => recipient.id !== actorUserId);
    const labels = {
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
        message: `La tarea “${task.nodeName}” fue ${labels[action]} para ${subject}.`,
        priority: action === "REJECT" || action === "REQUEST_CORRECTION"
            ? NotificationPriority.HIGH
            : NotificationPriority.NORMAL,
        recipients,
        targetUrl: buildWorkflowTaskUrl(task.id),
        title: `Actualización de aprobación: ${subject}`.slice(0, 191),
        taskId: task.id,
        visitSequence: task.visitSequence,
    });
};
export const createWorkflowCompletionNotification = async ({ context, db, entityId, finalResult, instanceId, targetUrl, }) => {
    if (context.processType === "OBSERVATION_CLOSURE") {
        if (!entityId ||
            !["APPROVED", "CLOSED", "REJECTED", "EXPIRED"].includes(finalResult))
            return { createdDeliveries: [], recipientCount: 0 };
        const labels = await getWorkflowRecordLabels(db, context);
        const approved = ["APPROVED", "CLOSED"].includes(finalResult);
        const content = buildProgressNotification(approved ? "approved" : "returned", {
            actionPlanTitle: labels.actionPlanTitle ?? "Plan de acción",
            observationReference: labels.observationReference ?? "",
            observationTitle: labels.observationTitle ?? "observación",
        });
        const observationId = String(context.custom.observationId ?? "");
        const actionPlanId = String(context.custom.actionPlanId ?? "");
        const recipients = await getUserRecipients(db, context.requesterUserId ? [context.requesterUserId] : []);
        const result = await createWorkflowNotificationIntent(db, {
            channel: "INTERNAL",
            entityId,
            entityType: "PROGRESS_EVALUATION",
            eventType: content.eventType,
            instanceId,
            message: content.message,
            priority: approved ? NotificationPriority.NORMAL : NotificationPriority.HIGH,
            recipients,
            targetUrl: observationId
                ? buildObservationUrl(observationId, {
                    advanceId: entityId,
                    ...(actionPlanId ? { planId: actionPlanId } : {}),
                    tab: "plans",
                })
                : targetUrl ?? buildWorkflowInstanceUrl(instanceId),
            title: content.title,
            type: content.type,
            visitSequence: 0,
        });
        if (!approved || !observationId || !actionPlanId)
            return result;
        const plans = await db.actionPlan.findMany({
            select: {
                id: true,
                observationArea: {
                    select: {
                        areaResponsibleUserId: true,
                        processOwnerUserId: true,
                    },
                },
                responsibleUserId: true,
                status: true,
            },
            where: { deletedAt: null, observationId },
        });
        const completedPlan = plans.find((plan) => plan.id === actionPlanId && plan.status === "CONCLUDED");
        if (!completedPlan)
            return result;
        const planCompleted = buildProgressNotification("planCompleted", {
            actionPlanTitle: labels.actionPlanTitle ?? "Plan de acción",
            observationReference: labels.observationReference ?? "",
            observationTitle: labels.observationTitle ?? "observación",
        });
        const planTargetUrl = buildObservationUrl(observationId, {
            planId: actionPlanId,
            tab: "plans",
        });
        await createWorkflowNotificationIntent(db, {
            channel: "INTERNAL",
            entityId: actionPlanId,
            entityType: "ACTION_PLAN",
            eventType: planCompleted.eventType,
            instanceId,
            message: planCompleted.message,
            recipients: await getUserRecipients(db, completedPlan.responsibleUserId ? [completedPlan.responsibleUserId] : []),
            targetUrl: planTargetUrl,
            title: planCompleted.title,
            type: planCompleted.type,
            visitSequence: 0,
        });
        if (plans.length > 0 && plans.every((plan) => plan.status === "CONCLUDED")) {
            const closed = buildProgressNotification("observationCompleted", {
                actionPlanTitle: labels.actionPlanTitle ?? "Plan de acción",
                observationReference: labels.observationReference ?? "",
                observationTitle: labels.observationTitle ?? "observación",
            });
            const recipientIds = plans.flatMap((plan) => [
                plan.responsibleUserId,
                plan.observationArea.areaResponsibleUserId,
                plan.observationArea.processOwnerUserId,
            ]);
            await createWorkflowNotificationIntent(db, {
                channel: "INTERNAL",
                entityId: observationId,
                entityType: "OBSERVATION",
                eventType: closed.eventType,
                instanceId,
                message: closed.message,
                recipients: await getUserRecipients(db, recipientIds.filter((userId) => Boolean(userId))),
                targetUrl: buildObservationUrl(observationId, { tab: "summary" }),
                title: closed.title,
                type: closed.type,
                visitSequence: 0,
            });
        }
        return result;
    }
    if (context.processType === "DEADLINE_EXTENSION") {
        if (!entityId || !["APPROVED", "CLOSED", "REJECTED"].includes(finalResult))
            return { createdDeliveries: [], recipientCount: 0 };
        const recipients = await getUserRecipients(db, context.requesterUserId ? [context.requesterUserId] : []);
        if (recipients.length === 0)
            return { createdDeliveries: [], recipientCount: 0 };
        const approved = ["APPROVED", "CLOSED"].includes(finalResult);
        const labels = await getWorkflowRecordLabels(db, context);
        const outcome = buildDeadlineExtensionOutcomeNotification({
            actionPlanTitle: labels.actionPlanTitle,
            approved,
            entityId,
            observationReference: labels.observationReference,
            ...(targetUrl !== undefined ? { targetUrl } : {}),
        });
        return createWorkflowNotificationIntent(db, {
            channel: "INTERNAL",
            entityId,
            entityType: "DEADLINE_EXTENSION_REQUEST",
            instanceId,
            recipients,
            ...outcome,
            visitSequence: 0,
        });
    }
    const recipients = await getWorkflowParticipantRecipients({
        context,
        db,
        instanceId,
    });
    if (recipients.length === 0)
        return { createdDeliveries: [], recipientCount: 0 };
    const subject = await getWorkflowApprovalSubject(db, context);
    const approved = ["APPROVED", "CLOSED"].includes(finalResult);
    return createWorkflowNotificationIntent(db, {
        channel: "BOTH",
        eventType: "workflow.instance.completed",
        instanceId,
        message: approved
            ? `El flujo de aprobación fue completado correctamente para ${subject}.`
            : `El flujo de aprobación finalizó con el resultado ${finalResult} para ${subject}.`,
        priority: approved
            ? NotificationPriority.NORMAL
            : NotificationPriority.HIGH,
        recipients,
        targetUrl: targetUrl ?? buildWorkflowInstanceUrl(instanceId),
        title: (approved
            ? `Aprobación completada: ${subject}`
            : `Aprobación finalizada: ${subject}`).slice(0, 191),
        visitSequence: 0,
    });
};
export const getRecipientsForUserIds = getUserRecipients;
export { asJson as notificationJson };
//# sourceMappingURL=workflow-notification.service.js.map