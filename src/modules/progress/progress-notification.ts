export type ProgressNotificationKind =
  | "pending"
  | "approved"
  | "returned"
  | "planCompleted"
  | "observationCompleted";

export const formatObservationReference = (
  reportNumber: string,
  observationNumber: number,
): string =>
  `${reportNumber} / OBS-${String(observationNumber).padStart(3, "0")}`;

export const buildProgressNotification = (
  kind: ProgressNotificationKind,
  input: {
    actionPlanTitle: string;
    observationReference: string;
    observationTitle: string;
  },
) => {
  const shorten = (value: string) => {
    const title = value.trim().replace(/\s+/g, " ");
    return title.length > 80 ? `${title.slice(0, 79).trimEnd()}…` : title;
  };
  const plan = `“${shorten(input.actionPlanTitle)}”`;
  const observation = `“${shorten(input.observationTitle)}”`;
  const reference = input.observationReference.trim()
    ? ` (${input.observationReference.trim()})`
    : "";

  switch (kind) {
    case "pending":
      return {
        eventType: "PROGRESS_PENDING_REVIEW",
        message: `El plan de acción ${plan}${reference} requiere su revisión y evaluación.`,
        title: "Plan de acción pendiente de evaluación",
        type: "warning" as const,
      };
    case "approved":
      return {
        eventType: "PROGRESS_APPROVED",
        message: `Auditoría aprobó la evaluación de avance del plan de acción ${plan}${reference}.`,
        title: "Evaluación de avance aprobada",
        type: "success" as const,
      };
    case "returned":
      return {
        eventType: "PROGRESS_RETURNED",
        message: `Auditoría devolvió la evaluación de avance del plan de acción ${plan}${reference}. Revise los comentarios y vuelva a enviar las evidencias.`,
        title: "Evaluación de avance devuelta",
        type: "warning" as const,
      };
    case "planCompleted":
      return {
        eventType: "ACTION_PLAN_COMPLETED",
        message: `Se concluyó exitosamente el plan de acción ${plan} de la observación ${observation}${reference}.`,
        title: "Plan de acción concluido",
        type: "info" as const,
      };
    case "observationCompleted":
      return {
        eventType: "OBSERVATION_CLOSED",
        message: `Se concluyó exitosamente la observación ${observation}${reference}.`,
        title: "Observación concluida",
        type: "info" as const,
      };
  }
};
