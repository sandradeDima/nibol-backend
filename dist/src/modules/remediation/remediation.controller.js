import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { remediationService } from "./remediation.service.js";
import { actionPlanIdParamSchema, actionPlanOptionsQuerySchema, createActionPlanSchema, createRemediationPlanSchema, listActionPlansQuerySchema, observationActionPlanParamsSchema, remediationPlanIdParamSchema, updateActionPlanSchema, updateRemediationPlanSchema, } from "./remediation.validators.js";
const value = (input) => typeof input === "string" ? input : undefined;
const access = (request) => {
    if (!request.authorizationSummary)
        throw new AppError("Authorization required.", 401);
    return request.authorizationSummary;
};
const actionPlanId = (request) => actionPlanIdParamSchema.parse({ id: value(request.params.id) }).id;
const observationId = (request) => observationActionPlanParamsSchema.parse({ id: value(request.params.id) }).id;
const remediationPlanId = (request) => remediationPlanIdParamSchema.parse({ id: value(request.params.id) }).id;
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
            metadata: { summary: `Plan de acción: ${record.description}.` },
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
            title: "Plan de acción actualizado",
        }),
    ]);
};
const logRemediationPlan = async (request, action, current, previous) => {
    const record = current ?? previous;
    if (!record)
        return;
    const actor = getRequestLogActorContext(request);
    await Promise.all([
        activityLogService.logUserAction({
            ...actor,
            action,
            entityId: record.id,
            entityType: "REMEDIATION_PLAN",
            metadata: {
                summary: `Plan recomendado: ${record.strategyText ?? "actualizado"}.`,
            },
        }),
        auditLogService.create({
            ...actor,
            entityId: record.id,
            entityType: "REMEDIATION_PLAN",
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
            entityType: "REMEDIATION_PLAN",
            newData: current,
            observationId: record.observationId,
            previousData: previous,
            targetUrl: `/observaciones/${record.observationId}`,
            title: "Plan recomendado actualizado",
        }),
    ]);
};
export const remediationController = {
    async createRemediationPlan(request, response) {
        const record = await remediationService.createRemediationPlan(observationId(request), createRemediationPlanSchema.parse(request.body), access(request));
        await logRemediationPlan(request, "recommended_action_plans.create", record, null);
        sendSuccess(response, record, 201);
    },
    async listRemediationPlans(request, response) {
        sendSuccess(response, await remediationService.listRemediationPlans(observationId(request), access(request)));
    },
    async submitRemediationPlan(request, response) {
        const result = await remediationService.submitRemediationPlan(remediationPlanId(request), access(request));
        await logRemediationPlan(request, "recommended_action_plans.submit_to_audit", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async updateRemediationPlan(request, response) {
        const result = await remediationService.updateRemediationPlan(remediationPlanId(request), updateRemediationPlanSchema.parse(request.body), access(request));
        await logRemediationPlan(request, "recommended_action_plans.edit", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async createActionPlan(request, response) {
        const record = await remediationService.createActionPlan(observationId(request), createActionPlanSchema.parse(request.body), access(request));
        await log(request, "action_plans.create", record, null);
        sendSuccess(response, record, 201);
    },
    async deleteRemediationPlan(request, response) {
        const record = await remediationService.deleteRemediationPlan(remediationPlanId(request), access(request));
        await logRemediationPlan(request, "REMEDIATION_PLAN_SOFT_DELETED", null, record);
        sendSuccess(response, { deleted: true, id: record.id });
    },
    async deleteActionPlan(request, response) {
        const record = await remediationService.deleteActionPlan(actionPlanId(request), access(request));
        await log(request, "ACTION_PLAN_SOFT_DELETED", null, record);
        sendSuccess(response, { deleted: true, id: record.id });
    },
    async getActionPlan(request, response) {
        sendSuccess(response, await remediationService.getActionPlanById(actionPlanId(request), access(request)));
    },
    async actionPlanOptions(request, response) {
        sendSuccess(response, await remediationService.getActionPlanOptions(actionPlanOptionsQuerySchema.parse({
            areaId: value(request.query.areaId),
            areaResponsibleUserId: value(request.query.areaResponsibleUserId),
            observationAreaId: value(request.query.observationAreaId),
            observationId: value(request.query.observationId),
            processOwnerUserId: value(request.query.processOwnerUserId),
        }), access(request)));
    },
    async listActionPlans(request, response) {
        const result = await remediationService.listActionPlans(listActionPlansQuerySchema.parse({
            areaId: value(request.query["filter.areaId"]),
            areaResponsibleUserId: value(request.query["filter.areaResponsibleUserId"]),
            deadlineStatus: value(request.query["filter.deadlineStatus"]),
            dueDateFrom: value(request.query["filter.dueDateFrom"]),
            dueDateTo: value(request.query["filter.dueDateTo"]),
            observationId: value(request.query["filter.observationId"]),
            overdue: value(request.query["filter.overdue"]),
            page: value(request.query.page),
            perPage: value(request.query.perPage),
            processOwnerUserId: value(request.query["filter.processOwnerUserId"]),
            progressStatus: value(request.query["filter.progressStatus"]),
            reportNumber: value(request.query["filter.reportNumber"]),
            riskLevelId: value(request.query["filter.riskLevelId"]),
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