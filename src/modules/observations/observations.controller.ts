import type { Request, Response } from "express";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { OBSERVATIONS_ENTITY_TYPE } from "./observations.constants.js";
import { OBSERVATIONS_PERMISSIONS } from "./observations.permissions.js";
import { observationsService } from "./observations.service.js";
import {
  createObservationSchema,
  listObservationsQuerySchema,
  observationIdParamSchema,
  updateObservationSchema,
} from "./observations.validators.js";

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

const getRequiredObservationId = (
  value: string | string[] | undefined,
): string => {
  const observationId = Array.isArray(value) ? value[0] : value;

  if (!observationId) {
    throw new AppError("Observation id is required.", 400);
  }

  return observationIdParamSchema.parse({
    id: observationId,
  }).id;
};

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

export const observationsController = {
  async create(request: Request, response: Response) {
    const payload = createObservationSchema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const access = getRequiredAuthorizationSummary(request);
    const observation = await observationsService.createObservation(payload, access);

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: OBSERVATIONS_PERMISSIONS.create,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          code: observation.code,
          summary: `Observation ${observation.code} was created.`,
          title: observation.title,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: observation,
        oldValues: null,
      }),
    ]);

    sendSuccess(response, observation, 201);
  },

  async getById(request: Request, response: Response) {
    const observation = await observationsService.getObservationById(
      getRequiredObservationId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, observation);
  },

  async list(request: Request, response: Response) {
    const query = listObservationsQuerySchema.parse({
      areaId: getQueryValue(request.query["filter.areaId"]),
      dueDateFrom: getQueryValue(request.query["filter.dueDateFrom"]),
      dueDateTo: getQueryValue(request.query["filter.dueDateTo"]),
      overdue: getQueryValue(request.query["filter.overdue"]),
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
      riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
      statusId: getQueryValue(request.query["filter.statusId"]),
    });

    const result = await observationsService.listObservations(
      query,
      getRequiredAuthorizationSummary(request),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async options(request: Request, response: Response) {
    const result = await observationsService.getObservationFormOptions(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async remove(request: Request, response: Response) {
    const actorContext = getRequestLogActorContext(request);
    const observation = await observationsService.deleteObservation(
      getRequiredObservationId(request.params.id),
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: OBSERVATIONS_PERMISSIONS.delete,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          code: observation.code,
          summary: `Observation ${observation.code} was deleted.`,
          title: observation.title,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: null,
        oldValues: observation,
      }),
    ]);

    sendSuccess(response, {
      deleted: true,
      id: observation.id,
    });
  },

  async update(request: Request, response: Response) {
    const payload = updateObservationSchema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const result = await observationsService.updateObservation(
      getRequiredObservationId(request.params.id),
      payload,
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: OBSERVATIONS_PERMISSIONS.edit,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          code: result.current.code,
          statusAfter: result.current.status.name,
          statusBefore: result.previous.status.name,
          summary:
            result.previous.status.id !== result.current.status.id
              ? `Observation ${result.current.code} changed status from ${result.previous.status.name} to ${result.current.status.name}.`
              : `Observation ${result.current.code} was updated.`,
          title: result.current.title,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: result.current,
        oldValues: result.previous,
      }),
    ]);

    sendSuccess(response, result.current);
  },
};
