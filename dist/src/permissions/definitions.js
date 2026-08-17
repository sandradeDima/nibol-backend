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
];
export const REPORT_PERMISSION_NAMES = [
    "reports.view",
    "reports.export",
];
export const AUDIT_REPORT_PERMISSION_NAMES = [
    "audit_reports.view",
    "audit_reports.create",
    "audit_reports.edit",
    "audit_reports.delete",
];
export const OBSERVATION_DOMAIN_PERMISSION_NAMES = [
    "observations.close",
    "observation_areas.manage",
    "finding_evidence.upload",
    "action_plans.assign",
    "action_plans.complete",
    "progress_evaluations.submit",
    "progress_evaluations.review",
    "progress_evaluations.approve",
    "progress_evaluations.reject",
];
export const AUDIT_WORKFLOW_PERMISSION_NAMES = [
    "workflows.view",
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
    "workflow_instances.view_audit",
    "workflow_timers.view",
];
export const ALL_PERMISSION_NAMES = [
    ...DEFAULT_PERMISSION_NAMES,
    ...WORKFLOW_PERMISSION_NAMES,
    ...REPORT_PERMISSION_NAMES,
    ...OBSERVATION_DOMAIN_PERMISSION_NAMES,
];
export const CRITICAL_ADMIN_PERMISSIONS = [...ALL_PERMISSION_NAMES];
//# sourceMappingURL=definitions.js.map