import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler.js";
import { authorizationService } from "../services/authorization-service.js";
import { auditLogService } from "../services/audit-log-service.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../utils/app-error.js";
import { env } from "../utils/env.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { deadlineMonitorService } from "../jobs/deadline-monitor/deadline-monitor.service.js";
import { DEADLINE_MONITOR_PARAMETER_DEFAULTS } from "../jobs/deadline-monitor/deadline-monitor.constants.js";
const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
});
const ruleUpdateSchema = z.object({
    value: z.string().trim().min(1).max(10_000),
});
const getQueryValue = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const getUserId = (request) => {
    const userId = request.authSession?.user.id;
    if (!userId)
        throw new AppError("Authentication required.", 401);
    return userId;
};
const isSystemOperator = (roles, isAdmin) => {
    if (isAdmin)
        return true;
    return roles.some((role) => /^(sistemas?|systems?)$/i.test(role.trim()));
};
const requireSystemOperator = async (request, response, next) => {
    try {
        const userId = getUserId(request);
        const summary = await authorizationService.getUserAuthorizationSummary(userId);
        request.authorizationSummary = summary;
        if (!isSystemOperator(summary.roles, summary.isAdmin)) {
            response.status(403).json({ success: false, message: "Acceso restringido a Admin o Sistemas." });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
const extractCronSecret = (request) => {
    const authorization = request.get("authorization");
    if (authorization?.startsWith("Bearer "))
        return authorization.slice(7).trim();
    return request.get("x-cron-secret")?.trim() ?? null;
};
const hasValidCronSecret = (provided) => {
    if (!env.CRON_SECRET || !provided)
        return false;
    const expected = Buffer.from(env.CRON_SECRET);
    const actual = Buffer.from(provided);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};
export const automaticJobsRouter = Router();
automaticJobsRouter.post("/internal/jobs/deadline-monitor", asyncHandler(async (request, response) => {
    if (!env.CRON_SECRET) {
        throw new AppError("CRON_SECRET is not configured.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
        throw new AppError("Invalid cron credentials.", 401);
    }
    const result = await deadlineMonitorService.run({ triggeredBy: "CRON" });
    sendSuccess(response, result);
}));
automaticJobsRouter.get("/automatic-jobs/executions", requireSystemOperator, asyncHandler(async (request, response) => {
    const pagination = paginationSchema.parse({
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
    });
    const result = await deadlineMonitorService.listExecutions(pagination.page, pagination.perPage);
    sendPaginated(response, result.data, result.pagination);
}));
automaticJobsRouter.get("/automatic-jobs/latest", requireSystemOperator, asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineMonitorService.getLatestExecution());
}));
automaticJobsRouter.post("/automatic-jobs/deadline-monitor/run", requireSystemOperator, asyncHandler(async (request, response) => {
    const userId = getUserId(request);
    const result = await deadlineMonitorService.run({
        triggeredBy: "USER",
        triggeredByUserId: userId,
    });
    await auditLogService.create({
        entityId: result.jobName,
        entityType: "scheduled_job_execution",
        newValues: { status: result.status, triggeredBy: "USER" },
        userId,
    });
    sendSuccess(response, result);
}));
automaticJobsRouter.get("/automatic-jobs/rules", requireSystemOperator, asyncHandler(async (_request, response) => {
    const keys = Object.keys(DEADLINE_MONITOR_PARAMETER_DEFAULTS);
    const records = await prisma.systemParameter.findMany({
        orderBy: { key: "asc" },
        select: {
            active: true,
            description: true,
            editable: true,
            group: true,
            id: true,
            key: true,
            name: true,
            updatedAt: true,
            value: true,
            valueType: true,
        },
        where: { key: { in: keys } },
    });
    const byKey = new Map(records.map((record) => [record.key, record]));
    sendSuccess(response, keys.map((key) => ({
        ...(byKey.get(key) ?? {
            active: true,
            description: null,
            editable: true,
            group: "notificaciones_automaticas",
            id: null,
            key,
            name: key.replaceAll("_", " "),
            updatedAt: null,
            valueType: typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS[key] === "number" ? "number" : "boolean",
        }),
        defaultValue: String(DEADLINE_MONITOR_PARAMETER_DEFAULTS[key]),
        value: byKey.get(key)?.value ?? String(DEADLINE_MONITOR_PARAMETER_DEFAULTS[key]),
        updatedAt: byKey.get(key)?.updatedAt?.toISOString() ?? null,
    })));
}));
automaticJobsRouter.patch("/automatic-jobs/rules/:key", requireSystemOperator, asyncHandler(async (request, response) => {
    const key = typeof request.params.key === "string" ? request.params.key : "";
    if (!(key in DEADLINE_MONITOR_PARAMETER_DEFAULTS)) {
        throw new AppError("Unknown automatic notification rule.", 404);
    }
    const payload = ruleUpdateSchema.parse(request.body);
    const userId = getUserId(request);
    const previous = await prisma.systemParameter.findUnique({ where: { key } });
    const current = previous
        ? await prisma.systemParameter.update({
            data: { value: payload.value, active: true },
            where: { id: previous.id },
        })
        : await prisma.systemParameter.create({
            data: {
                active: true,
                description: "Regla de notificaciones automáticas del monitor de vencimientos.",
                editable: true,
                group: "notificaciones_automaticas",
                key,
                name: key.replaceAll("_", " "),
                value: payload.value,
                valueType: typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS[key] === "number" ? "number" : "boolean",
            },
        });
    await auditLogService.create({
        entityId: current.id,
        entityType: "system_parameter",
        newValues: { key, value: payload.value },
        oldValues: previous ? { key, value: previous.value } : null,
        userId,
    });
    sendSuccess(response, { ...current, updatedAt: current.updatedAt.toISOString() });
}));
//# sourceMappingURL=automatic-jobs-routes.js.map