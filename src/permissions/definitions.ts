import { generatedPermissionResources } from "../modules/generated-module-registry.js";

export const ADMIN_ROLE_NAME = "Admin";

const CORE_PERMISSION_RESOURCES = [
  "users",
  "roles",
  "permissions",
  "settings",
  "notifications",
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

export const DEFAULT_PERMISSION_NAMES = PERMISSION_RESOURCES.flatMap((resource) =>
  PERMISSION_ACTIONS.map((action) => buildPermissionName(resource, action)),
);

export const CRITICAL_ADMIN_PERMISSIONS = [...DEFAULT_PERMISSION_NAMES];
