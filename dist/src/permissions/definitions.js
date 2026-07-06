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
];
export const PERMISSION_RESOURCES = [
    ...CORE_PERMISSION_RESOURCES,
    ...generatedPermissionResources,
];
export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"];
export const buildPermissionName = (resource, action) => {
    return `${resource}.${action}`;
};
export const DEFAULT_PERMISSION_NAMES = PERMISSION_RESOURCES.flatMap((resource) => PERMISSION_ACTIONS.map((action) => buildPermissionName(resource, action)));
export const CRITICAL_ADMIN_PERMISSIONS = [...DEFAULT_PERMISSION_NAMES];
//# sourceMappingURL=definitions.js.map