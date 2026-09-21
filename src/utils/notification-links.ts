import { env } from "./env.js";
import { buildObservationUrl } from "./observation-links.js";

export type NotificationLinkInput = {
  actionPlanId?: string | null | undefined;
  advanceId?: string | null | undefined;
  entityId?: string | null | undefined;
  entityType?: string | null | undefined;
  eventType?: string | null | undefined;
  extensionId?: string | null | undefined;
  observationId?: string | null | undefined;
  workflowTaskId?: string | null | undefined;
};

const normalize = (value?: string | null): string =>
  value
    ?.trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replaceAll("-", "_") ?? "";

const pathId = (value: string): string => encodeURIComponent(value);

export const buildPendingWorkUrl = (): string =>
  "/planes-accion?filter.status=NOT_STARTED,STARTED,WITH_PROGRESS";

export const buildFrontendUrl = (path: string): string => {
  const base = `${env.FRONTEND_URL.replace(/\/+$/, "")}/`;
  return new URL(path, base).toString();
};

export const resolveNotificationTarget = (
  input: NotificationLinkInput,
): string | null => {
  const entityType = normalize(input.entityType);
  const eventType = normalize(input.eventType);
  const entityId = input.entityId?.trim() || null;

  const workflowTaskId =
    input.workflowTaskId ??
    (entityType.includes("workflow_task") ? entityId : null);
  if (workflowTaskId) return `/aprobaciones/flujos/${pathId(workflowTaskId)}`;

  const extensionId =
    input.extensionId ?? (entityType.includes("extension") ? entityId : null);
  if (extensionId || eventType.includes("extension")) {
    return extensionId
      ? `/ampliaciones-plazo/${pathId(extensionId)}`
      : "/aprobaciones/pendientes";
  }

  const advanceId =
    input.advanceId ??
    (entityType.includes("progress") || entityType.includes("advance")
      ? entityId
      : null);
  if (advanceId || eventType.includes("progress")) {
    const context = {
      ...(input.actionPlanId ? { planId: input.actionPlanId } : {}),
      ...(advanceId ? { advanceId } : {}),
      tab: "plans" as const,
    };
    return input.observationId
      ? buildObservationUrl(input.observationId, context)
      : "/aprobaciones/pendientes";
  }

  const actionPlanId =
    input.actionPlanId ??
    (entityType.includes("action_plan") || entityType.includes("remediation")
      ? entityId
      : null);
  if (actionPlanId) return `/planes-accion/${pathId(actionPlanId)}`;
  if (eventType.includes("action_plan") || eventType.includes("remediation")) {
    return "/planes-accion";
  }

  const observationId =
    input.observationId ??
    (entityType.includes("observation") ? entityId : null);
  if (observationId) {
    return buildObservationUrl(observationId, {
      ...(eventType.includes("assignment") ? { tab: "summary" as const } : {}),
    });
  }
  if (eventType.includes("observation")) return "/observaciones";

  if (
    entityType.includes("deadline_reminder") ||
    eventType.includes("deadline") ||
    eventType.includes("due") ||
    eventType.includes("overdue")
  ) {
    return buildPendingWorkUrl();
  }
  if (
    eventType.includes("approval") ||
    eventType.includes("review") ||
    eventType.includes("returned")
  ) {
    return "/aprobaciones/pendientes";
  }

  return null;
};
