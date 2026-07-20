import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { OBSERVATIONS_ENTITY_TYPE } from "./observations.constants.js";
import { OBSERVATIONS_PERMISSIONS } from "./observations.permissions.js";
import { observationsService } from "./observations.service.js";
import { createObservationSchema, listObservationsQuerySchema, observationIdParamSchema, updateObservationSchema, } from "./observations.validators.js";
const getQueryValue = (value) => {
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
const getRequiredObservationId = (value) => {
    const observationId = Array.isArray(value) ? value[0] : value;
    if (!observationId) {
        throw new AppError("Observation id is required.", 400);
    }
    return observationIdParamSchema.parse({
        id: observationId,
    }).id;
};
const getRequiredAuthorizationSummary = (request) => {
    if (!request.authorizationSummary) {
        throw new AppError("Authorization required.", 401);
    }
    return request.authorizationSummary;
};
const getNestedId = (value, key) => {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    const direct = record[key];
    if (typeof direct === "string")
        return direct;
    if (direct instanceof Date)
        return direct.toISOString();
    if (typeof direct === "number")
        return String(direct);
    if (direct && typeof direct === "object" && typeof direct.id === "string") {
        return direct.id;
    }
    return null;
};
const getObservationActivityType = (previous, current) => {
    if (getNestedId(previous, "status") !== getNestedId(current, "status"))
        return "OBSERVATION_STATUS_CHANGED";
    if (getNestedId(previous, "riskLevel") !== getNestedId(current, "riskLevel"))
        return "OBSERVATION_RISK_CHANGED";
    if (getNestedId(previous, "responsibleUser") !== getNestedId(current, "responsibleUser"))
        return "OBSERVATION_ASSIGNED";
    if (getNestedId(previous, "area") !== getNestedId(current, "area"))
        return "OBSERVATION_ASSIGNED";
    const previousDueDate = getNestedId(previous, "dueDate");
    const currentDueDate = getNestedId(current, "dueDate");
    if (previousDueDate !== currentDueDate)
        return "OBSERVATION_DUE_DATE_CHANGED";
    return "OBSERVATION_UPDATED";
};
export const observationsController = {
    async create(request, response) {
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
            entityActivityService.recordEntityChange({
                action: "create",
                activityType: "OBSERVATION_CREATED",
                actorUserId: actorContext.userId,
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
    async getById(request, response) {
        const observation = await observationsService.getObservationById(getRequiredObservationId(request.params.id), getRequiredAuthorizationSummary(request));
        sendSuccess(response, observation);
    },
    async list(request, response) {
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
        const result = await observationsService.listObservations(query, getRequiredAuthorizationSummary(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async options(request, response) {
        const result = await observationsService.getObservationFormOptions(getRequiredAuthorizationSummary(request));
        sendSuccess(response, result);
    },
    async remove(request, response) {
        const actorContext = getRequestLogActorContext(request);
        const observation = await observationsService.deleteObservation(getRequiredObservationId(request.params.id));
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
            entityActivityService.recordEntityChange({
                action: "delete",
                activityType: "OBSERVATION_CLOSED",
                actorUserId: actorContext.userId,
                description: `La observación ${observation.code} fue retirada del flujo activo.`,
                entityId: observation.id,
                entityType: "OBSERVATION",
                previousData: observation,
                observationId: observation.id,
                targetUrl: `/observaciones/${observation.id}`,
                title: "Observación cerrada",
            }),
        ]);
        sendSuccess(response, {
            deleted: true,
            id: observation.id,
        });
    },
    async update(request, response) {
        const payload = updateObservationSchema.parse(request.body);
        const actorContext = getRequestLogActorContext(request);
        const result = await observationsService.updateObservation(getRequiredObservationId(request.params.id), payload);
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
                    summary: result.previous.status.id !== result.current.status.id
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
            entityActivityService.recordEntityChange({
                action: "update",
                activityType: getObservationActivityType(result.previous, result.current),
                actorUserId: actorContext.userId,
                description: result.previous.status.id !== result.current.status.id
                    ? `El estado cambió de ${result.previous.status.name} a ${result.current.status.name}.`
                    : `Se actualizó la observación ${result.current.code}.`,
                entityId: result.current.id,
                entityType: "OBSERVATION",
                newData: result.current,
                observationId: result.current.id,
                previousData: result.previous,
                targetUrl: `/observaciones/${result.current.id}`,
                title: result.previous.status.id !== result.current.status.id
                    ? "Estado de observación cambiado"
                    : "Observación actualizada",
            }),
        ]);
        sendSuccess(response, result.current);
    },
};
//# sourceMappingURL=observations.controller.js.map