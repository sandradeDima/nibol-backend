import type { Prisma } from "../../../generated/prisma/client.js";

import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { toLogJsonValue } from "../../services/logging-utils.js";
import type { WorkflowRuntimeContext } from "./workflow-runtime-context.js";
import { getSafeRuntimeContextSummary } from "./workflow-runtime-context.js";

type RuntimeDatabase = Prisma.TransactionClient;

export type RuntimeEventActor = {
  ipAddress?: string | null;
  userId?: string | null;
};

const asJson = (value: unknown): Prisma.InputJsonValue =>
  toLogJsonValue(value) ?? {};

export const writeRuntimeTransitionLog = async ({
  context,
  db,
  decision,
  details,
  eventType,
  instanceId,
  performedById,
  sourceNodeId,
  targetNodeId,
  triggerType,
}: {
  context: WorkflowRuntimeContext;
  db: RuntimeDatabase;
  decision?: string | null;
  details?: unknown;
  eventType?: string;
  instanceId: string;
  performedById?: string | null;
  sourceNodeId?: string | null;
  targetNodeId?: string | null;
  triggerType: string;
}): Promise<void> => {
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

export const writeRuntimeAuditEvent = async ({
  action,
  actor,
  db,
  entityId,
  entityType,
  metadata,
  newValues,
  oldValues,
}: {
  action: string;
  actor: RuntimeEventActor;
  db: RuntimeDatabase;
  entityId: string;
  entityType: string;
  metadata?: unknown;
  newValues?: unknown;
  oldValues?: unknown;
}): Promise<void> => {
  await Promise.all([
    activityLogService.logUserAction(
      {
        action,
        entityId,
        entityType,
        ipAddress: actor.ipAddress ?? null,
        ...(metadata !== undefined ? { metadata } : {}),
        userId: actor.userId ?? null,
      },
      { db },
    ),
    auditLogService.create(
      {
        entityId,
        entityType,
        ipAddress: actor.ipAddress ?? null,
        ...(newValues !== undefined ? { newValues } : {}),
        ...(oldValues !== undefined ? { oldValues } : {}),
        userId: actor.userId ?? null,
      },
      { db },
    ),
  ]);
};
