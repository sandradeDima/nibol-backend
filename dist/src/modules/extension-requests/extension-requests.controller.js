import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { extensionRequestsService as service } from "./extension-requests.service.js";
import { actionPlanIdParamSchema, createExtensionRequestSchema, extensionRequestIdParamSchema, listExtensionRequestsQuerySchema, reviewExtensionRequestSchema, updateExtensionRequestSchema, } from "./extension-requests.validators.js";
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
    async listClassifications(request, response) {
        sendSuccess(response, await service.listClassifications(access(request)));
    },
    async cancel(request, response) {
        const result = await service.cancel(parsedId(request, extensionRequestIdParamSchema), access(request));
        sendSuccess(response, result.current);
    },
    async createForActionPlan(request, response) {
        const record = await service.createForActionPlan(parsedId(request, actionPlanIdParamSchema), createExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "deadline_extensions.request", record, null);
        sendSuccess(response, record, 201);
    },
    async getById(request, response) {
        sendSuccess(response, await service.getById(parsedId(request, extensionRequestIdParamSchema), access(request)));
    },
    async list(request, response) {
        const result = await service.list(listExtensionRequestsQuerySchema.parse({
            actionPlanId: value(request.query["filter.actionPlanId"]),
            areaId: value(request.query["filter.areaId"]),
            executorUserId: value(request.query["filter.executorUserId"]),
            observationId: value(request.query["filter.observationId"]),
            page: value(request.query.page),
            perPage: value(request.query.perPage),
            requestedByUserId: value(request.query["filter.requestedByUserId"]),
            responsibleUserId: value(request.query["filter.responsibleUserId"]),
            reviewQueue: value(request.query.reviewQueue),
            search: value(request.query.search),
            status: value(request.query["filter.status"]),
            targetType: value(request.query["filter.targetType"]),
        }), access(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async managerApprove(request, response) {
        const result = await service.managerReview(parsedId(request, extensionRequestIdParamSchema), true, reviewExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "deadline_extensions.approve", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async managerReject(request, response) {
        const result = await service.managerReview(parsedId(request, extensionRequestIdParamSchema), false, reviewExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "deadline_extensions.reject", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async sendToManager(request, response) {
        const result = await service.submit(parsedId(request, extensionRequestIdParamSchema), access(request));
        await log(request, "action_plans.submit_to_audit", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async update(request, response) {
        const result = await service.update(parsedId(request, extensionRequestIdParamSchema), updateExtensionRequestSchema.parse(request.body), access(request));
        await log(request, "deadline_extensions.request", result.current, result.previous);
        sendSuccess(response, result.current);
    },
};
//# sourceMappingURL=extension-requests.controller.js.map