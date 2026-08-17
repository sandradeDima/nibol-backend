import type { Request, Response } from "express";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { observationCompletenessService } from "./observation-completeness.service.js";
import { OBSERVATIONS_ENTITY_TYPE } from "./observations.constants.js";
import { OBSERVATIONS_PERMISSIONS } from "./observations.permissions.js";
import { observationsService } from "./observations.service.js";
import {
  createObservationSchema,
  listObservationsQuerySchema,
  observationIdParamSchema,
  updateObservationSchema,
} from "./observations.validators.js";

const queryValue = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;

const requireAccess = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary)
    throw new AppError("Authorization required.", 401);
  return request.authorizationSummary;
};

const observationId = (request: Request): string =>
  observationIdParamSchema.parse({ id: queryValue(request.params.id) }).id;

export const observationsController = {
  async close(request: Request, response: Response) {
    const access = requireAccess(request);
    const result = await observationsService.closeObservation(
      observationId(request),
      access,
    );
    const actor = getRequestLogActorContext(request);
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: OBSERVATIONS_PERMISSIONS.close,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          identifier: result.current.displayCode,
          summary: `Se concluyó ${result.current.displayCode}.`,
        },
      }),
      auditLogService.create({
        ...actor,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: result.current,
        oldValues: result.previous,
      }),
      entityActivityService.recordEntityChange({
        action: "close",
        activityType: "OBSERVATION_CLOSED",
        actorUserId: actor.userId,
        description:
          "Auditoría aprobó el cierre después de validar todos los planes de acción.",
        entityId: result.current.id,
        entityType: "OBSERVATION",
        newData: result.current,
        observationId: result.current.id,
        previousData: result.previous,
        targetUrl: `/observaciones/${result.current.id}`,
        title: "Observación concluida",
      }),
    ]);
    sendSuccess(response, result.current);
  },

  async create(request: Request, response: Response) {
    const access = requireAccess(request);
    const observation = await observationsService.createObservation(
      createObservationSchema.parse(request.body),
      access,
    );
    const actor = getRequestLogActorContext(request);

    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: OBSERVATIONS_PERMISSIONS.create,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          identifier: observation.displayCode,
          summary: `Se creó ${observation.displayCode}.`,
          title: observation.title,
        },
      }),
      auditLogService.create({
        ...actor,
        entityId: observation.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: observation,
        oldValues: null,
      }),
      entityActivityService.recordEntityChange({
        action: "create",
        activityType: "OBSERVATION_CREATED",
        actorUserId: actor.userId,
        description: `Se creó ${observation.displayCode}.`,
        entityId: observation.id,
        entityType: "OBSERVATION",
        newData: observation,
        observationId: observation.id,
        targetUrl: `/observaciones/${observation.id}`,
        title: "Observación creada",
      }),
    ]);

    sendSuccess(response, observation, 201);
  },

  async getActionItems(request: Request, response: Response) {
    const access = requireAccess(request);
    const context = await observationsService.getObservationForActionItems(
      observationId(request),
      access,
    );
    sendSuccess(
      response,
      await observationCompletenessService.getForObservation(context, access),
    );
  },

  async getById(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationsService.getObservationById(
        observationId(request),
        requireAccess(request),
      ),
    );
  },

  async list(request: Request, response: Response) {
    const query = listObservationsQuerySchema.parse({
      actionPlanResponsibleUserId: queryValue(
        request.query["filter.actionPlanResponsibleUserId"],
      ),
      areaId: queryValue(request.query["filter.areaId"]),
      areaResponsibleUserId: queryValue(
        request.query["filter.areaResponsibleUserId"],
      ),
      auditReportId: queryValue(request.query["filter.auditReportId"]),
      currentDueDateFrom: queryValue(
        request.query["filter.currentDueDateFrom"],
      ),
      currentDueDateTo: queryValue(request.query["filter.currentDueDateTo"]),
      mainObservationId: queryValue(request.query["filter.mainObservationId"]),
      observationStatus: queryValue(request.query["filter.observationStatus"]),
      overdue: queryValue(request.query["filter.overdue"]),
      page: queryValue(request.query.page),
      perPage: queryValue(request.query.perPage),
      processOwnerUserId: queryValue(
        request.query["filter.processOwnerUserId"],
      ),
      riskId: queryValue(request.query["filter.riskId"]),
      riskLevelId: queryValue(request.query["filter.riskLevelId"]),
      search: queryValue(request.query.search),
      sortBy: queryValue(request.query.sortBy),
      sortDirection: queryValue(request.query.sortDirection),
    });
    const result = await observationsService.listObservations(
      query,
      requireAccess(request),
    );
    sendPaginated(response, result.data, result.pagination);
  },

  async options(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationsService.getObservationFormOptions(
        requireAccess(request),
      ),
    );
  },

  async remove(request: Request, response: Response) {
    const actor = getRequestLogActorContext(request);
    const previous = await observationsService.deleteObservation(
      observationId(request),
      requireAccess(request),
    );
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: OBSERVATIONS_PERMISSIONS.delete,
        entityId: previous.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          identifier: previous.displayCode,
          summary: `Se archivó ${previous.displayCode}.`,
        },
      }),
      auditLogService.create({
        ...actor,
        entityId: previous.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: null,
        oldValues: previous,
      }),
    ]);
    sendSuccess(response, { deleted: true, id: previous.id });
  },

  async update(request: Request, response: Response) {
    const result = await observationsService.updateObservation(
      observationId(request),
      updateObservationSchema.parse(request.body),
      requireAccess(request),
    );
    const actor = getRequestLogActorContext(request);
    const activityType =
      result.previous.riskLevel.id !== result.current.riskLevel.id
        ? "OBSERVATION_RISK_LEVEL_CHANGED"
        : result.previous.currentDueDate !== result.current.currentDueDate
          ? "OBSERVATION_DEADLINE_RECALCULATED"
          : "OBSERVATION_UPDATED";
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: OBSERVATIONS_PERMISSIONS.edit,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        metadata: {
          identifier: result.current.displayCode,
          summary: `Se actualizó ${result.current.displayCode}.`,
        },
      }),
      auditLogService.create({
        ...actor,
        entityId: result.current.id,
        entityType: OBSERVATIONS_ENTITY_TYPE,
        newValues: result.current,
        oldValues: result.previous,
      }),
      entityActivityService.recordEntityChange({
        action: "update",
        activityType,
        actorUserId: actor.userId,
        entityId: result.current.id,
        entityType: "OBSERVATION",
        newData: result.current,
        observationId: result.current.id,
        previousData: result.previous,
        targetUrl: `/observaciones/${result.current.id}`,
        title: "Observación actualizada",
      }),
    ]);
    sendSuccess(response, result.current);
  },
};
