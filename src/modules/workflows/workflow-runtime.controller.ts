import type { Request, Response } from "express";

import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { workflowInstanceService } from "./workflow-instance.service.js";
import { workflowTimerService } from "./workflow-timer.service.js";
import type { WorkflowActorContext } from "./workflows.types.js";
import { workflowTaskService } from "./workflow-task.service.js";
import {
  workflowInstanceIdParamSchema,
  workflowInstanceStartSchema,
  workflowTaskActionSchema,
  workflowTaskIdParamSchema,
  workflowTaskListQuerySchema,
  workflowTaskReassignSchema,
  workflowTimerIdParamSchema,
  workflowTimerListQuerySchema,
} from "./workflow-runtime.validators.js";

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

const getAccess = (request: Request): WorkflowActorContext => {
  const authorization = request.authorizationSummary;
  if (!authorization) throw new AppError("Se requiere autorización.", 401);
  return {
    ...authorization,
    ipAddress: getRequestLogActorContext(request).ipAddress ?? null,
  } satisfies WorkflowActorContext;
};

const getInstanceId = (request: Request): string => {
  const value = workflowInstanceIdParamSchema.parse({
    instanceId: request.params.instanceId,
  });
  return value.instanceId;
};

const getTaskId = (request: Request): string => {
  const value = workflowTaskIdParamSchema.parse({
    taskId: request.params.taskId,
  });
  return value.taskId;
};

const getTimerId = (request: Request): string => {
  const value = workflowTimerIdParamSchema.parse({
    timerId: request.params.timerId,
  });
  return value.timerId;
};

const getTaskListQuery = (request: Request) =>
  workflowTaskListQuerySchema.parse({
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
  async getStartOptions(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.getStartOptions(getAccess(request)),
    );
  },

  async startInstance(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.startInstance(
        workflowInstanceStartSchema.parse(request.body),
        getAccess(request),
      ),
      201,
    );
  },

  async getInstance(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.getInstance(
        getInstanceId(request),
        getAccess(request),
      ),
    );
  },

  async getHistory(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.getHistory(
        getInstanceId(request),
        getAccess(request),
      ),
    );
  },

  async cancelInstance(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.cancelInstance(
        getInstanceId(request),
        getAccess(request),
      ),
    );
  },

  async retryInstance(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowInstanceService.retryInstance(
        getInstanceId(request),
        getAccess(request),
      ),
    );
  },

  async retryTimer(request: Request, response: Response) {
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

  async listTimers(request: Request, response: Response) {
    const query = workflowTimerListQuerySchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      status: getQueryValue(request.query.status),
    });
    const result = await workflowTimerService.listTimers(query);
    sendPaginated(response, result.data, result.pagination);
  },

  async listMyPending(request: Request, response: Response) {
    const result = await workflowTaskService.listMyPending(
      getTaskListQuery(request),
      getAccess(request),
    );
    sendPaginated(response, result.data, result.pagination);
  },

  async getTask(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.getTask(getTaskId(request), getAccess(request)),
    );
  },

  async approve(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.actOnTask(
        getTaskId(request),
        "APPROVE",
        workflowTaskActionSchema.parse(request.body ?? {}),
        getAccess(request),
      ),
    );
  },

  async reject(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.actOnTask(
        getTaskId(request),
        "REJECT",
        workflowTaskActionSchema.parse(request.body ?? {}),
        getAccess(request),
      ),
    );
  },

  async observe(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.actOnTask(
        getTaskId(request),
        "OBSERVE",
        workflowTaskActionSchema.parse(request.body ?? {}),
        getAccess(request),
      ),
    );
  },

  async requestCorrection(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.actOnTask(
        getTaskId(request),
        "REQUEST_CORRECTION",
        workflowTaskActionSchema.parse(request.body ?? {}),
        getAccess(request),
      ),
    );
  },

  async complete(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.actOnTask(
        getTaskId(request),
        "COMPLETE",
        workflowTaskActionSchema.parse(request.body ?? {}),
        getAccess(request),
      ),
    );
  },

  async reassign(request: Request, response: Response) {
    sendSuccess(
      response,
      await workflowTaskService.reassignTask(
        getTaskId(request),
        workflowTaskReassignSchema.parse(request.body),
        getAccess(request),
      ),
    );
  },
};
