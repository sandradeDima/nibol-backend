export const WORKFLOW_PERMISSIONS = {
  archive: "workflows.archive",
  create: "workflows.create",
  delete: "workflows.delete",
  edit: "workflows.edit",
  publish: "workflows.publish",
  simulate: "workflows.simulate",
  validate: "workflows.validate",
  view: "workflows.view",
  viewInstances: "workflows.view_instances",
  viewVersions: "workflows.view_versions",
} as const;

export const WORKFLOW_TASK_PERMISSIONS = {
  approve: "workflow_tasks.approve",
  complete: "workflow_tasks.complete",
  observe: "workflow_tasks.observe",
  reject: "workflow_tasks.reject",
  reassign: "workflow_tasks.reassign",
  requestCorrection: "workflow_tasks.request_correction",
  view: "workflow_tasks.view",
} as const;

export const WORKFLOW_INSTANCE_PERMISSIONS = {
  cancel: "workflow_instances.cancel",
  retry: "workflow_instances.retry",
  start: "workflow_instances.start",
  viewAudit: "workflow_instances.view_audit",
} as const;

export const WORKFLOW_TIMER_PERMISSIONS = {
  retry: "workflow_timers.retry",
  view: "workflow_timers.view",
} as const;

export const WORKFLOW_PERMISSION_NAMES = [
  ...Object.values(WORKFLOW_PERMISSIONS),
  ...Object.values(WORKFLOW_TASK_PERMISSIONS),
  ...Object.values(WORKFLOW_INSTANCE_PERMISSIONS),
  ...Object.values(WORKFLOW_TIMER_PERMISSIONS),
] as const;
