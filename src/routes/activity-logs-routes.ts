import { Router } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/authorization-middleware.js";
import { activityLogService } from "../services/activity-log-service.js";
import { sendPaginated } from "../utils/response.js";
import { listActivityLogsQuerySchema } from "../validators/activity-logs-validator.js";

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

export const activityLogsRouter = Router();

activityLogsRouter.get(
  "/activity-logs",
  requirePermission("activity_logs.view"),
  asyncHandler(async (request, response) => {
    const query = listActivityLogsQuerySchema.parse({
      action: getQueryValue(request.query["filter.action"]),
      dateFrom: getQueryValue(request.query["filter.dateFrom"]),
      dateTo: getQueryValue(request.query["filter.dateTo"]),
      entityType: getQueryValue(request.query["filter.entityType"]),
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
      userId: getQueryValue(request.query["filter.userId"]),
    });

    const result = await activityLogService.listActivityLogs({
      action: query.action,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      entityType: query.entityType,
      page: query.page,
      perPage: query.perPage,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      userId: query.userId,
    });

    sendPaginated(response, result.data, result.pagination);
  }),
);
