export const getRemediationActivityType = (entityType, action) => {
    if (entityType === "remediation_plan") {
        if (action.endsWith("create"))
            return "PLAN_CREATED";
        if (action.endsWith("update"))
            return "PLAN_UPDATED";
        if (action.endsWith("send-to-audit"))
            return "PLAN_SENT_TO_AUDIT";
        if (action.endsWith("return"))
            return "PLAN_RETURNED";
        if (action.endsWith("approve"))
            return "PLAN_APPROVED";
    }
    if (entityType === "commitment") {
        if (action.endsWith("create"))
            return "COMMITMENT_CREATED";
        if (action.endsWith("update"))
            return "COMMITMENT_UPDATED";
        if (action.endsWith("send-to-audit"))
            return "COMMITMENT_PROGRESS_CHANGED";
        if (action.endsWith("mark-complete"))
            return "COMMITMENT_COMPLETED";
    }
    return "COMMITMENT_UPDATED";
};
export const getProgressActivityType = (entityType, action) => {
    if (entityType === "evidence_file") {
        if (action.endsWith("upload"))
            return "EVIDENCE_UPLOADED";
        if (action.endsWith("download"))
            return "EVIDENCE_DOWNLOADED";
        if (action.endsWith("delete"))
            return "EVIDENCE_DELETED";
    }
    if (entityType === "observation_comment") {
        if (action.endsWith("create"))
            return "COMMENT_ADDED";
        if (action.endsWith("update"))
            return "COMMENT_EDITED";
        if (action.endsWith("delete"))
            return "COMMENT_DELETED";
    }
    if (action.endsWith("approve"))
        return "PROGRESS_APPROVED";
    if (action.endsWith("return"))
        return "PROGRESS_RETURNED";
    if (action.endsWith("reject"))
        return "PROGRESS_REJECTED";
    if (action.endsWith("send-to-audit"))
        return "PROGRESS_SENT";
    if (action.endsWith("create"))
        return "PROGRESS_CREATED";
    return "PROGRESS_UPDATED";
};
export const getExtensionActivityType = (action, status) => {
    if (action.endsWith("create-for-observation") || action.endsWith("create-for-commitment"))
        return "EXTENSION_CREATED";
    if (action.endsWith("send-to-manager"))
        return "EXTENSION_SENT_TO_MANAGER";
    if (action.endsWith("manager-approve"))
        return "EXTENSION_MANAGER_APPROVED";
    if (action.endsWith("manager-reject"))
        return "EXTENSION_MANAGER_REJECTED";
    if (action.endsWith("send-to-audit"))
        return "EXTENSION_SENT_TO_AUDIT";
    if (action.endsWith("audit-approve"))
        return "EXTENSION_AUDIT_APPROVED";
    if (action.endsWith("audit-reject"))
        return "EXTENSION_AUDIT_REJECTED";
    if (action.endsWith("cancel"))
        return "EXTENSION_CANCELLED";
    if (status === "AUDIT_APPROVED")
        return "DEADLINE_UPDATED_BY_EXTENSION";
    return "EXTENSION_UPDATED";
};
//# sourceMappingURL=entity-activity-mapping.js.map