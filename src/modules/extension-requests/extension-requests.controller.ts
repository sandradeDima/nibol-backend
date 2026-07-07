import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import {
  EXTENSION_REQUEST_ACTIVITY_ACTIONS,
  EXTENSION_REQUEST_ENTITY_TYPES,
} from "./extension-requests.constants.js";
import { extensionRequestsService } from "./extension-requests.service.js";
import {
  commitmentIdParamSchema,
  createExtensionRequestSchema,
  extensionRequestIdParamSchema,
  listExtensionRequestsQuerySchema,
  observationIdParamSchema,
  reviewExtensionRequestSchema,
  updateExtensionRequestSchema,
} from "./extension-requests.validators.js";

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return undefined;
};

const getRequiredExtensionRequestId = (
  value: string | string[] | undefined,
): string => {
  const extensionRequestId = Array.isArray(value) ? value[0] : value;

  if (!extensionRequestId) {
    throw new AppError("Extension request id is required.", 400);
  }

  return extensionRequestIdParamSchema.parse({
    id: extensionRequestId,
  }).id;
};

const getRequiredObservationId = (value: string | string[] | undefined): string => {
  const observationId = Array.isArray(value) ? value[0] : value;

  if (!observationId) {
    throw new AppError("Observation id is required.", 400);
  }

  return observationIdParamSchema.parse({
    id: observationId,
  }).id;
};

const getRequiredCommitmentId = (value: string | string[] | undefined): string => {
  const commitmentId = Array.isArray(value) ? value[0] : value;

  if (!commitmentId) {
    throw new AppError("Commitment id is required.", 400);
  }

  return commitmentIdParamSchema.parse({
    id: commitmentId,
  }).id;
};

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

const logMutation = async ({
  action,
  request,
  summary,
  values,
}: {
  action: string;
  request: Request;
  summary: string;
  values: Awaited<ReturnType<typeof extensionRequestsService.createForObservation>>;
}) => {
  const actorContext = getRequestLogActorContext(request);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId: values.current.id,
      entityType: EXTENSION_REQUEST_ENTITY_TYPES.request,
      metadata: {
        observationCode: values.current.observation.code,
        statusAfter: values.current.status,
        statusBefore: values.previous?.status ?? null,
        summary,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId: values.current.id,
      entityType: EXTENSION_REQUEST_ENTITY_TYPES.request,
      newValues: values.current,
      oldValues: values.previous,
    }),
  ]);
};

export const extensionRequestsController = {
  async auditApprove(request: Request, response: Response) {
    const result = await extensionRequestsService.auditApprove(
      getRequiredExtensionRequestId(request.params.id),
      reviewExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.auditApprove,
      request,
      summary: `Auditoria aprobo la ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async auditReject(request: Request, response: Response) {
    const result = await extensionRequestsService.auditReject(
      getRequiredExtensionRequestId(request.params.id),
      reviewExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.auditReject,
      request,
      summary: `Auditoria rechazo la ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async cancel(request: Request, response: Response) {
    const result = await extensionRequestsService.cancel(
      getRequiredExtensionRequestId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.cancel,
      request,
      summary: `Se cancelo la ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async createForCommitment(request: Request, response: Response) {
    const result = await extensionRequestsService.createForCommitment(
      getRequiredCommitmentId(request.params.id),
      createExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.createForCommitment,
      request,
      summary: `Se creo una solicitud de ampliacion para el compromiso ${result.current.commitment?.title ?? result.current.id}.`,
      values: result,
    });

    sendSuccess(response, result.current, 201);
  },

  async createForObservation(request: Request, response: Response) {
    const result = await extensionRequestsService.createForObservation(
      getRequiredObservationId(request.params.id),
      createExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.createForObservation,
      request,
      summary: `Se creo una solicitud de ampliacion para la observacion ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current, 201);
  },

  async getById(request: Request, response: Response) {
    const result = await extensionRequestsService.getById(
      getRequiredExtensionRequestId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async list(request: Request, response: Response) {
    const query = listExtensionRequestsQuerySchema.parse({
      areaId: getQueryValue(request.query["filter.areaId"]),
      observationId: getQueryValue(request.query["filter.observationId"]),
      overdue: getQueryValue(request.query["filter.overdue"]),
      page: getQueryValue(request.query.page),
      pendingMine: getQueryValue(request.query["filter.pendingMine"]),
      perPage: getQueryValue(request.query.perPage),
      requestedByUserId: getQueryValue(request.query["filter.requestedByUserId"]),
      requestedDateFrom: getQueryValue(request.query["filter.requestedDateFrom"]),
      requestedDateTo: getQueryValue(request.query["filter.requestedDateTo"]),
      riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
      status: getQueryValue(request.query["filter.status"]),
    });

    const result = await extensionRequestsService.list(
      query,
      getRequiredAuthorizationSummary(request),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async managerApprove(request: Request, response: Response) {
    const result = await extensionRequestsService.managerApprove(
      getRequiredExtensionRequestId(request.params.id),
      reviewExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.managerApprove,
      request,
      summary: `Gerencia aprobo la ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async managerReject(request: Request, response: Response) {
    const result = await extensionRequestsService.managerReject(
      getRequiredExtensionRequestId(request.params.id),
      reviewExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.managerReject,
      request,
      summary: `Gerencia rechazo la ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async sendToAudit(request: Request, response: Response) {
    const result = await extensionRequestsService.sendToAudit(
      getRequiredExtensionRequestId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.sendToAudit,
      request,
      summary: `La ampliacion para ${result.current.observation.code} fue enviada a Auditoria.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async sendToManager(request: Request, response: Response) {
    const result = await extensionRequestsService.sendToManager(
      getRequiredExtensionRequestId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.sendToManager,
      request,
      summary: `La ampliacion para ${result.current.observation.code} fue enviada a Gerencia.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },

  async update(request: Request, response: Response) {
    const result = await extensionRequestsService.update(
      getRequiredExtensionRequestId(request.params.id),
      updateExtensionRequestSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logMutation({
      action: EXTENSION_REQUEST_ACTIVITY_ACTIONS.update,
      request,
      summary: `Se actualizo la solicitud de ampliacion para ${result.current.observation.code}.`,
      values: result,
    });

    sendSuccess(response, result.current);
  },
};
