export const EXTENSION_REQUESTS_PERMISSION_RESOURCE = "extension_requests";
export const EXTENSION_REQUESTS_PERMISSIONS = {
    create: `${EXTENSION_REQUESTS_PERMISSION_RESOURCE}.create`,
    delete: `${EXTENSION_REQUESTS_PERMISSION_RESOURCE}.delete`,
    edit: `${EXTENSION_REQUESTS_PERMISSION_RESOURCE}.edit`,
    view: `${EXTENSION_REQUESTS_PERMISSION_RESOURCE}.view`,
};
export const EXTENSION_REQUEST_STATUS_VALUES = [
    "DRAFT",
    "SENT_TO_MANAGER",
    "MANAGER_APPROVED",
    "MANAGER_REJECTED",
    "SENT_TO_AUDIT",
    "AUDIT_APPROVED",
    "AUDIT_REJECTED",
    "CANCELLED",
];
export const EXTENSION_REQUEST_ENTITY_TYPES = {
    attachment: "deadline_extension_attachment",
    request: "deadline_extension_request",
};
export const EXTENSION_REQUEST_ACTIVITY_ACTIONS = {
    auditApprove: "deadline-extension.audit-approve",
    auditReject: "deadline-extension.audit-reject",
    cancel: "deadline-extension.cancel",
    createForCommitment: "deadline-extension.create-for-commitment",
    createForObservation: "deadline-extension.create-for-observation",
    sendToAudit: "deadline-extension.send-to-audit",
    sendToManager: "deadline-extension.send-to-manager",
    managerApprove: "deadline-extension.manager-approve",
    managerReject: "deadline-extension.manager-reject",
    update: "deadline-extension.update",
};
export const EDITABLE_EXTENSION_REQUEST_STATUSES = new Set([
    "DRAFT",
    "MANAGER_REJECTED",
    "AUDIT_REJECTED",
]);
export const ACTIVE_EXTENSION_REQUEST_STATUSES = new Set([
    "DRAFT",
    "SENT_TO_MANAGER",
    "SENT_TO_AUDIT",
]);
export const FINAL_EXTENSION_REQUEST_STATUSES = new Set([
    "MANAGER_APPROVED",
    "MANAGER_REJECTED",
    "AUDIT_APPROVED",
    "AUDIT_REJECTED",
    "CANCELLED",
]);
//# sourceMappingURL=extension-requests.constants.js.map