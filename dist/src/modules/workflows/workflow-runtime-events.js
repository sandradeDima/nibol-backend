import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { toLogJsonValue } from "../../services/logging-utils.js";
import { getSafeRuntimeContextSummary } from "./workflow-runtime-context.js";
const asJson = (value) => toLogJsonValue(value) ?? {};
export const writeRuntimeTransitionLog = async ({ context, db, decision, details, eventType, instanceId, performedById, sourceNodeId, targetNodeId, triggerType, }) => {
    await db.workflowTransitionLog.create({
        data: {
            contextSnapshotJson: asJson(getSafeRuntimeContextSummary(context)),
            ...(decision ? { decision } : {}),
            ...(details !== undefined ? { detailsJson: asJson(details) } : {}),
            ...(eventType ? { eventType } : {}),
            ...(performedById ? { performedById } : {}),
            ...(sourceNodeId ? { sourceNodeId } : {}),
            ...(targetNodeId ? { targetNodeId } : {}),
            triggerType,
            workflowInstanceId: instanceId,
        },
    });
};
export const writeRuntimeAuditEvent = async ({ action, actor, db, entityId, entityType, metadata, newValues, oldValues, }) => {
    await Promise.all([
        activityLogService.logUserAction({
            action,
            entityId,
            entityType,
            ipAddress: actor.ipAddress ?? null,
            ...(metadata !== undefined ? { metadata } : {}),
            userId: actor.userId ?? null,
        }, { db }),
        auditLogService.create({
            entityId,
            entityType,
            ipAddress: actor.ipAddress ?? null,
            ...(newValues !== undefined ? { newValues } : {}),
            ...(oldValues !== undefined ? { oldValues } : {}),
            userId: actor.userId ?? null,
        }, { db }),
    ]);
};
//# sourceMappingURL=workflow-runtime-events.js.map