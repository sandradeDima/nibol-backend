import { generatedPermissionResources } from "../modules/generated-module-registry.js";
import { ADMIN_ROLE_CODE, type RoleCode } from "./role-codes.js";

export { ADMIN_ROLE_CODE } from "./role-codes.js";
export type { RoleCode } from "./role-codes.js";
export const ADMIN_ROLE_NAME = "Administrador del sistema";

export const ROLE_DEFINITIONS = [
  {
    code: ADMIN_ROLE_CODE,
    description: "Administración técnica de la plataforma.",
    name: ADMIN_ROLE_NAME,
  },
  {
    code: "AUDITOR",
    description: "Auditoría y validación de observaciones y planes.",
    name: "Auditor",
  },
  {
    code: "PROCESS_OWNER",
    description: "Seguimiento de observaciones y planes del proceso.",
    name: "Dueño del proceso",
  },
  {
    code: "AREA_RESPONSIBLE",
    description: "Gestión y seguimiento de los planes de su área.",
    name: "Responsable de área",
  },
  {
    code: "EXECUTOR",
    description: "Ejecución de planes y carga de evidencias asignadas.",
    name: "Ejecutor",
  },
] as const;

const CORE_PERMISSION_RESOURCES = [
  "users",
  "roles",
  "permissions",
  "settings",
  "notifications",
  "automatic_jobs",
  "notification_rules",
  "activity",
  "activity_logs",
  "audit_logs",
  "invitations",
] as const;

export const PERMISSION_RESOURCES = [
  ...CORE_PERMISSION_RESOURCES,
  ...generatedPermissionResources,
] as const;

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const buildPermissionName = (
  resource: PermissionResource,
  action: PermissionAction,
): string => `${resource}.${action}`;

export const DEFAULT_PERMISSION_NAMES = PERMISSION_RESOURCES.flatMap(
  (resource) =>
    PERMISSION_ACTIONS.map((action) => buildPermissionName(resource, action)),
);

export const WORKFLOW_PERMISSION_NAMES = [
  "workflows.view",
  "workflows.create",
  "workflows.edit",
  "workflows.delete",
  "workflows.archive",
  "workflows.publish",
  "workflows.validate",
  "workflows.simulate",
  "workflows.view_versions",
  "workflows.view_instances",
  "workflow_tasks.view",
  "workflow_tasks.approve",
  "workflow_tasks.complete",
  "workflow_tasks.reject",
  "workflow_tasks.observe",
  "workflow_tasks.request_correction",
  "workflow_tasks.reassign",
  "workflow_instances.start",
  "workflow_instances.cancel",
  "workflow_instances.retry",
  "workflow_instances.view_audit",
  "workflow_timers.view",
  "workflow_timers.retry",
] as const;

export const REPORT_PERMISSION_NAMES = [
  "reports.view",
  "reports.export",
] as const;

export const AUDIT_REPORT_PERMISSION_NAMES = [
  "audit_reports.view",
  "audit_reports.create",
  "audit_reports.edit",
  "audit_reports.delete",
  "audit_reports.export",
] as const;

export const OBSERVATION_DOMAIN_PERMISSION_NAMES = [
  "observations.close",
  "observations.send",
  "observation_areas.manage",
  "recommended_action_plans.view",
  "recommended_action_plans.create",
  "recommended_action_plans.edit",
  "recommended_action_plans.delete",
  "recommended_action_plans.submit_to_audit",
  "action_plans.assign_executor",
  "action_plans.submit_to_audit",
  "action_plans.evaluate",
  "action_plans.approve",
  "action_plans.return",
  "action_plans.complete",
  "evidence.view",
  "evidence.create",
  "evidence.review",
  "evidence.delete",
  "observations.history.view",
  "action_plans.history.view",
  "deadline_extensions.view",
  "deadline_extensions.request",
  "deadline_extensions.approve",
  "deadline_extensions.reject",
  "progress_evaluations.view",
] as const;

export const ALL_PERMISSION_NAMES = Array.from(
  new Set([
    ...DEFAULT_PERMISSION_NAMES,
    ...WORKFLOW_PERMISSION_NAMES,
    ...REPORT_PERMISSION_NAMES,
    ...AUDIT_REPORT_PERMISSION_NAMES,
    ...OBSERVATION_DOMAIN_PERMISSION_NAMES,
  ]),
);

const AUDITOR_PERMISSIONS = [
  "notifications.view",
  "workflow_tasks.view",
  "workflow_tasks.approve",
  "workflow_tasks.request_correction",
  "observations.view",
  "observations.create",
  "observations.edit",
  "observations.delete",
  "observations.send",
  "observations.close",
  "observation_areas.manage",
  "recommended_action_plans.view",
  "recommended_action_plans.create",
  "recommended_action_plans.edit",
  "recommended_action_plans.delete",
  "recommended_action_plans.submit_to_audit",
  "action_plans.view",
  "action_plans.assign_executor",
  "action_plans.submit_to_audit",
  "action_plans.evaluate",
  "action_plans.approve",
  "action_plans.return",
  "evidence.view",
  "evidence.create",
  "evidence.review",
  "evidence.delete",
  "observations.history.view",
  "action_plans.history.view",
  "deadline_extensions.view",
  "deadline_extensions.approve",
  "deadline_extensions.reject",
  "progress_evaluations.view",
  "reports.view",
  "reports.export",
  "audit_reports.view",
  "audit_reports.export",
] as const;

const AREA_PERMISSIONS = [
  "notifications.view",
  "workflow_tasks.view",
  "observations.view",
  "recommended_action_plans.view",
  "action_plans.view",
  "action_plans.create",
  "action_plans.edit",
  "action_plans.assign_executor",
  "evidence.view",
  "evidence.create",
  "observations.history.view",
  "action_plans.history.view",
  "deadline_extensions.view",
  "progress_evaluations.view",
  "reports.view",
] as const;

export const ROLE_PERMISSION_NAMES: Record<RoleCode, readonly string[]> = {
  [ADMIN_ROLE_CODE]: ALL_PERMISSION_NAMES,
  AUDITOR: AUDITOR_PERMISSIONS,
  PROCESS_OWNER: AREA_PERMISSIONS,
  AREA_RESPONSIBLE: [
    ...AREA_PERMISSIONS,
    "workflow_tasks.approve",
    "workflow_tasks.reject",
    "workflow_tasks.request_correction",
    "action_plans.submit_to_audit",
    "deadline_extensions.approve",
    "deadline_extensions.reject",
  ],
  EXECUTOR: [
    "notifications.view",
    "workflow_tasks.view",
    "workflow_tasks.complete",
    "observations.view",
    "action_plans.view",
    "action_plans.create",
    "action_plans.edit",
    "action_plans.submit_to_audit",
    "evidence.view",
    "evidence.create",
    "observations.history.view",
    "action_plans.history.view",
    "deadline_extensions.view",
    "deadline_extensions.request",
    "progress_evaluations.view",
    "reports.view",
  ],
};

export const CRITICAL_ADMIN_PERMISSIONS = [...ALL_PERMISSION_NAMES];
