import { timingSafeEqual } from "node:crypto";

import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { asyncHandler } from "../middleware/async-handler.js";
import { authorizationService } from "../services/authorization-service.js";
import { auditLogService } from "../services/audit-log-service.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../utils/app-error.js";
import { env } from "../utils/env.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { deadlineReminderService } from "../jobs/deadline-monitor/deadline-reminder.service.js";
import {
  DEADLINE_REMINDER_ROLES,
} from "../jobs/deadline-monitor/deadline-reminder.constants.js";
import { DEADLINE_MONITOR_PARAMETER_DEFAULTS } from "../jobs/deadline-monitor/deadline-monitor.constants.js";
import { workflowTimerService } from "../modules/workflows/workflow-timer.service.js";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const ruleUpdateSchema = z.object({
  value: z.string().trim().min(1).max(10_000),
});

const deadlineReminderRoleSchema = z.enum(DEADLINE_REMINDER_ROLES);
const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use una fecha con formato AAAA-MM-DD.")
  .refine((value) => {
    try {
      const date = new Date(`${value}T12:00:00.000Z`);
      return date.toISOString().slice(0, 10) === value;
    } catch {
      return false;
    }
  }, "La fecha no es válida.");
const deadlineReminderPolicySchema = z.object({
  cadenceMonths: z.coerce.number().int().min(1).max(24),
  cutoffDay: z.coerce.number().int().min(1).max(28),
  enabled: z.boolean(),
  upcomingWindowDays: z.coerce.number().int().min(1).max(365),
});
const deadlineReminderRunSchema = z.object({
  cutoffDateKey: dateKeySchema.optional(),
  role: deadlineReminderRoleSchema.optional(),
});
const deadlineReminderPreviewSchema = z.object({
  cutoffDateKey: dateKeySchema.optional(),
  role: deadlineReminderRoleSchema,
});

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
};

const getUserId = (request: Parameters<RequestHandler>[0]): string => {
  const userId = request.authSession?.user.id;
  if (!userId) throw new AppError("Authentication required.", 401);
  return userId;
};

const requireSystemOperator: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const userId = getUserId(request);
    const summary =
      await authorizationService.getUserAuthorizationSummary(userId);
    request.authorizationSummary = summary;
    if (summary.dataScope !== "ALL") {
      response.status(403).json({
        success: false,
        message: "Acceso restringido a Admin o Sistemas.",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};

const extractCronSecret = (
  request: Parameters<RequestHandler>[0],
): string | null => {
  const authorization = request.get("authorization");
  if (authorization?.startsWith("Bearer "))
    return authorization.slice(7).trim();
  return request.get("x-cron-secret")?.trim() ?? null;
};

const hasValidCronSecret = (provided: string | null): boolean => {
  if (!env.CRON_SECRET || !provided) return false;
  const expected = Buffer.from(env.CRON_SECRET);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const automaticJobsRouter = Router();

automaticJobsRouter.post(
  "/internal/jobs/deadline-reminders",
  asyncHandler(async (request, response) => {
    if (!env.CRON_SECRET) {
      throw new AppError("CRON_SECRET is not configured.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Invalid cron credentials.", 401);
    }
    sendSuccess(
      response,
      await deadlineReminderService.run({
        mode: "SCHEDULED",
        triggeredBy: "CRON",
      }),
    );
  }),
);

automaticJobsRouter.post(
  "/internal/jobs/deadline-monitor",
  asyncHandler(async (request, response) => {
    if (!env.CRON_SECRET) {
      throw new AppError("CRON_SECRET is not configured.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Invalid cron credentials.", 401);
    }
    sendSuccess(
      response,
      await deadlineReminderService.run({
        mode: "SCHEDULED",
        triggeredBy: "CRON",
      }),
    );
  }),
);

automaticJobsRouter.post(
  "/internal/jobs/workflow-timers",
  asyncHandler(async (request, response) => {
    if (!env.CRON_SECRET) {
      throw new AppError("CRON_SECRET is not configured.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Invalid cron credentials.", 401);
    }
    sendSuccess(
      response,
      await workflowTimerService.run({ triggeredBy: "CRON" }),
    );
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/deadline-reminders/config",
  requireSystemOperator,
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getConfiguration());
  }),
);

automaticJobsRouter.patch(
  "/automatic-jobs/deadline-reminders/policies/:role",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const role = deadlineReminderRoleSchema.parse(request.params.role);
    const payload = deadlineReminderPolicySchema.parse(request.body);
    const userId = getUserId(request);
    const result = await deadlineReminderService.updatePolicy(role, payload);
    await auditLogService.create({
      entityId: role,
      entityType: "deadline_reminder_policy",
      newValues: result.current,
      oldValues: result.previous,
      userId,
    });
    sendSuccess(response, result.current);
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/deadline-reminders/preview",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const payload = deadlineReminderPreviewSchema.parse(request.body);
    sendSuccess(
      response,
      await deadlineReminderService.preview(
        payload.cutoffDateKey
          ? { cutoffDateKey: payload.cutoffDateKey, role: payload.role }
          : { role: payload.role },
      ),
    );
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/deadline-reminders/run",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const payload = deadlineReminderRunSchema.parse(request.body ?? {});
    const userId = getUserId(request);
    const result = await deadlineReminderService.run({
      mode: "MANUAL",
      triggeredBy: "USER",
      triggeredByUserId: userId,
      ...(payload.cutoffDateKey
        ? { cutoffDateKey: payload.cutoffDateKey }
        : {}),
      ...(payload.role ? { role: payload.role } : {}),
    });
    await auditLogService.create({
      entityId: result.jobName,
      entityType: "scheduled_job_execution",
      newValues: {
        lockSkipped: result.lockSkipped,
        mode: "MANUAL",
        role: payload.role ?? null,
        status: result.status,
      },
      userId,
    });
    sendSuccess(response, result);
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/deadline-reminders/executions",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const pagination = paginationSchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
    });
    const result = await deadlineReminderService.listExecutions(
      pagination.page,
      pagination.perPage,
    );
    sendPaginated(response, result.data, result.pagination);
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/deadline-reminders/latest",
  requireSystemOperator,
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getLatestExecution());
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/executions",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const pagination = paginationSchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
    });
    const result = await deadlineReminderService.listExecutions(
      pagination.page,
      pagination.perPage,
    );
    sendPaginated(response, result.data, result.pagination);
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/latest",
  requireSystemOperator,
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getLatestExecution());
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/deadline-monitor/run",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const userId = getUserId(request);
    const result = await deadlineReminderService.run({
      mode: "MANUAL",
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
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/workflow-timers/executions",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const pagination = paginationSchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
    });
    const result = await workflowTimerService.listExecutions(
      pagination.page,
      pagination.perPage,
    );
    sendPaginated(response, result.data, result.pagination);
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/workflow-timers/latest",
  requireSystemOperator,
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await workflowTimerService.getLatestExecution());
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/workflow-timers/run",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const userId = getUserId(request);
    const result = await workflowTimerService.run({
      triggeredBy: "USER",
      triggeredByUserId: userId,
    });
    await auditLogService.create({
      entityId: result.jobName,
      entityType: "scheduled_job_execution",
      newValues: { lockSkipped: result.lockSkipped, triggeredBy: "USER" },
      userId,
    });
    sendSuccess(response, result);
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/rules",
  requireSystemOperator,
  asyncHandler(async (_request, response) => {
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
    sendSuccess(
      response,
      keys.map((key) => ({
        ...(byKey.get(key) ?? {
          active: true,
          description: null,
          editable: true,
          group: "notificaciones_automaticas",
          id: null,
          key,
          name: key.replaceAll("_", " "),
          updatedAt: null,
          valueType:
            typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS[
              key as keyof typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS
            ] === "number"
              ? "number"
              : "boolean",
        }),
        defaultValue: String(
          DEADLINE_MONITOR_PARAMETER_DEFAULTS[
            key as keyof typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS
          ],
        ),
        value:
          byKey.get(key)?.value ??
          String(
            DEADLINE_MONITOR_PARAMETER_DEFAULTS[
              key as keyof typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS
            ],
          ),
        updatedAt: byKey.get(key)?.updatedAt?.toISOString() ?? null,
      })),
    );
  }),
);

automaticJobsRouter.patch(
  "/automatic-jobs/rules/:key",
  requireSystemOperator,
  asyncHandler(async (request, response) => {
    const key =
      typeof request.params.key === "string" ? request.params.key : "";
    if (!(key in DEADLINE_MONITOR_PARAMETER_DEFAULTS)) {
      throw new AppError("Unknown automatic notification rule.", 404);
    }
    const payload = ruleUpdateSchema.parse(request.body);
    const userId = getUserId(request);
    const previous = await prisma.systemParameter.findUnique({
      where: { key },
    });
    const current = previous
      ? await prisma.systemParameter.update({
          data: { value: payload.value, active: true },
          where: { id: previous.id },
        })
      : await prisma.systemParameter.create({
          data: {
            active: true,
            description:
              "Regla de notificaciones automáticas del monitor de vencimientos.",
            editable: true,
            group: "notificaciones_automaticas",
            key,
            name: key.replaceAll("_", " "),
            value: payload.value,
            valueType:
              typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS[
                key as keyof typeof DEADLINE_MONITOR_PARAMETER_DEFAULTS
              ] === "number"
                ? "number"
                : "boolean",
          },
        });
    await auditLogService.create({
      entityId: current.id,
      entityType: "system_parameter",
      newValues: { key, value: payload.value },
      oldValues: previous ? { key, value: previous.value } : null,
      userId,
    });
    sendSuccess(response, {
      ...current,
      updatedAt: current.updatedAt.toISOString(),
    });
  }),
);
