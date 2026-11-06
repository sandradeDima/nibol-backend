import { notificationService } from "../../services/notification-service.js";
export const notifyActionPlanAssigned = async (input) => {
    const message = `Se te asignó el plan de acción “${input.planDescription}” de la observación “${input.observationTitle}” (${input.observationDisplayCode}).`;
    const targetUrl = `/observaciones/${input.observationId}?tab=plans`;
    await Promise.all([
        notificationService.create({
            dedupeKey: `${input.dedupeKey}:${input.userId}:notification`,
            entityId: input.entityId,
            entityType: input.entityType,
            eventType: input.eventType,
            message,
            targetUrl,
            title: "Nuevo plan de acción asignado",
            type: "info",
            userId: input.userId,
        }),
        notificationService.sendEmailNotification({
            dedupeKey: input.dedupeKey,
            eventType: input.eventType,
            message,
            targetUrl,
            title: "Nuevo plan de acción asignado",
            userId: input.userId,
        }),
    ]);
};
export const notifyActionPlanExecutorChanged = async (input) => {
    const recipients = new Map([
        [input.previousExecutor.id, input.previousExecutor],
        [input.newExecutor.id, input.newExecutor],
    ]);
    const message = `El ejecutor del plan “${input.planDescription}” de la observación “${input.observationTitle}” (${input.observationDisplayCode}) cambió de ${input.previousExecutor.name} a ${input.newExecutor.name}.`;
    await Promise.all([...recipients.values()].map((recipient) => Promise.all([
        notificationService.create({
            dedupeKey: `action-plan-executor:${input.actionPlanId}:${input.previousExecutor.id}:${input.newExecutor.id}:${recipient.id}:notification`,
            entityId: input.actionPlanId,
            entityType: "ACTION_PLAN",
            eventType: "ACTION_PLAN_EXECUTOR_CHANGED",
            message,
            targetUrl: `/observaciones/${input.observationId}?tab=plans`,
            title: "Ejecutor del plan actualizado",
            type: "info",
            userId: recipient.id,
        }),
        notificationService.sendEmailNotification({
            dedupeKey: `action-plan-executor:${input.actionPlanId}:${input.previousExecutor.id}:${input.newExecutor.id}:${recipient.id}`,
            eventType: "ACTION_PLAN_EXECUTOR_CHANGED",
            message,
            targetUrl: `/observaciones/${input.observationId}?tab=plans`,
            title: "Ejecutor del plan actualizado",
            userId: recipient.id,
        }),
    ])));
};
//# sourceMappingURL=action-plan-notification.service.js.map