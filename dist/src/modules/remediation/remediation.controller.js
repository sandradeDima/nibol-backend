import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { remediationService } from "./remediation.service.js";
import { actionPlanIdParamSchema, createActionPlanSchema, listActionPlansQuerySchema, observationActionPlanParamsSchema, updateActionPlanSchema, } from "./remediation.validators.js";
const value = (input) => typeof input === "string" ? input : undefined;
const access = (request) => {
    if (!request.authorizationSummary)
        throw new AppError("Authorization required.", 401);
    return request.authorizationSummary;
};
const actionPlanId = (request) => actionPlanIdParamSchema.parse({ id: value(request.params.id) }).id;
const observationId = (request) => observationActionPlanParamsSchema.parse({ id: value(request.params.id) }).id;
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
            entityType: "ACTION_PLAN",
            metadata: { summary: `Plan de acción: ${record.title}.` },
        }),
        auditLogService.create({
            ...actor,
            entityId: record.id,
            entityType: "ACTION_PLAN",
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
            entityType: "ACTION_PLAN",
            newData: current,
            observationId: record.observation.id,
            previousData: previous,
            targetUrl: `/planes-accion/${record.id}`,
            title: `Plan de acción: ${record.title}`,
        }),
    ]);
};
export const remediationController = {
    async createActionPlan(request, response) {
        const record = await remediationService.createActionPlan(observationId(request), createActionPlanSchema.parse(request.body), access(request));
        await log(request, "action_plans.create", record, null);
        sendSuccess(response, record, 201);
    },
    async deleteActionPlan(request, response) {
        const record = await remediationService.deleteActionPlan(actionPlanId(request), access(request));
        await log(request, "action_plans.delete", null, record);
        sendSuccess(response, { deleted: true, id: record.id });
    },
    async getActionPlan(request, response) {
        sendSuccess(response, await remediationService.getActionPlanById(actionPlanId(request), access(request)));
    },
    async listActionPlans(request, response) {
        const result = await remediationService.listActionPlans(listActionPlansQuerySchema.parse({
            areaId: value(request.query["filter.areaId"]),
            dueDateFrom: value(request.query["filter.dueDateFrom"]),
            dueDateTo: value(request.query["filter.dueDateTo"]),
            observationId: value(request.query["filter.observationId"]),
            overdue: value(request.query["filter.overdue"]),
            page: value(request.query.page),
            perPage: value(request.query.perPage),
            responsibleUserId: value(request.query["filter.responsibleUserId"]),
            search: value(request.query.search),
            sortBy: value(request.query.sortBy),
            sortDirection: value(request.query.sortDirection),
            status: value(request.query["filter.status"]),
        }), access(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async markActionPlanComplete(request, response) {
        const result = await remediationService.markActionPlanComplete(actionPlanId(request), access(request));
        await log(request, "action_plans.complete", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async updateActionPlan(request, response) {
        const result = await remediationService.updateActionPlan(actionPlanId(request), updateActionPlanSchema.parse(request.body), access(request));
        await log(request, "action_plans.edit", result.current, result.previous);
        sendSuccess(response, result.current);
    },
};
//# sourceMappingURL=remediation.controller.js.map