import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { workflowInstanceService } from "./workflow-instance.service.js";
import { getWorkflowEntityAdapter } from "./workflow-entity-adapters.js";
import { deliverWorkflowNotificationsForInstance } from "./workflow-notification.service.js";
const dbAsTransaction = prisma;
const entityLinkField = {
    DEADLINE_EXTENSION: "deadlineExtensionRequest",
    OBSERVATION_CLOSURE: "progressEvaluation",
    REMEDIATION_PLAN_APPROVAL: "remediationPlan",
};
const getLinkedInstanceId = async (processType, entityId) => {
    switch (processType) {
        case "DEADLINE_EXTENSION":
            return ((await prisma.deadlineExtensionRequest.findUnique({
                select: { workflowInstanceId: true },
                where: { id: entityId },
            }))?.workflowInstanceId ?? null);
        case "OBSERVATION_CLOSURE":
            return ((await prisma.progressEvaluation.findUnique({
                select: { workflowInstanceId: true },
                where: { id: entityId },
            }))?.workflowInstanceId ?? null);
        case "REMEDIATION_PLAN_APPROVAL":
            return ((await prisma.remediationPlan.findUnique({
                select: { workflowInstanceId: true },
                where: { id: entityId },
            }))?.workflowInstanceId ?? null);
        default:
            return null;
    }
};
const linkEntity = async (processType, entityId, workflowInstanceId) => {
    switch (processType) {
        case "DEADLINE_EXTENSION":
            return ((await prisma.deadlineExtensionRequest.updateMany({
                data: { workflowInstanceId },
                where: { id: entityId, workflowInstanceId: null },
            })).count === 1);
        case "OBSERVATION_CLOSURE":
            return ((await prisma.progressEvaluation.updateMany({
                data: { workflowInstanceId },
                where: { id: entityId, workflowInstanceId: null },
            })).count === 1);
        case "REMEDIATION_PLAN_APPROVAL":
            return ((await prisma.remediationPlan.updateMany({
                data: { workflowInstanceId },
                where: { id: entityId, workflowInstanceId: null },
            })).count === 1);
        default:
            return false;
    }
};
const cancelOrphanedInstance = async (instanceId) => {
    const now = new Date();
    await prisma.workflowInstance.updateMany({
        data: {
            completedAt: now,
            finalResult: "DUPLICATE_INTEGRATION",
            status: "CANCELLED",
        },
        where: { id: instanceId },
    });
    await prisma.workflowTimer.updateMany({
        data: { status: "CANCELLED" },
        where: {
            workflowInstanceId: instanceId,
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
    });
};
const getActivePublishedWorkflow = async (processType) => {
    const definitions = await prisma.workflowDefinition.findMany({
        select: {
            activeVersion: { select: { id: true, publishedAt: true } },
            id: true,
        },
        where: {
            activeVersionId: { not: null },
            archivedAt: null,
            processType,
            status: "PUBLISHED",
        },
    });
    if (definitions.length > 1) {
        throw new AppError("Hay varios workflows publicados para este proceso. Corrija la configuración antes de continuar.", 409);
    }
    return definitions[0] ?? null;
};
const getEntityCreatedAt = async (processType, entityId) => {
    switch (processType) {
        case "DEADLINE_EXTENSION":
            return ((await prisma.deadlineExtensionRequest.findUnique({
                select: { createdAt: true },
                where: { id: entityId },
            }))?.createdAt ?? null);
        case "OBSERVATION_CLOSURE":
            return ((await prisma.progressEvaluation.findUnique({
                select: { createdAt: true },
                where: { id: entityId },
            }))?.createdAt ?? null);
        case "REMEDIATION_PLAN_APPROVAL":
            return ((await prisma.remediationPlan.findUnique({
                select: { createdAt: true },
                where: { id: entityId },
            }))?.createdAt ?? null);
        default:
            return null;
    }
};
const hasActivePublishedWorkflow = async (processType) => Boolean(await getActivePublishedWorkflow(processType));
const canUseWorkflowForEntity = async (processType, entityId) => {
    const workflow = await getActivePublishedWorkflow(processType);
    if (!workflow)
        return false;
    const createdAt = await getEntityCreatedAt(processType, entityId);
    if (!createdAt)
        return false;
    const publishedAt = workflow.activeVersion?.publishedAt;
    // Records created before activation remain on the legacy state machine. A
    // record already linked to an instance is handled before this guard.
    return !publishedAt || createdAt.getTime() >= publishedAt.getTime();
};
export const workflowIntegrationService = {
    async hasActivePublishedWorkflow(processType) {
        return hasActivePublishedWorkflow(processType);
    },
    async canUseWorkflowForEntity(processType, entityId) {
        return canUseWorkflowForEntity(processType, entityId);
    },
    async startForEntity(input) {
        const adapter = getWorkflowEntityAdapter(input.processType);
        if (!adapter)
            return { instanceId: "", started: false, status: null };
        if (!(await canUseWorkflowForEntity(input.processType, input.entityId))) {
            return { instanceId: "", started: false, status: null };
        }
        const linkedInstanceId = await getLinkedInstanceId(input.processType, input.entityId);
        if (linkedInstanceId)
            return { instanceId: linkedInstanceId, started: false, status: null };
        await adapter.validateStart({
            actorUserId: input.actorUserId,
            db: dbAsTransaction,
            entityId: input.entityId,
        });
        const context = await adapter.buildRuntimeContext({
            actorUserId: input.actorUserId,
            db: dbAsTransaction,
            entityId: input.entityId,
        });
        const started = await workflowInstanceService.startInstance({
            context,
            entityId: input.entityId,
            entityType: input.entityType,
            processType: input.processType,
        }, input.access, { deferNotifications: true, internal: true });
        if (!started || typeof started.id !== "string") {
            throw new AppError("No se pudo iniciar el workflow de integración.", 500);
        }
        const linked = await linkEntity(input.processType, input.entityId, started.id);
        if (!linked) {
            const existingInstanceId = await getLinkedInstanceId(input.processType, input.entityId);
            await cancelOrphanedInstance(started.id);
            if (existingInstanceId) {
                return { instanceId: existingInstanceId, started: false, status: null };
            }
            throw new AppError("No se pudo vincular el workflow al registro.", 409);
        }
        await deliverWorkflowNotificationsForInstance(started.id);
        return { instanceId: started.id, started: true, status: started.status };
    },
    async getEntityWorkflowLink(processType, entityId) {
        return getLinkedInstanceId(processType, entityId);
    },
    entityLinkField,
};
//# sourceMappingURL=workflow-integration.service.js.map