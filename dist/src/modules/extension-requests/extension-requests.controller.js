import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { extensionRequestsService as service } from "./extension-requests.service.js";
import { actionPlanIdParamSchema, createExtensionRequestSchema, extensionRequestIdParamSchema, listExtensionRequestsQuerySchema, observationIdParamSchema, reviewExtensionRequestSchema, updateExtensionRequestSchema, } from "./extension-requests.validators.js";
const value = (input) => typeof input === "string" ? input : undefined;
const access = (request) => {
    if (!request.authorizationSummary)
        throw new AppError("Authorization required.", 401);
    return request.authorizationSummary;
};
const parsedId = (request, schema) => schema.parse({ id: value(request.params.id) }).id;
const log = async (request, action, current, previous) => {
    const record = current ?? previous;
    if (!record)
        return;
    const actor = getRequestLogActorContext(request);
    await Promise.all([
        activityLogService.logUserAction({
            ...actor,
            action,
            entityId: record.id,
            entityType: "DEADLINE_EXTENSION_REQUEST",
            metadata: { summary: action },
        }),
        auditLogService.create({
            ...actor,
            entityId: record.id,
            entityType: "DEADLINE_EXTENSION_REQUEST",
            newValues: current,
            oldValues: previous,
        }),
        entityActivityService.recordEntityChange({
            action,
            activityType: action
                .toUpperCase()
                .replaceAll(".", "_")
                .replaceAll("-", "_"),
            actorUserId: actor.userId,
            entityId: record.id,
            entityType: "DEADLINE_EXTENSION_REQUEST",
            newData: current,
            observationId: record.observation?.id,
            previousData: previous,
            title: action,
        }),
    ]);
};
export const extensionRequestsController = {
    async auditApprove(request, response) {
        const result = await service.auditReview(parsedId(request, extensionRequestIdParamSchema), true, reviewExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "extension_requests.approve", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async auditReject(request, response) {
        const result = await service.auditReview(parsedId(request, extensionRequestIdParamSchema), false, reviewExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "extension_requests.reject", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async cancel(request, response) {
        const result = await service.cancel(parsedId(request, extensionRequestIdParamSchema), access(request));
        sendSuccess(response, result.current);
    },
    async createForActionPlan(request, response) {
        const record = await service.createForActionPlan(parsedId(request, actionPlanIdParamSchema), createExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "extension_requests.create", record, null);
        sendSuccess(response, record, 201);
    },
    async createForObservation(request, response) {
        const record = await service.createForObservation(parsedId(request, observationIdParamSchema), createExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "extension_requests.create", record, null);
        sendSuccess(response, record, 201);
    },
    async getById(request, response) {
        sendSuccess(response, await service.getById(parsedId(request, extensionRequestIdParamSchema), access(request)));
    },
    async list(request, response) {
        const result = await service.list(listExtensionRequestsQuerySchema.parse({
            actionPlanId: value(request.query["filter.actionPlanId"]),
            observationId: value(request.query["filter.observationId"]),
            page: value(request.query.page),
            perPage: value(request.query.perPage),
            requestedByUserId: value(request.query["filter.requestedByUserId"]),
            search: value(request.query.search),
            status: value(request.query["filter.status"]),
            targetType: value(request.query["filter.targetType"]),
        }), access(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async managerApprove(request, response) {
        const result = await service.managerReview(parsedId(request, extensionRequestIdParamSchema), true, reviewExtensionRequestSchema.parse(request.body), access(request));
        sendSuccess(response, result.current);
    },
    async managerReject(request, response) {
        const result = await service.managerReview(parsedId(request, extensionRequestIdParamSchema), false, reviewExtensionRequestSchema.parse(request.body), access(request));
        sendSuccess(response, result.current);
    },
    async sendToManager(request, response) {
        const result = await service.submit(parsedId(request, extensionRequestIdParamSchema), access(request));
        sendSuccess(response, result.current);
    },
    async update(request, response) {
        const result = await service.update(parsedId(request, extensionRequestIdParamSchema), updateExtensionRequestSchema.parse(request.body), access(request));
        sendSuccess(response, result.current);
    },
};
//# sourceMappingURL=extension-requests.controller.js.map