/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority, NotificationType, ScheduledJobExecutionStatus, } from "../../../generated/prisma/client.js";
import { emailService } from "../../emails/EmailService.js";
import { getBusinessDateKey, getEffectiveActionPlanDueDate, getOfficialActionPlanProgress, getActionPlanDeadlineStatus, getDateOnlyKey } from "../../modules/reports/reporting-definitions.js";
import { buildActionPlanScopeWhere, } from "../../services/authorization-service.js";
import { notificationService } from "../../services/notification-service.js";
import { prisma } from "../../utils/prisma.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { DEADLINE_REMINDER_EVENT_TYPE, DEADLINE_REMINDER_JOB_NAME, DEADLINE_REMINDER_LOCK_NAME, DEADLINE_REMINDER_PARAMETER_DEFAULTS, DEADLINE_REMINDER_POLICY_DEFAULTS, DEADLINE_REMINDER_ROLE_LABELS, DEADLINE_REMINDER_ROLES, getDeadlineReminderParameterKey, } from "./deadline-reminder.constants.js";
import { addDaysToDateKey, getCadenceLabel, getReminderBucket, getScheduleGroupKey, getScheduledReminderPeriods, getNextScheduledReminderPeriod, } from "./deadline-reminder.policy.js";
const SCHEDULED_RUN = "SCHEDULED";
const MANUAL_RUN = "MANUAL";
const LOCK_TTL_MS = 15 * 60_000;
const MAX_DELIVERY_ATTEMPTS = 3;
const userSelect = {
    deletedAt: true,
    email: true,
    id: true,
    isActive: true,
    name: true,
};
const actionPlanSelect = {
    currentDueDate: true,
    deadlineExtensionRequests: {
        orderBy: { updatedAt: "desc" },
        select: {
            finalApprovedAt: true,
            proposedDueDate: true,
            status: true,
        },
        where: { deletedAt: null },
    },
    description: true,
    id: true,
    originalDueDate: true,
    observation: {
        select: {
            auditReport: {
                select: { reportNumber: true, title: true },
            },
            id: true,
            observationNumber: true,
            riskLevel: {
                select: {
                    name: true,
                    severityOrder: true,
                },
            },
            title: true,
        },
    },
    observationArea: {
        select: {
            area: { select: { name: true } },
            areaResponsible: { select: userSelect },
            processOwner: { select: userSelect },
        },
    },
    progressEvaluations: {
        orderBy: { submittedAt: "desc" },
        select: { reportedProgressPercent: true },
        take: 1,
        where: { deletedAt: null },
    },
    responsibleUser: { select: userSelect },
    status: true,
    title: true,
};
const approvedExtensionWhere = {
    deletedAt: null,
    status: "MANAGER_APPROVED",
};
const parseBoolean = (value, fallback) => value === undefined ? fallback : value.trim().toLowerCase() === "true";
const parsePositiveInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const dateAtNoonUtc = (dateKey) => new Date(`${dateKey}T12:00:00.000Z`);
const dateLabel = (dateKey) => new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
}).format(dateAtNoonUtc(dateKey));
const monthLabel = (dateKey) => new Intl.DateTimeFormat("es-BO", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
}).format(dateAtNoonUtc(dateKey));
const errorMessage = (error) => (error instanceof Error ? error.message : "Error desconocido").slice(0, 500);
const toJson = (value) => value;
const buildAccess = (userId, role) => ({
    dataScope: role === "EXECUTOR" ? "ASSIGNED" : "AREA",
    isAdmin: false,
    permissions: [],
    roleCode: role,
    roleName: DEADLINE_REMINDER_ROLE_LABELS[role],
    roles: [DEADLINE_REMINDER_ROLE_LABELS[role]],
    userId,
});
const readPolicies = async () => {
    const keys = Object.keys(DEADLINE_REMINDER_PARAMETER_DEFAULTS);
    const records = await prisma.systemParameter.findMany({
        select: { active: true, createdAt: true, key: true, value: true },
        where: { deletedAt: null, key: { in: keys } },
    });
    const byKey = new Map(records.map((record) => [record.key, record]));
    return DEADLINE_REMINDER_ROLES.map((role) => {
        const defaults = DEADLINE_REMINDER_POLICY_DEFAULTS[role];
        const enabledRecord = byKey.get(getDeadlineReminderParameterKey(role, "enabled"));
        const cutoffRecord = byKey.get(getDeadlineReminderParameterKey(role, "cutoffDay"));
        const cadenceRecord = byKey.get(getDeadlineReminderParameterKey(role, "cadenceMonths"));
        const windowRecord = byKey.get(getDeadlineReminderParameterKey(role, "upcomingWindowDays"));
        const createdAt = [
            enabledRecord?.createdAt,
            cutoffRecord?.createdAt,
            cadenceRecord?.createdAt,
            windowRecord?.createdAt,
        ]
            .filter((value) => Boolean(value))
            .sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date();
        return {
            cadenceMonths: Math.min(24, parsePositiveInteger(cadenceRecord?.value, defaults.cadenceMonths)),
            cutoffDay: Math.min(28, Math.max(1, parsePositiveInteger(cutoffRecord?.value, defaults.cutoffDay))),
            createdAt,
            enabled: enabledRecord?.active === false
                ? false
                : parseBoolean(enabledRecord?.value, defaults.enabled),
            role,
            upcomingWindowDays: Math.min(365, parsePositiveInteger(windowRecord?.value, defaults.upcomingWindowDays)),
        };
    });
};
const readChannels = async () => {
    const records = await prisma.systemParameter.findMany({
        select: { key: true, value: true },
        where: {
            active: true,
            deletedAt: null,
            key: { in: ["notify_by_email", "notify_in_app"] },
        },
    });
    const values = new Map(records.map((record) => [record.key, record.value]));
    return {
        notifyByEmail: parseBoolean(values.get("notify_by_email"), true),
        notifyInApp: parseBoolean(values.get("notify_in_app"), true),
    };
};
const readBusinessTimeZone = async () => {
    const setting = await prisma.setting.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { timezone: true },
        where: { deletedAt: null },
    });
    const candidate = setting?.timezone?.trim() || "America/La_Paz";
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
        return candidate;
    }
    catch {
        return "America/La_Paz";
    }
};
const findActionPlans = async (policy, cutoffDateKey, recipientUserId) => {
    const endDateKey = addDaysToDateKey(cutoffDateKey, policy.upcomingWindowDays);
    const endDate = dateAtNoonUtc(endDateKey);
    const scopeWhere = buildActionPlanScopeWhere(buildAccess(recipientUserId, policy.role));
    const where = {
        AND: [
            scopeWhere,
            { observation: { deletedAt: null } },
            { status: { not: "CONCLUDED" } },
            {
                OR: [
                    {
                        currentDueDate: { lte: endDate },
                        deadlineExtensionRequests: { none: approvedExtensionWhere },
                    },
                    {
                        deadlineExtensionRequests: {
                            some: { ...approvedExtensionWhere, proposedDueDate: { lte: endDate } },
                        },
                    },
                ],
            },
        ],
    };
    return prisma.actionPlan.findMany({
        select: actionPlanSelect,
        where,
    });
};
const toDigestPlan = (plan, cutoffDateKey, policy, showExecutor) => {
    const effectiveDueDate = getEffectiveActionPlanDueDate(plan);
    const effectiveDueDateKey = getDateOnlyKey(effectiveDueDate);
    const bucket = getReminderBucket({
        cutoffDateKey,
        effectiveDueDateKey,
        upcomingWindowDays: policy.upcomingWindowDays,
    });
    if (!bucket)
        return null;
    const officialProgress = getOfficialActionPlanProgress(plan.status);
    const observationCode = `${plan.observation.auditReport.reportNumber} / OBS-${String(plan.observation.observationNumber).padStart(3, "0")}`;
    const approvedExtension = plan.deadlineExtensionRequests?.find((extension) => extension.status === "MANAGER_APPROVED");
    return {
        actionPlanId: plan.id,
        area: plan.observationArea.area.name,
        bucket,
        deadlineStatus: getActionPlanDeadlineStatus(plan, dateAtNoonUtc(cutoffDateKey), "UTC"),
        description: plan.description,
        effectiveDueDate: dateLabel(effectiveDueDateKey),
        effectiveDueDateKey,
        executor: showExecutor ? plan.responsibleUser?.name : undefined,
        observation: `${observationCode} — ${plan.observation.title}`,
        observationId: plan.observation.id,
        officialProgress: officialProgress.label,
        officialProgressPercent: officialProgress.percent,
        originalDueDate: dateLabel(getDateOnlyKey(plan.originalDueDate)),
        plan: plan.title || plan.description,
        processOwner: policy.role === "EXECUTOR" ? undefined : plan.observationArea.processOwner?.name,
        reprogrammed: Boolean(approvedExtension),
        report: `${plan.observation.auditReport.reportNumber} — ${plan.observation.auditReport.title}`,
        reportedProgressPercent: plan.progressEvaluations?.[0]?.reportedProgressPercent ?? null,
        risk: plan.observation.riskLevel.name,
        riskSeverity: plan.observation.riskLevel.severityOrder,
    };
};
const bucketOrder = {
    DUE_TODAY: 1,
    OVERDUE: 0,
    UPCOMING: 2,
};
const sortDigestPlans = (plans) => plans.sort((left, right) => bucketOrder[left.bucket] - bucketOrder[right.bucket] ||
    left.effectiveDueDateKey.localeCompare(right.effectiveDueDateKey) ||
    left.riskSeverity - right.riskSeverity ||
    left.plan.localeCompare(right.plan));
const buildDigests = async (input) => {
    const byRecipient = new Map();
    for (const policy of input.policies) {
        if (!policy.enabled)
            continue;
        const recipients = await prisma.user.findMany({
            select: userSelect,
            where: {
                deletedAt: null,
                isActive: true,
                userRoles: {
                    some: {
                        role: { code: policy.role, deletedAt: null },
                    },
                },
            },
        });
        const showExecutor = input.policies.some((item) => item.role !== "EXECUTOR");
        for (const recipient of recipients) {
            const plans = await findActionPlans(policy, input.cutoffDateKey, recipient.id);
            for (const plan of plans) {
                const digestPlan = toDigestPlan(plan, input.cutoffDateKey, policy, showExecutor);
                if (!digestPlan)
                    continue;
                const key = recipient.email.trim().toLowerCase() || recipient.id;
                const current = byRecipient.get(key) ?? {
                    planIds: new Set(),
                    plans: [],
                    recipient,
                    rolePolicies: [],
                    roles: [],
                    upcomingWindowDays: 0,
                };
                if (current.planIds.has(digestPlan.actionPlanId))
                    continue;
                current.planIds.add(digestPlan.actionPlanId);
                current.plans.push(digestPlan);
                if (!current.roles.includes(policy.role))
                    current.roles.push(policy.role);
                if (!current.rolePolicies.some((item) => item.role === policy.role))
                    current.rolePolicies.push(policy);
                current.upcomingWindowDays = Math.max(current.upcomingWindowDays, policy.upcomingWindowDays);
                byRecipient.set(key, current);
            }
        }
    }
    return [...byRecipient.values()].map((digest) => ({
        plans: sortDigestPlans(digest.plans),
        recipient: digest.recipient,
        roles: digest.roles,
        upcomingWindowDays: digest.upcomingWindowDays,
    }));
};
const buildTargetUrl = (digest) => {
    const params = new URLSearchParams({
        "filter.activeOnly": "true",
        periodField: "currentDueDate",
    });
    if (digest.roles.length === 1 && digest.roles[0] === "EXECUTOR") {
        params.set("filter.executorId", digest.recipient.id);
    }
    if (digest.roles.length === 1 && digest.roles[0] === "PROCESS_OWNER") {
        params.set("filter.processOwnerId", digest.recipient.id);
    }
    return `${env.FRONTEND_URL}/reportes?${params.toString()}`;
};
const summaryForDigest = (digest) => ({
    dueToday: digest.plans.filter((plan) => plan.bucket === "DUE_TODAY").length,
    overdue: digest.plans.filter((plan) => plan.bucket === "OVERDUE").length,
    reprogrammed: digest.plans.filter((plan) => plan.reprogrammed).length,
    upcoming: digest.plans.filter((plan) => plan.bucket === "UPCOMING").length,
});
const makePayload = (input) => {
    const counts = summaryForDigest(input.digest);
    const roleCadence = input.roleCadence;
    const cadenceLabel = roleCadence === "bimonthly"
        ? "bimestral"
        : roleCadence === "monthly"
            ? "mensual"
            : roleCadence;
    return {
        cutoffDate: `${Number(input.cutoffDateKey.slice(8))} de ${monthLabel(input.cutoffDateKey)}`,
        ...counts,
        plans: input.digest.plans,
        periodKey: input.periodKey,
        platformLink: buildTargetUrl(input.digest),
        recipientEmail: input.digest.recipient.email,
        recipientName: input.digest.recipient.name,
        recipientUserId: input.digest.recipient.id,
        roleCadence: cadenceLabel,
        runType: input.runType,
        subject: `${cadenceLabel.charAt(0).toUpperCase() + cadenceLabel.slice(1)} de plazos — NIBOL`,
    };
};
const createNotificationIfMissing = async (input) => {
    const existing = await prisma.notification.findUnique({
        where: { dedupeKey: input.dedupeKey },
    });
    if (existing)
        return { created: false, notification: existing };
    try {
        const notification = await prisma.notification.create({
            data: {
                dedupeKey: input.dedupeKey,
                entityId: input.entityId,
                entityType: "DEADLINE_REMINDER",
                eventType: DEADLINE_REMINDER_EVENT_TYPE,
                message: input.message,
                priority: NotificationPriority.HIGH,
                targetUrl: input.targetUrl,
                title: input.title,
                type: NotificationType.WARNING,
                userId: input.userId,
            },
        });
        return { created: true, notification };
    }
    catch (error) {
        if (error.code !== "P2002")
            throw error;
        return {
            created: false,
            notification: await prisma.notification.findUniqueOrThrow({
                where: { dedupeKey: input.dedupeKey },
            }),
        };
    }
};
const notificationMessage = (digest) => {
    const counts = summaryForDigest(digest);
    const parts = [
        counts.overdue > 0
            ? `${counts.overdue} plan${counts.overdue === 1 ? "" : "es"} vencido${counts.overdue === 1 ? "" : "s"}`
            : "",
        counts.dueToday > 0 ? `${counts.dueToday} vence hoy` : "",
        counts.upcoming > 0
            ? `${counts.upcoming} próximo${counts.upcoming === 1 ? "" : "s"} a vencer`
            : "",
    ].filter(Boolean);
    return `Tienes ${parts.join(", ")}.`;
};
const deliverReminderEmailDelivery = async (deliveryId) => {
    const delivery = await prisma.notificationDelivery.findUnique({
        select: {
            payloadJson: true,
            recipientEmail: true,
            status: true,
        },
        where: { id: deliveryId },
    });
    if (!delivery || delivery.status === NotificationDeliveryStatus.SENT) {
        return {
            attempted: false,
            status: delivery?.status ?? NotificationDeliveryStatus.SKIPPED,
        };
    }
    if (!delivery.payloadJson || !delivery.recipientEmail) {
        await prisma.notificationDelivery.update({
            data: {
                errorMessage: "La entrega no tiene una instantánea válida.",
                status: NotificationDeliveryStatus.SKIPPED,
            },
            where: { id: deliveryId },
        });
        return { attempted: false, status: NotificationDeliveryStatus.SKIPPED };
    }
    if (!(await notificationService.claimEmailDelivery(deliveryId))) {
        const current = await prisma.notificationDelivery.findUnique({
            select: { status: true },
            where: { id: deliveryId },
        });
        return {
            attempted: false,
            status: current?.status ?? NotificationDeliveryStatus.SKIPPED,
        };
    }
    const payload = delivery.payloadJson;
    try {
        const result = await emailService.sendTemplate({
            template: "deadlineReminder",
            to: delivery.recipientEmail,
            variables: {
                ...payload,
                appName: "NIBOL Bolivia",
                userName: payload.recipientName,
                plans: payload.plans.map((plan) => ({
                    area: plan.area,
                    bucket: plan.bucket,
                    deadlineStatus: plan.deadlineStatus === "VENCIDO" ? "Vencido" : "Vigente",
                    description: plan.description,
                    effectiveDueDate: plan.effectiveDueDate,
                    ...(plan.executor ? { executor: plan.executor } : {}),
                    observation: plan.observation,
                    officialProgress: plan.officialProgress,
                    officialProgressPercent: plan.officialProgressPercent,
                    plan: plan.plan,
                    reprogrammed: plan.reprogrammed,
                    report: plan.report,
                    risk: plan.risk,
                })),
            },
        });
        await notificationService.completeEmailDelivery(deliveryId, result);
        return {
            attempted: true,
            status: result.success
                ? NotificationDeliveryStatus.SENT
                : NotificationDeliveryStatus.FAILED,
            ...(result.success ? {} : { error: result.error }),
        };
    }
    catch (error) {
        const message = errorMessage(error);
        await notificationService.completeEmailDelivery(deliveryId, {
            error: message,
            success: false,
        });
        return {
            attempted: true,
            error: message,
            status: NotificationDeliveryStatus.FAILED,
        };
    }
};
const deliverPendingReminderEmails = async () => {
    const deliveries = await prisma.notificationDelivery.findMany({
        orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
        select: { id: true },
        take: 100,
        where: {
            attempts: { lt: MAX_DELIVERY_ATTEMPTS },
            channel: NotificationDeliveryChannel.EMAIL,
            dedupeKey: { startsWith: "deadline-reminder:" },
            OR: [
                { lastAttemptAt: null, status: NotificationDeliveryStatus.PENDING },
                {
                    lastAttemptAt: { lt: new Date(Date.now() - 15 * 60_000) },
                    status: NotificationDeliveryStatus.PENDING,
                },
                {
                    lastAttemptAt: { lt: new Date(Date.now() - 5 * 60_000) },
                    status: NotificationDeliveryStatus.FAILED,
                },
            ],
        },
    });
    const outcomes = [];
    for (const delivery of deliveries) {
        outcomes.push(await deliverReminderEmailDelivery(delivery.id));
    }
    return outcomes;
};
const acquireLock = async () => {
    const now = new Date();
    const lockToken = randomUUID();
    const expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    const existing = await prisma.scheduledJobLock.findUnique({
        where: { jobName: DEADLINE_REMINDER_LOCK_NAME },
    });
    if (!existing) {
        try {
            await prisma.scheduledJobLock.create({
                data: {
                    acquiredAt: now,
                    expiresAt,
                    jobName: DEADLINE_REMINDER_LOCK_NAME,
                    lockToken,
                },
            });
        }
        catch (error) {
            if (error.code !== "P2002")
                throw error;
            return null;
        }
    }
    else {
        const claimed = await prisma.scheduledJobLock.updateMany({
            data: { acquiredAt: now, expiresAt, lockToken },
            where: {
                expiresAt: { lte: now },
                jobName: DEADLINE_REMINDER_LOCK_NAME,
            },
        });
        if (claimed.count !== 1)
            return null;
    }
    return async () => {
        await prisma.scheduledJobLock.deleteMany({
            where: { jobName: DEADLINE_REMINDER_LOCK_NAME, lockToken },
        });
    };
};
const createExecution = async (input) => {
    try {
        const data = {
            cadenceKey: input.cadenceKey,
            ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
            jobName: DEADLINE_REMINDER_JOB_NAME,
            periodKey: input.periodKey,
            runType: input.runType,
            ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
            startedAt: input.startedAt,
            status: ScheduledJobExecutionStatus.RUNNING,
            triggeredBy: input.triggeredBy,
            ...(input.triggeredByUserId
                ? { triggeredByUserId: input.triggeredByUserId }
                : {}),
        };
        return {
            created: true,
            execution: await prisma.scheduledJobExecution.create({
                data,
            }),
        };
    }
    catch (error) {
        if (error.code !== "P2002" || !input.dedupeKey)
            throw error;
        const existing = await prisma.scheduledJobExecution.findUniqueOrThrow({
            where: { dedupeKey: input.dedupeKey },
        });
        if (existing.status === ScheduledJobExecutionStatus.SUCCESS ||
            existing.status === ScheduledJobExecutionStatus.PARTIAL) {
            return { created: false, execution: existing };
        }
        return {
            created: true,
            execution: await prisma.scheduledJobExecution.update({
                data: {
                    cadenceKey: input.cadenceKey,
                    errorMessage: null,
                    finishedAt: null,
                    failuresCount: 0,
                    periodKey: input.periodKey,
                    runType: input.runType,
                    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
                    startedAt: input.startedAt,
                    status: ScheduledJobExecutionStatus.RUNNING,
                    triggeredBy: input.triggeredBy,
                    ...(input.triggeredByUserId
                        ? { triggeredByUserId: input.triggeredByUserId }
                        : {}),
                },
                where: { id: existing.id },
            }),
        };
    }
};
const notifyDigest = async (input) => {
    const payload = makePayload({
        cutoffDateKey: input.cutoffDateKey,
        digest: input.digest,
        periodKey: input.periodKey,
        roleCadence: input.roleCadence,
        runType: input.runType,
    });
    const baseKey = input.runType === SCHEDULED_RUN
        ? `deadline-reminder:${input.roleCadenceKey}:${input.periodKey}:${input.digest.recipient.id}`
        : `deadline-reminder:manual:${input.executionId}:${input.digest.recipient.id}`;
    let notified = false;
    if (input.channels.notifyInApp) {
        const inAppKey = `${baseKey}:IN_APP`;
        const notificationResult = await createNotificationIfMissing({
            dedupeKey: inAppKey,
            entityId: input.executionId,
            message: notificationMessage(input.digest),
            targetUrl: payload.platformLink,
            title: "Recordatorio de plazos",
            userId: input.digest.recipient.id,
        });
        if (notificationResult.created)
            input.summary.notificationsCreated += 1;
        await notificationService.createDelivery({
            channel: NotificationDeliveryChannel.IN_APP,
            dedupeKey: inAppKey,
            notificationId: notificationResult.notification.id,
            payloadJson: toJson(payload),
            recipientEmail: input.digest.recipient.email,
            recipientUserId: input.digest.recipient.id,
            status: NotificationDeliveryStatus.SENT,
        });
        notified = true;
    }
    if (input.channels.notifyByEmail) {
        const emailDelivery = await notificationService.createDelivery({
            channel: NotificationDeliveryChannel.EMAIL,
            dedupeKey: `${baseKey}:EMAIL`,
            payloadJson: toJson(payload),
            recipientEmail: input.digest.recipient.email,
            recipientUserId: input.digest.recipient.id,
        });
        const result = await deliverReminderEmailDelivery(emailDelivery.id);
        if (result.status === NotificationDeliveryStatus.SENT && result.attempted)
            input.summary.emailsSent += 1;
        if (result.status === NotificationDeliveryStatus.FAILED) {
            input.summary.failuresCount += 1;
            input.summary.failures.push({
                entityId: input.digest.recipient.id,
                entityType: "deadline_reminder_email",
                message: result.error ?? "No fue posible enviar el recordatorio.",
            });
        }
        notified = true;
    }
    if (notified)
        input.summary.recipientsNotified += 1;
};
const executePeriod = async (input) => {
    const executionClaim = await createExecution(input);
    const summary = {
        emailsSent: 0,
        executionIds: [executionClaim.execution.id],
        failures: [],
        failuresCount: 0,
        finishedAt: "",
        jobName: DEADLINE_REMINDER_JOB_NAME,
        lockSkipped: false,
        notificationsCreated: 0,
        plansIncluded: 0,
        recipientsEvaluated: 0,
        recipientsNotified: 0,
        startedAt: input.startedAt.toISOString(),
        status: "SUCCESS",
    };
    if (!executionClaim.created) {
        summary.finishedAt = new Date().toISOString();
        return summary;
    }
    try {
        const digests = await buildDigests({
            cutoffDateKey: input.cutoffDateKey,
            policies: input.policies,
        });
        summary.recipientsEvaluated = digests.length;
        summary.plansIncluded = new Set(digests.flatMap((digest) => digest.plans.map((plan) => plan.actionPlanId))).size;
        const policy = input.policies[0];
        const cadenceLabel = getCadenceLabel(policy.cadenceMonths);
        for (const digest of digests) {
            try {
                await notifyDigest({
                    channels: input.channels,
                    cutoffDateKey: input.cutoffDateKey,
                    digest,
                    executionId: executionClaim.execution.id,
                    periodKey: input.periodKey,
                    roleCadence: cadenceLabel,
                    roleCadenceKey: input.cadenceKey,
                    runType: input.runType,
                    summary,
                });
            }
            catch (error) {
                summary.failuresCount += 1;
                summary.failures.push({
                    entityId: digest.recipient.id,
                    entityType: "deadline_reminder_recipient",
                    message: errorMessage(error),
                });
            }
        }
        summary.status = summary.failuresCount > 0 ? "PARTIAL" : "SUCCESS";
        summary.finishedAt = new Date().toISOString();
        await prisma.scheduledJobExecution.update({
            data: {
                detailsJson: toJson({
                    cadenceKey: input.cadenceKey,
                    cutoffDate: input.cutoffDateKey,
                    failures: summary.failures.slice(0, 100),
                    plansIncluded: summary.plansIncluded,
                    recipientsEvaluated: summary.recipientsEvaluated,
                    recipientsNotified: summary.recipientsNotified,
                    runType: input.runType,
                }),
                emailsSent: summary.emailsSent,
                failuresCount: summary.failuresCount,
                finishedAt: new Date(),
                notificationsCreated: summary.notificationsCreated,
                processedCount: summary.plansIncluded,
                status: summary.status === "PARTIAL"
                    ? ScheduledJobExecutionStatus.PARTIAL
                    : ScheduledJobExecutionStatus.SUCCESS,
            },
            where: { id: executionClaim.execution.id },
        });
        return summary;
    }
    catch (error) {
        summary.failuresCount += 1;
        summary.failures.push({
            entityId: executionClaim.execution.id,
            entityType: "deadline_reminder_run",
            message: errorMessage(error),
        });
        summary.status = "FAILED";
        summary.finishedAt = new Date().toISOString();
        await prisma.scheduledJobExecution.update({
            data: {
                detailsJson: toJson({ failures: summary.failures }),
                errorMessage: errorMessage(error),
                failuresCount: summary.failuresCount,
                finishedAt: new Date(),
                status: ScheduledJobExecutionStatus.FAILED,
            },
            where: { id: executionClaim.execution.id },
        });
        return summary;
    }
};
const mergeSummaries = (target, source) => {
    target.emailsSent += source.emailsSent;
    target.executionIds.push(...source.executionIds);
    target.failures.push(...source.failures);
    target.failuresCount += source.failuresCount;
    target.notificationsCreated += source.notificationsCreated;
    target.plansIncluded += source.plansIncluded;
    target.recipientsEvaluated += source.recipientsEvaluated;
    target.recipientsNotified += source.recipientsNotified;
};
const mapExecution = (execution) => ({
    ...execution,
    createdAt: execution.createdAt.toISOString(),
    finishedAt: execution.finishedAt?.toISOString() ?? null,
    scheduledFor: execution.scheduledFor?.toISOString() ?? null,
    startedAt: execution.startedAt.toISOString(),
});
export const deadlineReminderService = {
    async updatePolicy(role, input) {
        const previous = (await readPolicies()).find((policy) => policy.role === role);
        const values = [
            [getDeadlineReminderParameterKey(role, "enabled"), String(input.enabled)],
            [getDeadlineReminderParameterKey(role, "cutoffDay"), String(input.cutoffDay)],
            [getDeadlineReminderParameterKey(role, "cadenceMonths"), String(input.cadenceMonths)],
            [
                getDeadlineReminderParameterKey(role, "upcomingWindowDays"),
                String(input.upcomingWindowDays),
            ],
        ];
        await prisma.$transaction(values.map(([key, value]) => prisma.systemParameter.upsert({
            create: {
                active: true,
                description: DEADLINE_REMINDER_PARAMETER_DEFAULTS[key].description,
                editable: true,
                group: "notificaciones_automaticas",
                key,
                name: DEADLINE_REMINDER_PARAMETER_DEFAULTS[key].name,
                value,
                valueType: DEADLINE_REMINDER_PARAMETER_DEFAULTS[key].valueType,
            },
            update: { active: true, value },
            where: { key },
        })));
        return {
            current: (await readPolicies()).find((policy) => policy.role === role),
            previous,
        };
    },
    async getConfiguration(now = new Date()) {
        const [policies, timeZone] = await Promise.all([
            readPolicies(),
            readBusinessTimeZone(),
        ]);
        const schedules = await Promise.all(policies.map(async (policy) => {
            const cadenceKey = getScheduleGroupKey(policy);
            const lastExecution = await prisma.scheduledJobExecution.findFirst({
                orderBy: { scheduledFor: "desc" },
                select: {
                    detailsJson: true,
                    finishedAt: true,
                    id: true,
                    periodKey: true,
                    status: true,
                },
                where: {
                    cadenceKey,
                    jobName: DEADLINE_REMINDER_JOB_NAME,
                    runType: SCHEDULED_RUN,
                },
            });
            const next = getNextScheduledReminderPeriod({
                createdAt: policy.createdAt,
                ...(lastExecution?.periodKey
                    ? { lastPeriodKey: lastExecution.periodKey }
                    : {}),
                now,
                policy,
                timeZone,
            });
            return {
                cadenceKey,
                lastExecution: lastExecution
                    ? {
                        ...lastExecution,
                        finishedAt: lastExecution.finishedAt?.toISOString() ?? null,
                    }
                    : null,
                nextExecution: next?.scheduledFor.toISOString() ?? null,
                role: policy.role,
            };
        }));
        return {
            policies,
            roleLabels: DEADLINE_REMINDER_ROLE_LABELS,
            schedules,
            timezone: timeZone,
        };
    },
    async preview(input) {
        const [policies, timeZone] = await Promise.all([
            readPolicies(),
            readBusinessTimeZone(),
        ]);
        const policy = policies.find((item) => item.role === input.role);
        const cutoffDateKey = input.cutoffDateKey ?? getBusinessDateKey(input.now, timeZone);
        const digests = await buildDigests({
            cutoffDateKey,
            policies: [policy],
        });
        const totals = digests.reduce((result, digest) => {
            const counts = summaryForDigest(digest);
            result.dueToday += counts.dueToday;
            result.overdue += counts.overdue;
            result.plans += digest.plans.length;
            result.reprogrammed += counts.reprogrammed;
            result.upcoming += counts.upcoming;
            return result;
        }, { dueToday: 0, overdue: 0, plans: 0, reprogrammed: 0, upcoming: 0 });
        return {
            cutoffDate: cutoffDateKey,
            policy,
            recipients: digests,
            timezone: timeZone,
            totals: { ...totals, recipients: digests.length },
            willSend: false,
        };
    },
    async run(options) {
        const startedAt = options.now ?? new Date();
        const releaseLock = await acquireLock();
        const baseSummary = {
            emailsSent: 0,
            executionIds: [],
            failures: [],
            failuresCount: 0,
            finishedAt: "",
            jobName: DEADLINE_REMINDER_JOB_NAME,
            lockSkipped: false,
            notificationsCreated: 0,
            plansIncluded: 0,
            recipientsEvaluated: 0,
            recipientsNotified: 0,
            startedAt: startedAt.toISOString(),
            status: "SUCCESS",
        };
        if (!releaseLock) {
            return {
                ...baseSummary,
                finishedAt: new Date().toISOString(),
                lockSkipped: true,
            };
        }
        try {
            const [policies, channels, timeZone] = await Promise.all([
                readPolicies(),
                readChannels(),
                readBusinessTimeZone(),
            ]);
            const retryResults = await deliverPendingReminderEmails();
            baseSummary.emailsSent += retryResults.filter((result) => result.status === NotificationDeliveryStatus.SENT && result.attempted).length;
            baseSummary.failures.push(...retryResults
                .filter((result) => result.status === NotificationDeliveryStatus.FAILED)
                .map((result) => ({
                entityId: "pending-delivery",
                entityType: "deadline_reminder_email",
                message: result.error ?? "No fue posible reintentar el recordatorio.",
            })));
            baseSummary.failuresCount = baseSummary.failures.length;
            if (options.mode === MANUAL_RUN) {
                const selected = policies.filter((policy) => !options.role || policy.role === options.role);
                const groups = new Map();
                for (const policy of selected) {
                    const key = getScheduleGroupKey(policy);
                    groups.set(key, [...(groups.get(key) ?? []), policy]);
                }
                const cutoffDateKey = options.cutoffDateKey ?? getBusinessDateKey(startedAt, timeZone);
                for (const [cadenceKey, group] of groups) {
                    const period = cutoffDateKey.slice(0, 7);
                    const result = await executePeriod({
                        cadenceKey,
                        channels,
                        cutoffDateKey,
                        periodKey: period,
                        runType: MANUAL_RUN,
                        scheduledFor: dateAtNoonUtc(cutoffDateKey),
                        startedAt,
                        triggeredBy: options.triggeredBy,
                        ...(options.triggeredByUserId
                            ? { triggeredByUserId: options.triggeredByUserId }
                            : {}),
                        policies: group,
                    });
                    mergeSummaries(baseSummary, result);
                }
            }
            else {
                const groups = new Map();
                for (const policy of policies.filter((item) => item.enabled)) {
                    const key = getScheduleGroupKey(policy);
                    groups.set(key, [...(groups.get(key) ?? []), policy]);
                }
                for (const [cadenceKey, group] of groups) {
                    const latest = await prisma.scheduledJobExecution.findFirst({
                        orderBy: { scheduledFor: "desc" },
                        select: { periodKey: true },
                        where: {
                            cadenceKey,
                            jobName: DEADLINE_REMINDER_JOB_NAME,
                            runType: SCHEDULED_RUN,
                            status: {
                                in: [
                                    ScheduledJobExecutionStatus.PARTIAL,
                                    ScheduledJobExecutionStatus.SUCCESS,
                                ],
                            },
                        },
                    });
                    const periods = getScheduledReminderPeriods({
                        createdAt: group.reduce((earliest, policy) => policy.createdAt < earliest ? policy.createdAt : earliest, group[0].createdAt),
                        ...(latest?.periodKey ? { lastPeriodKey: latest.periodKey } : {}),
                        now: startedAt,
                        policy: group[0],
                        timeZone,
                    });
                    for (const period of periods) {
                        const result = await executePeriod({
                            cadenceKey,
                            channels,
                            cutoffDateKey: period.cutoffDateKey,
                            dedupeKey: `${DEADLINE_REMINDER_JOB_NAME}:${cadenceKey}:${period.periodKey}`,
                            periodKey: period.periodKey,
                            runType: SCHEDULED_RUN,
                            scheduledFor: period.scheduledFor,
                            startedAt,
                            triggeredBy: options.triggeredBy,
                            ...(options.triggeredByUserId
                                ? { triggeredByUserId: options.triggeredByUserId }
                                : {}),
                            policies: group,
                        });
                        mergeSummaries(baseSummary, result);
                    }
                }
            }
            baseSummary.status = baseSummary.failuresCount > 0 ? "PARTIAL" : "SUCCESS";
            baseSummary.finishedAt = new Date().toISOString();
            return baseSummary;
        }
        catch (error) {
            baseSummary.failuresCount += 1;
            baseSummary.failures.push({
                entityId: DEADLINE_REMINDER_JOB_NAME,
                entityType: "deadline_reminder_run",
                message: errorMessage(error),
            });
            baseSummary.status = "FAILED";
            baseSummary.finishedAt = new Date().toISOString();
            logger.error("Deadline reminder scheduler failed.", {
                message: errorMessage(error),
            });
            return baseSummary;
        }
        finally {
            await releaseLock();
        }
    },
    async listExecutions(page, perPage) {
        const where = { jobName: DEADLINE_REMINDER_JOB_NAME };
        const [total, data] = await prisma.$transaction([
            prisma.scheduledJobExecution.count({ where }),
            prisma.scheduledJobExecution.findMany({
                orderBy: { startedAt: "desc" },
                skip: (page - 1) * perPage,
                take: perPage,
                where,
            }),
        ]);
        return {
            data: data.map(mapExecution),
            pagination: { page, perPage, total },
        };
    },
    async getLatestExecution() {
        const execution = await prisma.scheduledJobExecution.findFirst({
            orderBy: { startedAt: "desc" },
            where: { jobName: DEADLINE_REMINDER_JOB_NAME },
        });
        return execution ? mapExecution(execution) : null;
    },
};
//# sourceMappingURL=deadline-reminder.service.js.map