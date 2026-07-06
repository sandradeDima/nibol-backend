import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import {
  CONFIGURATION_ENTITY_TYPES,
  CONFIGURATION_PERMISSIONS,
} from "./configuration.constants.js";
import { configurationService } from "./configuration.service.js";
import {
  areaMutationSchema,
  catalogMutationSchema,
  listAreasQuerySchema,
  listCatalogsQuerySchema,
  listObservationStatusesQuerySchema,
  listRiskLevelsQuerySchema,
  listSystemParametersQuerySchema,
  observationStatusMutationSchema,
  recordIdParamSchema,
  riskLevelMutationSchema,
  systemParameterMutationSchema,
} from "./configuration.validators.js";

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

const getRequiredRecordId = (value: string | string[] | undefined): string => {
  const id = Array.isArray(value) ? value[0] : value;

  if (!id) {
    throw new AppError("Record id is required.", 400);
  }

  return recordIdParamSchema.parse({ id }).id;
};

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

const getRecordLabel = (record: Record<string, unknown>): string => {
  const name = record.name;

  if (typeof name === "string" && name.trim().length > 0) {
    return name;
  }

  const code = record.code;

  if (typeof code === "string" && code.trim().length > 0) {
    return code;
  }

  const key = record.key;

  if (typeof key === "string" && key.trim().length > 0) {
    return key;
  }

  const id = record.id;
  return typeof id === "string" ? id : "registro";
};

const logCreated = async ({
  action,
  entityLabel,
  entityType,
  record,
  request,
}: {
  action: string;
  entityLabel: string;
  entityType: string;
  record: Record<string, unknown> & { id: string };
  request: Request;
}) => {
  const actorContext = getRequestLogActorContext(request);
  const label = getRecordLabel(record);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId: record.id,
      entityType,
      metadata: {
        label,
        summary: `${entityLabel} ${label} fue creado.`,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId: record.id,
      entityType,
      newValues: record,
      oldValues: null,
    }),
  ]);
};

const logUpdated = async ({
  action,
  current,
  entityLabel,
  entityType,
  previous,
  request,
}: {
  action: string;
  current: Record<string, unknown> & { id: string };
  entityLabel: string;
  entityType: string;
  previous: Record<string, unknown>;
  request: Request;
}) => {
  const actorContext = getRequestLogActorContext(request);
  const label = getRecordLabel(current);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId: current.id,
      entityType,
      metadata: {
        label,
        summary: `${entityLabel} ${label} fue actualizado.`,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId: current.id,
      entityType,
      newValues: current,
      oldValues: previous,
    }),
  ]);
};

const logDeleted = async ({
  action,
  entityLabel,
  entityType,
  record,
  request,
}: {
  action: string;
  entityLabel: string;
  entityType: string;
  record: Record<string, unknown> & { id: string };
  request: Request;
}) => {
  const actorContext = getRequestLogActorContext(request);
  const label = getRecordLabel(record);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId: record.id,
      entityType,
      metadata: {
        label,
        summary: `${entityLabel} ${label} fue eliminado lógicamente.`,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId: record.id,
      entityType,
      newValues: null,
      oldValues: record,
    }),
  ]);
};

export const configurationController = {
  async bootstrap(request: Request, response: Response) {
    const result = await configurationService.getBootstrap(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async createArea(request: Request, response: Response) {
    const record = await configurationService.createArea(
      areaMutationSchema.parse(request.body),
    );

    await logCreated({
      action: CONFIGURATION_PERMISSIONS.areas.create,
      entityLabel: "Área",
      entityType: CONFIGURATION_ENTITY_TYPES.area,
      record,
      request,
    });

    sendSuccess(response, record, 201);
  },

  async createCatalog(request: Request, response: Response) {
    const record = await configurationService.createCatalog(
      catalogMutationSchema.parse(request.body),
    );

    await logCreated({
      action: CONFIGURATION_PERMISSIONS.catalogs.create,
      entityLabel: "Catálogo",
      entityType: CONFIGURATION_ENTITY_TYPES.catalog,
      record,
      request,
    });

    sendSuccess(response, record, 201);
  },

  async createObservationStatus(request: Request, response: Response) {
    const record = await configurationService.createObservationStatus(
      observationStatusMutationSchema.parse(request.body),
    );

    await logCreated({
      action: CONFIGURATION_PERMISSIONS.observationStatuses.create,
      entityLabel: "Estado de observación",
      entityType: CONFIGURATION_ENTITY_TYPES.observationStatus,
      record,
      request,
    });

    sendSuccess(response, record, 201);
  },

  async createRiskLevel(request: Request, response: Response) {
    const record = await configurationService.createRiskLevel(
      riskLevelMutationSchema.parse(request.body),
    );

    await logCreated({
      action: CONFIGURATION_PERMISSIONS.riskLevels.create,
      entityLabel: "Nivel de riesgo",
      entityType: CONFIGURATION_ENTITY_TYPES.riskLevel,
      record,
      request,
    });

    sendSuccess(response, record, 201);
  },

  async createSystemParameter(request: Request, response: Response) {
    const record = await configurationService.createSystemParameter(
      systemParameterMutationSchema.parse(request.body),
    );

    await logCreated({
      action: CONFIGURATION_PERMISSIONS.systemParameters.create,
      entityLabel: "Parámetro",
      entityType: CONFIGURATION_ENTITY_TYPES.systemParameter,
      record,
      request,
    });

    sendSuccess(response, record, 201);
  },

  async deleteArea(request: Request, response: Response) {
    const record = await configurationService.deleteArea(
      getRequiredRecordId(request.params.id),
    );

    await logDeleted({
      action: CONFIGURATION_PERMISSIONS.areas.delete,
      entityLabel: "Área",
      entityType: CONFIGURATION_ENTITY_TYPES.area,
      record,
      request,
    });

    sendSuccess(response, { deleted: true, id: record.id });
  },

  async deleteCatalog(request: Request, response: Response) {
    const record = await configurationService.deleteCatalog(
      getRequiredRecordId(request.params.id),
    );

    await logDeleted({
      action: CONFIGURATION_PERMISSIONS.catalogs.delete,
      entityLabel: "Catálogo",
      entityType: CONFIGURATION_ENTITY_TYPES.catalog,
      record,
      request,
    });

    sendSuccess(response, { deleted: true, id: record.id });
  },

  async deleteObservationStatus(request: Request, response: Response) {
    const record = await configurationService.deleteObservationStatus(
      getRequiredRecordId(request.params.id),
    );

    await logDeleted({
      action: CONFIGURATION_PERMISSIONS.observationStatuses.delete,
      entityLabel: "Estado de observación",
      entityType: CONFIGURATION_ENTITY_TYPES.observationStatus,
      record,
      request,
    });

    sendSuccess(response, { deleted: true, id: record.id });
  },

  async deleteRiskLevel(request: Request, response: Response) {
    const record = await configurationService.deleteRiskLevel(
      getRequiredRecordId(request.params.id),
    );

    await logDeleted({
      action: CONFIGURATION_PERMISSIONS.riskLevels.delete,
      entityLabel: "Nivel de riesgo",
      entityType: CONFIGURATION_ENTITY_TYPES.riskLevel,
      record,
      request,
    });

    sendSuccess(response, { deleted: true, id: record.id });
  },

  async deleteSystemParameter(request: Request, response: Response) {
    const record = await configurationService.deleteSystemParameter(
      getRequiredRecordId(request.params.id),
    );

    await logDeleted({
      action: CONFIGURATION_PERMISSIONS.systemParameters.delete,
      entityLabel: "Parámetro",
      entityType: CONFIGURATION_ENTITY_TYPES.systemParameter,
      record,
      request,
    });

    sendSuccess(response, { deleted: true, id: record.id });
  },

  async getAreaById(request: Request, response: Response) {
    const record = await configurationService.getAreaById(
      getRequiredRecordId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async getCatalogById(request: Request, response: Response) {
    const record = await configurationService.getCatalogById(
      getRequiredRecordId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async getObservationStatusById(request: Request, response: Response) {
    const record = await configurationService.getObservationStatusById(
      getRequiredRecordId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async getRiskLevelById(request: Request, response: Response) {
    const record = await configurationService.getRiskLevelById(
      getRequiredRecordId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async getSystemParameterById(request: Request, response: Response) {
    const record = await configurationService.getSystemParameterById(
      getRequiredRecordId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async listAreas(request: Request, response: Response) {
    const result = await configurationService.listAreas(
      listAreasQuerySchema.parse({
        active: getQueryValue(request.query["filter.active"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
      }),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async listCatalogs(request: Request, response: Response) {
    const result = await configurationService.listCatalogs(
      listCatalogsQuerySchema.parse({
        active: getQueryValue(request.query["filter.active"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        type: getQueryValue(request.query["filter.type"]),
      }),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async listObservationStatuses(request: Request, response: Response) {
    const result = await configurationService.listObservationStatuses(
      listObservationStatusesQuerySchema.parse({
        active: getQueryValue(request.query["filter.active"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
      }),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async listRiskLevels(request: Request, response: Response) {
    const result = await configurationService.listRiskLevels(
      listRiskLevelsQuerySchema.parse({
        active: getQueryValue(request.query["filter.active"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
      }),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async listSystemParameters(request: Request, response: Response) {
    const result = await configurationService.listSystemParameters(
      listSystemParametersQuerySchema.parse({
        active: getQueryValue(request.query["filter.active"]),
        group: getQueryValue(request.query["filter.group"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        valueType: getQueryValue(request.query["filter.valueType"]),
      }),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async updateArea(request: Request, response: Response) {
    const result = await configurationService.updateArea(
      getRequiredRecordId(request.params.id),
      areaMutationSchema.parse(request.body),
    );

    await logUpdated({
      action: CONFIGURATION_PERMISSIONS.areas.edit,
      current: result.current,
      entityLabel: "Área",
      entityType: CONFIGURATION_ENTITY_TYPES.area,
      previous: result.previous,
      request,
    });

    sendSuccess(response, result.current);
  },

  async updateCatalog(request: Request, response: Response) {
    const result = await configurationService.updateCatalog(
      getRequiredRecordId(request.params.id),
      catalogMutationSchema.parse(request.body),
    );

    await logUpdated({
      action: CONFIGURATION_PERMISSIONS.catalogs.edit,
      current: result.current,
      entityLabel: "Catálogo",
      entityType: CONFIGURATION_ENTITY_TYPES.catalog,
      previous: result.previous,
      request,
    });

    sendSuccess(response, result.current);
  },

  async updateObservationStatus(request: Request, response: Response) {
    const result = await configurationService.updateObservationStatus(
      getRequiredRecordId(request.params.id),
      observationStatusMutationSchema.parse(request.body),
    );

    await logUpdated({
      action: CONFIGURATION_PERMISSIONS.observationStatuses.edit,
      current: result.current,
      entityLabel: "Estado de observación",
      entityType: CONFIGURATION_ENTITY_TYPES.observationStatus,
      previous: result.previous,
      request,
    });

    sendSuccess(response, result.current);
  },

  async updateRiskLevel(request: Request, response: Response) {
    const result = await configurationService.updateRiskLevel(
      getRequiredRecordId(request.params.id),
      riskLevelMutationSchema.parse(request.body),
    );

    await logUpdated({
      action: CONFIGURATION_PERMISSIONS.riskLevels.edit,
      current: result.current,
      entityLabel: "Nivel de riesgo",
      entityType: CONFIGURATION_ENTITY_TYPES.riskLevel,
      previous: result.previous,
      request,
    });

    sendSuccess(response, result.current);
  },

  async updateSystemParameter(request: Request, response: Response) {
    const result = await configurationService.updateSystemParameter(
      getRequiredRecordId(request.params.id),
      systemParameterMutationSchema.parse(request.body),
    );

    await logUpdated({
      action: CONFIGURATION_PERMISSIONS.systemParameters.edit,
      current: result.current,
      entityLabel: "Parámetro",
      entityType: CONFIGURATION_ENTITY_TYPES.systemParameter,
      previous: result.previous,
      request,
    });

    sendSuccess(response, result.current);
  },
};
