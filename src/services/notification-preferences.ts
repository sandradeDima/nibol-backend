import { prisma } from "../utils/prisma.js";

type NotificationCatalogDefinition = {
  category: string;
  channels: string;
  description: string;
  eventType: "*" | string | null;
  exampleMessage: string;
  exampleTitle: string;
  key: string;
  name: string;
};

export const NOTIFICATION_CATALOG = [
  {
    category: "Vencimientos",
    channels: "NIBOL y correo, según los canales activos",
    description: "Resumen programado de planes de acción vencidos o próximos a vencer.",
    eventType: "DEADLINE_REMINDER_DIGEST",
    exampleMessage: "Tienes 2 planes vencidos, 1 vence hoy y 3 próximos a vencer.",
    exampleTitle: "Recordatorio de plazos",
    key: "notification_enabled_deadline_reminder_digest",
    name: "Resumen de plazos",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Se crea cuando una tarea de workflow queda asignada a un usuario, rol o responsable de área.",
    eventType: "workflow.task.assigned",
    exampleMessage: "Tiene una tarea pendiente: Revisar solicitud.",
    exampleTitle: "Nueva tarea de aprobación",
    key: "notification_enabled_workflow_task_assigned",
    name: "Tarea asignada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso a los participantes cuando una tarea se aprueba.",
    eventType: "workflow.task.approve",
    exampleMessage: "La tarea “Revisión legal” fue aprobada para la solicitud “Ampliación de plazo”.",
    exampleTitle: "Actualización de aprobación: Ampliación de plazo",
    key: "notification_enabled_workflow_task_approve",
    name: "Tarea aprobada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso a los participantes cuando una tarea se completa.",
    eventType: "workflow.task.complete",
    exampleMessage: "La tarea “Validar evidencia” fue completada para la observación OBS-014.",
    exampleTitle: "Actualización de aprobación: OBS-014",
    key: "notification_enabled_workflow_task_complete",
    name: "Tarea completada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso a los participantes cuando una tarea se observa.",
    eventType: "workflow.task.observe",
    exampleMessage: "La tarea “Revisar avance” fue observada para el plan de acción.",
    exampleTitle: "Actualización de aprobación: Plan de acción",
    key: "notification_enabled_workflow_task_observe",
    name: "Tarea observada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso a los participantes cuando una tarea se rechaza.",
    eventType: "workflow.task.reject",
    exampleMessage: "La tarea “Aprobar solicitud” fue rechazada para la ampliación de plazo.",
    exampleTitle: "Actualización de aprobación: Ampliación de plazo",
    key: "notification_enabled_workflow_task_reject",
    name: "Tarea rechazada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso a los participantes cuando una tarea se devuelve para corrección.",
    eventType: "workflow.task.request_correction",
    exampleMessage: "La tarea “Revisar avance” fue devuelta para corrección para el plan de acción.",
    exampleTitle: "Actualización de aprobación: Plan de acción",
    key: "notification_enabled_workflow_task_request_correction",
    name: "Tarea devuelta para corrección",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Recordatorio cuando una tarea de workflow está próxima a vencer.",
    eventType: "workflow.timer.reminder_processed",
    exampleMessage: "La tarea “Revisar solicitud” está próxima a vencer y requiere atención.",
    exampleTitle: "Recordatorio de tarea",
    key: "notification_enabled_workflow_timer_reminder",
    name: "Recordatorio de tarea próxima a vencer",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso cuando una tarea de workflow vence y continúa pendiente.",
    eventType: "workflow.timer.due_processed",
    exampleMessage: "La tarea “Revisar solicitud” venció y continúa pendiente.",
    exampleTitle: "Tarea vencida",
    key: "notification_enabled_workflow_timer_due",
    name: "Tarea vencida",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso cuando una tarea se escala o reasigna por vencimiento de SLA.",
    eventType: "workflow.timer.escalation_processed",
    exampleMessage: "La tarea “Revisar solicitud” fue escalada y requiere atención.",
    exampleTitle: "Escalamiento de tarea",
    key: "notification_enabled_workflow_escalation",
    name: "Tarea escalada",
  },
  {
    category: "Flujos de aprobación",
    channels: "Solo NIBOL",
    description: "Aviso administrativo cuando no se pudo resolver el destinatario del escalamiento.",
    eventType: "workflow.timer.escalation_failed",
    exampleMessage: "No se pudo resolver el destinatario de escalamiento para la tarea Revisar solicitud.",
    exampleTitle: "Escalamiento requiere configuración",
    key: "notification_enabled_workflow_escalation_failed",
    name: "Escalamiento sin destinatario",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso cuando una tarea se reasigna por vencimiento del SLA.",
    eventType: "workflow.task.reassigned",
    exampleMessage: "La tarea “Revisar solicitud” fue reasignada por vencimiento del SLA.",
    exampleTitle: "Tarea reasignada",
    key: "notification_enabled_workflow_task_reassigned",
    name: "Tarea reasignada",
  },
  {
    category: "Flujos de aprobación",
    channels: "NIBOL y correo",
    description: "Aviso de resultado final cuando el nodo de fin tiene activado “Notificar a participantes”; esta preferencia global permite pausarlo.",
    eventType: "workflow.instance.completed",
    exampleMessage: "El flujo de aprobación fue completado correctamente para la solicitud “Ampliación de plazo”.",
    exampleTitle: "Aprobación completada: Ampliación de plazo",
    key: "notification_enabled_workflow_instance_completed",
    name: "Workflow finalizado",
  },
  {
    category: "Flujos de aprobación",
    channels: "Canal configurado en el nodo",
    description: "Aviso definido por un nodo de notificación dentro del workflow.",
    eventType: "workflow.node.notification",
    exampleMessage: "Tiene una notificación de workflow: CONFIRMACION_APROBACION. Proceso: DEADLINE_EXTENSION.",
    exampleTitle: "Confirmación de aprobación",
    key: "notification_enabled_workflow_node_notification",
    name: "Notificación de nodo de workflow",
  },
  {
    category: "Observaciones",
    channels: "NIBOL y correo",
    description: "Aviso cuando se asignan observaciones para gestión.",
    eventType: "OBSERVATION_ASSIGNMENT",
    exampleMessage: "Tiene 2 observaciones nuevas asignadas para gestión.",
    exampleTitle: "Nuevas observaciones asignadas",
    key: "notification_enabled_observation_assignment",
    name: "Observaciones asignadas",
  },
  {
    category: "Avances y evidencias",
    channels: "Solo NIBOL",
    description: "Aviso al auditor cuando se envía un avance para revisión.",
    eventType: "PROGRESS_PENDING_REVIEW",
    exampleMessage: "Hay una evaluación de avance pendiente para un plan de acción.",
    exampleTitle: "Avance pendiente de revisión",
    key: "notification_enabled_progress_pending_review",
    name: "Avance pendiente de revisión",
  },
  {
    category: "Avances y evidencias",
    channels: "Solo NIBOL",
    description: "Aviso al autor cuando se aprueba su evaluación de avance.",
    eventType: "PROGRESS_APPROVED",
    exampleMessage: "La evaluación de avance del plan de acción fue aprobada.",
    exampleTitle: "Evaluación de avance revisada",
    key: "notification_enabled_progress_approved",
    name: "Avance aprobado",
  },
  {
    category: "Avances y evidencias",
    channels: "Solo NIBOL",
    description: "Aviso al autor cuando se devuelve su evaluación de avance.",
    eventType: "PROGRESS_RETURNED",
    exampleMessage: "La evaluación de avance del plan de acción fue devuelta.",
    exampleTitle: "Evaluación de avance revisada",
    key: "notification_enabled_progress_returned",
    name: "Avance devuelto",
  },
  {
    category: "Avances y evidencias",
    channels: "NIBOL y correo",
    description: "Aviso a los revisores cuando se envía una evidencia a revisión.",
    eventType: "EVIDENCE_REVIEW_SUBMITTED",
    exampleMessage: "Se ha registrado nueva evidencia para revisión correspondiente a Informe 2026 / OBS-014.\nTítulo: Seguimiento de recomendaciones\nÁreas involucradas: Finanzas, Operaciones\nEnviado por: María Pérez\nFecha de carga: 21 oct 2026, 10:30",
    exampleTitle: "Evidencia pendiente de revisión",
    key: "notification_enabled_evidence_review_submitted",
    name: "Evidencia enviada a revisión",
  },
  {
    category: "Avances y evidencias",
    channels: "NIBOL y correo",
    description: "Aviso al autor cuando se aprueba una evidencia.",
    eventType: "EVIDENCE_APPROVED",
    exampleMessage: "La evidencia “Informe de respaldo.pdf” fue aprobada por Auditoría.",
    exampleTitle: "Evidencia aprobada",
    key: "notification_enabled_evidence_approved",
    name: "Evidencia aprobada",
  },
  {
    category: "Avances y evidencias",
    channels: "NIBOL y correo",
    description: "Aviso al autor cuando se devuelve una evidencia.",
    eventType: "EVIDENCE_RETURNED",
    exampleMessage: "La evidencia “Informe de respaldo.pdf” fue devuelta por Auditoría: falta adjuntar el respaldo.",
    exampleTitle: "Evidencia devuelta por Auditoría",
    key: "notification_enabled_evidence_returned",
    name: "Evidencia devuelta",
  },
  {
    category: "Ampliaciones de plazo",
    channels: "Solo NIBOL",
    description: "Aviso al solicitante cuando se aprueba su ampliación de plazo.",
    eventType: "EXTENSION_APPROVED",
    exampleMessage: "La ampliación fue aprobada hasta el 30/11/2026.",
    exampleTitle: "Solicitud de ampliación revisada",
    key: "notification_enabled_extension_approved",
    name: "Ampliación aprobada",
  },
  {
    category: "Ampliaciones de plazo",
    channels: "Solo NIBOL",
    description: "Aviso al solicitante cuando se rechaza su ampliación de plazo.",
    eventType: "EXTENSION_REJECTED",
    exampleMessage: "La solicitud de ampliación fue rechazada.",
    exampleTitle: "Solicitud de ampliación revisada",
    key: "notification_enabled_extension_rejected",
    name: "Ampliación rechazada",
  },
  {
    category: "Cuenta y administración",
    channels: "Solo NIBOL",
    description: "Aviso al creador cuando se acepta una invitación.",
    eventType: "INVITATION_ACCEPTED",
    exampleMessage: "analista@nibol.bo aceptó una invitación para el rol Auditor.",
    exampleTitle: "Invitación aceptada",
    key: "notification_enabled_invitation_accepted",
    name: "Invitación aceptada",
  },
  {
    category: "Cuenta y administración",
    channels: "Solo NIBOL",
    description: "Aviso al usuario cuando cambian sus roles de acceso.",
    eventType: "USER_ROLES_UPDATED",
    exampleMessage: "Sus roles de acceso cambiaron de Ejecutor a Auditor.",
    exampleTitle: "Roles actualizados",
    key: "notification_enabled_user_roles_updated",
    name: "Roles de acceso actualizados",
  },
  {
    category: "Mensajes manuales",
    channels: "Solo NIBOL",
    description: "Mensajes enviados desde el centro de notificaciones o por integración sin un tipo de evento específico.",
    eventType: null,
    exampleMessage: "La reunión de seguimiento fue reprogramada para el jueves a las 10:00.",
    exampleTitle: "Actualización de seguimiento",
    key: "notification_enabled_manual",
    name: "Notificaciones manuales o generales",
  },
  {
    category: "Otros eventos",
    channels: "Según el emisor",
    description: "Eventos personalizados no incluidos en las categorías anteriores.",
    eventType: "*",
    exampleMessage: "Se registró una actualización relacionada con su solicitud.",
    exampleTitle: "Actualización del sistema",
    key: "notification_enabled_other_events",
    name: "Otros eventos personalizados",
  },
] as const satisfies readonly NotificationCatalogDefinition[];

export const NOTIFICATION_PREFERENCE_DEFAULTS = Object.fromEntries(
  NOTIFICATION_CATALOG.map(({ key }) => [key, true]),
) as Record<string, boolean>;

type NotificationPreferenceLookup = Pick<
  typeof prisma.systemParameter,
  "findUnique"
>;
type NotificationCatalogReader = Pick<
  typeof prisma.systemParameter,
  "findMany"
>;

const getPreferenceKey = (eventType: string | null | undefined): string =>
  NOTIFICATION_CATALOG.find((item) => item.eventType === eventType)?.key ??
  (eventType ? "notification_enabled_other_events" : "notification_enabled_manual");

export const isNotificationEventEnabled = async (
  eventType: string | null | undefined,
  db: NotificationPreferenceLookup = prisma.systemParameter,
): Promise<boolean> => {
  const setting = await db.findUnique({
    select: { active: true, deletedAt: true, value: true },
    where: { key: getPreferenceKey(eventType) },
  });
  return (
    !setting ||
    !setting.active ||
    setting.deletedAt !== null ||
    setting.value.trim().toLowerCase() === "true"
  );
};

export const getNotificationCatalog = async (
  db: NotificationCatalogReader = prisma.systemParameter,
) => {
  const settings = await db.findMany({
    select: { key: true, value: true },
    where: {
      active: true,
      deletedAt: null,
      key: { in: NOTIFICATION_CATALOG.map(({ key }) => key) },
    },
  });
  const byKey = new Map(settings.map(({ key, value }) => [key, value]));
  return NOTIFICATION_CATALOG.map((entry) => ({
    ...entry,
    enabled: byKey.get(entry.key)?.trim().toLowerCase() !== "false",
  }));
};
