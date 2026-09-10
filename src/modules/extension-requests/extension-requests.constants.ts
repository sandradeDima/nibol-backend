export const EXTENSION_REQUESTS_PERMISSION_RESOURCE = "extension_requests";

export const EXTENSION_REQUESTS_PERMISSIONS = {
  approve: "deadline_extensions.approve",
  create: "deadline_extensions.request",
  delete: "deadline_extensions.request",
  edit: "deadline_extensions.request",
  reject: "deadline_extensions.reject",
  request: "deadline_extensions.request",
  view: "deadline_extensions.view",
} as const;

export const EXTENSION_REQUEST_STATUS_VALUES = [
  "DRAFT",
  "SENT_TO_MANAGER",
  "MANAGER_APPROVED",
  "MANAGER_REJECTED",
  "CANCELLED",
] as const;

export const EXTENSION_REQUEST_ENTITY_TYPES = {
  attachment: "deadline_extension_attachment",
  request: "deadline_extension_request",
} as const;

export const EXTENSION_REQUEST_ACTIVITY_ACTIONS = {
  cancel: "deadline-extension.cancel",
  createForActionPlan: "deadline-extension.create-for-actionPlan",
  sendToManager: "deadline-extension.send-to-manager",
  managerApprove: "deadline-extension.manager-approve",
  managerReject: "deadline-extension.manager-reject",
  update: "deadline-extension.update",
} as const;

export const EDITABLE_EXTENSION_REQUEST_STATUSES: ReadonlySet<string> = new Set(
  ["DRAFT", "MANAGER_REJECTED"] satisfies ReadonlyArray<
    (typeof EXTENSION_REQUEST_STATUS_VALUES)[number]
  >,
);

export const ACTIVE_EXTENSION_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  "DRAFT",
  "SENT_TO_MANAGER",
] satisfies ReadonlyArray<(typeof EXTENSION_REQUEST_STATUS_VALUES)[number]>);

export const FINAL_EXTENSION_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  "MANAGER_APPROVED",
  "MANAGER_REJECTED",
  "CANCELLED",
] satisfies ReadonlyArray<(typeof EXTENSION_REQUEST_STATUS_VALUES)[number]>);
