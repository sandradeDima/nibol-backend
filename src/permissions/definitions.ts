import { generatedPermissionResources } from "../modules/generated-module-registry.js";

export const ADMIN_ROLE_NAME = "Admin";

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
): string => {
  return `${resource}.${action}`;
};

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
  "workflow_tasks.reject",
  "workflow_tasks.observe",
  "workflow_tasks.request_correction",
  "workflow_tasks.reassign",
  "workflow_instances.cancel",
  "workflow_instances.retry",
  "workflow_instances.view_audit",
] as const;

export const AUDIT_WORKFLOW_PERMISSION_NAMES = [
  "workflows.view",
  "workflows.validate",
  "workflows.simulate",
  "workflows.view_versions",
  "workflows.view_instances",
  "workflow_tasks.view",
  "workflow_tasks.approve",
  "workflow_tasks.reject",
  "workflow_tasks.observe",
  "workflow_tasks.request_correction",
  "workflow_instances.view_audit",
] as const;

export const ALL_PERMISSION_NAMES = [
  ...DEFAULT_PERMISSION_NAMES,
  ...WORKFLOW_PERMISSION_NAMES,
] as const;

export const CRITICAL_ADMIN_PERMISSIONS = [...ALL_PERMISSION_NAMES];
