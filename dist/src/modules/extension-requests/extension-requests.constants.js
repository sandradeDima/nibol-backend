export const EXTENSION_REQUESTS_PERMISSION_RESOURCE = "extension_requests";
export const EXTENSION_REQUESTS_PERMISSIONS = {
    approve: "deadline_extensions.approve",
    create: "deadline_extensions.request",
    delete: "deadline_extensions.request",
    edit: "deadline_extensions.request",
    reject: "deadline_extensions.reject",
    request: "deadline_extensions.request",
    view: "deadline_extensions.view",
};
export const EXTENSION_REQUEST_STATUS_VALUES = [
    "DRAFT",
    "SENT_TO_MANAGER",
    "MANAGER_APPROVED",
    "MANAGER_REJECTED",
    "CANCELLED",
];
export const EXTENSION_REQUEST_ENTITY_TYPES = {
    attachment: "deadline_extension_attachment",
    request: "deadline_extension_request",
};
export const EXTENSION_REQUEST_ACTIVITY_ACTIONS = {
    cancel: "deadline-extension.cancel",
    createForActionPlan: "deadline-extension.create-for-actionPlan",
    sendToManager: "deadline-extension.send-to-manager",
    managerApprove: "deadline-extension.manager-approve",
    managerReject: "deadline-extension.manager-reject",
    update: "deadline-extension.update",
};
export const EDITABLE_EXTENSION_REQUEST_STATUSES = new Set(["DRAFT", "MANAGER_REJECTED"]);
export const ACTIVE_EXTENSION_REQUEST_STATUSES = new Set([
    "DRAFT",
    "SENT_TO_MANAGER",
]);
export const FINAL_EXTENSION_REQUEST_STATUSES = new Set([
    "MANAGER_APPROVED",
    "MANAGER_REJECTED",
    "CANCELLED",
]);
//# sourceMappingURL=extension-requests.constants.js.map