import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { workflowInstanceService } from "./workflow-instance.service.js";
import { workflowTimerService } from "./workflow-timer.service.js";
import { workflowTaskService } from "./workflow-task.service.js";
import { workflowInstanceIdParamSchema, workflowInstanceStartSchema, workflowTaskActionSchema, workflowTaskIdParamSchema, workflowTaskListQuerySchema, workflowTaskReassignSchema, workflowTimerIdParamSchema, workflowTimerListQuerySchema, } from "./workflow-runtime.validators.js";
const getQueryValue = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const getAccess = (request) => {
    const authorization = request.authorizationSummary;
    if (!authorization)
        throw new AppError("Se requiere autorización.", 401);
    return {
        ...authorization,
        ipAddress: getRequestLogActorContext(request).ipAddress ?? null,
    };
};
const getInstanceId = (request) => {
    const value = workflowInstanceIdParamSchema.parse({
        instanceId: request.params.instanceId,
    });
    return value.instanceId;
};
const getTaskId = (request) => {
    const value = workflowTaskIdParamSchema.parse({
        taskId: request.params.taskId,
    });
    return value.taskId;
};
const getTimerId = (request) => {
    const value = workflowTimerIdParamSchema.parse({
        timerId: request.params.timerId,
    });
    return value.timerId;
};
const getTaskListQuery = (request) => workflowTaskListQuerySchema.parse({
    dateFrom: getQueryValue(request.query.dateFrom),
    dateTo: getQueryValue(request.query.dateTo),
    dueState: getQueryValue(request.query.dueState),
    nodeId: getQueryValue(request.query.nodeId),
    page: getQueryValue(request.query.page),
    perPage: getQueryValue(request.query.perPage),
    processType: getQueryValue(request.query.processType),
    search: getQueryValue(request.query.search),
    sortBy: getQueryValue(request.query.sortBy),
    sortDirection: getQueryValue(request.query.sortDirection),
    workflowDefinitionId: getQueryValue(request.query.workflowDefinitionId),
});
export const workflowRuntimeController = {
    async startInstance(request, response) {
        sendSuccess(response, await workflowInstanceService.startInstance(workflowInstanceStartSchema.parse(request.body), getAccess(request)), 201);
    },
    async getInstance(request, response) {
        sendSuccess(response, await workflowInstanceService.getInstance(getInstanceId(request), getAccess(request)));
    },
    async getHistory(request, response) {
        sendSuccess(response, await workflowInstanceService.getHistory(getInstanceId(request), getAccess(request)));
    },
    async cancelInstance(request, response) {
        sendSuccess(response, await workflowInstanceService.cancelInstance(getInstanceId(request), getAccess(request)));
    },
    async retryInstance(request, response) {
        sendSuccess(response, await workflowInstanceService.retryInstance(getInstanceId(request), getAccess(request)));
    },
    async retryTimer(request, response) {
        const timer = await workflowTimerService.retryTimer(getTimerId(request));
        const userId = getAccess(request).userId;
        await auditLogService.create({
            entityId: timer.id,
            entityType: "workflow_timer",
            newValues: { attempts: 0, status: timer.status },
            userId,
        });
        sendSuccess(response, {
            ...timer,
            executeAt: timer.executeAt.toISOString(),
        });
    },
    async listTimers(request, response) {
        const query = workflowTimerListQuerySchema.parse({
            page: getQueryValue(request.query.page),
            perPage: getQueryValue(request.query.perPage),
            status: getQueryValue(request.query.status),
        });
        const result = await workflowTimerService.listTimers(query);
        sendPaginated(response, result.data, result.pagination);
    },
    async listMyPending(request, response) {
        const result = await workflowTaskService.listMyPending(getTaskListQuery(request), getAccess(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async getTask(request, response) {
        sendSuccess(response, await workflowTaskService.getTask(getTaskId(request), getAccess(request)));
    },
    async approve(request, response) {
        sendSuccess(response, await workflowTaskService.actOnTask(getTaskId(request), "APPROVE", workflowTaskActionSchema.parse(request.body ?? {}), getAccess(request)));
    },
    async reject(request, response) {
        sendSuccess(response, await workflowTaskService.actOnTask(getTaskId(request), "REJECT", workflowTaskActionSchema.parse(request.body ?? {}), getAccess(request)));
    },
    async observe(request, response) {
        sendSuccess(response, await workflowTaskService.actOnTask(getTaskId(request), "OBSERVE", workflowTaskActionSchema.parse(request.body ?? {}), getAccess(request)));
    },
    async requestCorrection(request, response) {
        sendSuccess(response, await workflowTaskService.actOnTask(getTaskId(request), "REQUEST_CORRECTION", workflowTaskActionSchema.parse(request.body ?? {}), getAccess(request)));
    },
    async complete(request, response) {
        sendSuccess(response, await workflowTaskService.actOnTask(getTaskId(request), "COMPLETE", workflowTaskActionSchema.parse(request.body ?? {}), getAccess(request)));
    },
    async reassign(request, response) {
        sendSuccess(response, await workflowTaskService.reassignTask(getTaskId(request), workflowTaskReassignSchema.parse(request.body), getAccess(request)));
    },
};
//# sourceMappingURL=workflow-runtime.controller.js.map