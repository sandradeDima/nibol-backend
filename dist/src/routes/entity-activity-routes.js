import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { requireAnyPermission } from "../middleware/authorization-middleware.js";
import { activityLogService } from "../services/activity-log-service.js";
import { entityActivityService } from "../services/entity-activity-service.js";
import { AppError } from "../utils/app-error.js";
import { getRequestLogActorContext } from "../utils/request-context.js";
import { sendPaginated } from "../utils/response.js";
const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");
const activityQuerySchema = z.object({
    activityType: z.string().trim().max(100).optional(),
    actorUserId: z.uuid().optional(),
    areaId: z.uuid().optional(),
    dateFrom: z.iso.date().optional(),
    dateTo: z.iso.date().optional(),
    entityId: z.string().trim().min(1).max(191).optional(),
    entityType: z.string().trim().max(64).optional(),
    includeTechnicalDetails: booleanQuery.optional(),
    observationCode: z.string().trim().max(64).optional(),
    observationId: z.uuid().optional(),
    origin: z.enum(["SYSTEM", "USER"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    role: z.string().trim().max(100).optional(),
    search: z.string().trim().default(""),
});
const getQueryValue = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const getParamValue = (value) => {
    const result = Array.isArray(value) ? value[0] : value;
    if (!result)
        throw new AppError("Entity parameter is required.", 400);
    return result;
};
const getAccess = (request) => {
    if (!request.authorizationSummary)
        throw new AppError("Authorization required.", 401);
    return request.authorizationSummary;
};
const parseQuery = (request) => {
    const pageSize = getQueryValue(request.query.pageSize) ?? getQueryValue(request.query.perPage);
    return activityQuerySchema.parse({
        activityType: getQueryValue(request.query.activityType) ?? getQueryValue(request.query["filter.activityType"]),
        actorUserId: getQueryValue(request.query.actorUserId) ?? getQueryValue(request.query["filter.actorUserId"]),
        areaId: getQueryValue(request.query.areaId) ?? getQueryValue(request.query["filter.areaId"]),
        dateFrom: getQueryValue(request.query.dateFrom) ?? getQueryValue(request.query["filter.dateFrom"]),
        dateTo: getQueryValue(request.query.dateTo) ?? getQueryValue(request.query["filter.dateTo"]),
        entityType: getQueryValue(request.query.entityType) ?? getQueryValue(request.query["filter.entityType"]),
        includeTechnicalDetails: getQueryValue(request.query.includeTechnicalDetails),
        observationCode: getQueryValue(request.query.observationCode) ?? getQueryValue(request.query["filter.observationCode"]),
        observationId: getQueryValue(request.query.observationId),
        origin: getQueryValue(request.query.origin) ?? getQueryValue(request.query["filter.origin"]),
        page: getQueryValue(request.query.page),
        pageSize: pageSize ?? "20",
        role: getQueryValue(request.query.role) ?? getQueryValue(request.query["filter.role"]),
        search: getQueryValue(request.query.search),
    });
};
export const entityActivityRouter = Router();
const activityAccess = requireAnyPermission(["activity.view", "activity_logs.view", "observations.view"]);
entityActivityRouter.get("/observations/:id/history", activityAccess, asyncHandler(async (request, response) => {
    const query = parseQuery(request);
    const result = await entityActivityService.list({ ...query, observationId: getParamValue(request.params.id) }, getAccess(request));
    sendPaginated(response, result.data, result.pagination);
}));
entityActivityRouter.get("/entities/:entityType/:entityId/history", activityAccess, asyncHandler(async (request, response) => {
    const query = parseQuery(request);
    const result = await entityActivityService.list({ ...query, entityId: getParamValue(request.params.entityId), entityType: getParamValue(request.params.entityType) }, getAccess(request));
    sendPaginated(response, result.data, result.pagination);
}));
entityActivityRouter.get("/activity", activityAccess, asyncHandler(async (request, response) => {
    const query = parseQuery(request);
    const result = await entityActivityService.list(query, getAccess(request));
    sendPaginated(response, result.data, result.pagination);
}));
entityActivityRouter.get("/activity/export", activityAccess, asyncHandler(async (request, response) => {
    const query = parseQuery(request);
    const access = getAccess(request);
    const csv = await entityActivityService.export(query, access);
    await activityLogService.logUserAction({
        ...getRequestLogActorContext(request),
        action: "activity.export",
        entityType: "entity_activity",
        metadata: { filtersApplied: true, format: "csv" },
    });
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=actividad-nibol.csv");
    response.send(csv);
}));
//# sourceMappingURL=entity-activity-routes.js.map