import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/authorization-middleware.js";
import { auditLogService } from "../services/audit-log-service.js";
import { sendPaginated } from "../utils/response.js";
import { listAuditLogsQuerySchema } from "../validators/audit-logs-validator.js";
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
export const auditLogsRouter = Router();
auditLogsRouter.get("/audit-logs", requirePermission("audit_logs.view"), asyncHandler(async (request, response) => {
    const query = listAuditLogsQuerySchema.parse({
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
    const result = await auditLogService.listAuditLogs({
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
}));
//# sourceMappingURL=audit-logs-routes.js.map