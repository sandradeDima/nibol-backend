export const formatObservationReference = (reportNumber, observationNumber) => `${reportNumber} / OBS-${String(observationNumber).padStart(3, "0")}`;
export const buildProgressNotification = (kind, input) => {
    const shorten = (value) => {
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
                type: "warning",
            };
        case "approved":
            return {
                eventType: "PROGRESS_APPROVED",
                message: `Auditoría aprobó la evaluación de avance del plan de acción ${plan}${reference}.`,
                title: "Evaluación de avance aprobada",
                type: "success",
            };
        case "returned":
            return {
                eventType: "PROGRESS_RETURNED",
                message: `Auditoría devolvió la evaluación de avance del plan de acción ${plan}${reference}. Revise los comentarios y vuelva a enviar las evidencias.`,
                title: "Evaluación de avance devuelta",
                type: "warning",
            };
        case "planCompleted":
            return {
                eventType: "ACTION_PLAN_COMPLETED",
                message: `Se concluyó exitosamente el plan de acción ${plan} de la observación ${observation}${reference}.`,
                title: "Plan de acción concluido",
                type: "info",
            };
        case "observationCompleted":
            return {
                eventType: "OBSERVATION_CLOSED",
                message: `Se concluyó exitosamente la observación ${observation}${reference}.`,
                title: "Observación concluida",
                type: "info",
            };
    }
};
//# sourceMappingURL=progress-notification.js.map