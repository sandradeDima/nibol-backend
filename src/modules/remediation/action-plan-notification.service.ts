import { notificationService } from "../../services/notification-service.js";

type ActionPlanCreationEvent =
  | "ACTION_PLAN_CREATED_AFTER_OBSERVATION"
  | "ACTION_PLAN_CREATED_WITH_OBSERVATION";

export const notifyActionPlanAssigned = async (input: {
  dedupeKey: string;
  entityId: string;
  entityType: "ACTION_PLAN" | "OBSERVATION";
  eventType: ActionPlanCreationEvent;
  observationDisplayCode: string;
  observationId: string;
  observationTitle: string;
  planDescription: string;
  userId: string;
}) => {
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

export const notifyActionPlanExecutorChanged = async (input: {
  actionPlanId: string;
  newExecutor: { id: string; name: string };
  observationDisplayCode: string;
  observationId: string;
  observationTitle: string;
  planDescription: string;
  previousExecutor: { id: string; name: string };
}) => {
  const recipients = new Map([
    [input.previousExecutor.id, input.previousExecutor],
    [input.newExecutor.id, input.newExecutor],
  ]);
  const message = `El ejecutor del plan “${input.planDescription}” de la observación “${input.observationTitle}” (${input.observationDisplayCode}) cambió de ${input.previousExecutor.name} a ${input.newExecutor.name}.`;
  await Promise.all(
    [...recipients.values()].map((recipient) =>
      Promise.all([
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
      ]),
    ),
  );
};
