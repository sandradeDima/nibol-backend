import { timingSafeEqual } from "node:crypto";

import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission } from "../middleware/authorization-middleware.js";
import { emailService } from "../emails/EmailService.js";
import { emailTemplateDefinitions } from "../emails/templates/index.js";
import { auditLogService } from "../services/audit-log-service.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../utils/app-error.js";
import { env } from "../utils/env.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { deadlineReminderService } from "../jobs/deadline-monitor/deadline-reminder.service.js";
import {
  DEADLINE_REMINDER_ALERT_DEFAULTS,
  DEADLINE_REMINDER_ROLES,
} from "../jobs/deadline-monitor/deadline-reminder.constants.js";
import { DEADLINE_MONITOR_PARAMETER_DEFAULTS } from "../jobs/deadline-monitor/deadline-monitor.constants.js";
import { workflowTimerService } from "../modules/workflows/workflow-timer.service.js";
import {
  getNotificationCatalog,
  getNotificationChannelPreferenceKeys,
  NOTIFICATION_CATALOG,
  NOTIFICATION_PREFERENCE_DEFAULTS,
} from "../services/notification-preferences.js";

const AUTOMATIC_NOTIFICATION_RULE_DEFAULTS = {
  ...DEADLINE_MONITOR_PARAMETER_DEFAULTS,
  ...DEADLINE_REMINDER_ALERT_DEFAULTS,
  ...NOTIFICATION_PREFERENCE_DEFAULTS,
};
const NOTIFICATION_RULE_METADATA = Object.fromEntries(
  NOTIFICATION_CATALOG.flatMap((item) => {
    const keys = getNotificationChannelPreferenceKeys(item.key);
    return [
      [item.key, { description: item.description, name: item.name }],
      [
        keys.internal,
        {
          description: `Activar o pausar ${item.name.toLowerCase()} en la plataforma.`,
          name: `${item.name} · Plataforma`,
        },
      ],
      [
        keys.email,
        {
          description: `Activar o pausar ${item.name.toLowerCase()} por correo.`,
          name: `${item.name} · Correo`,
        },
      ],
    ];
  }),
);
const REMINDER_ALERT_RULE_METADATA: Record<
  string,
  { description: string; name: string }
> = {
  include_reminder_due_today: {
    description: "Incluye planes que vencen en la fecha de corte.",
    name: "Recordatorios · Vencimientos del día",
  },
  include_reminder_overdue: {
    description: "Incluye planes cuya fecha límite ya venció.",
    name: "Recordatorios · Planes vencidos",
  },
  include_reminder_upcoming: {
    description: "Incluye planes dentro de la ventana próxima por rol.",
    name: "Recordatorios · Próximos vencimientos",
  },
};

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
  if (!userId) throw new AppError("Debe iniciar sesión para continuar.", 401);
  return userId;
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
      throw new AppError("La variable CRON_SECRET no está configurada.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Las credenciales de cron no son válidas.", 401);
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
      throw new AppError("La variable CRON_SECRET no está configurada.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Las credenciales de cron no son válidas.", 401);
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
      throw new AppError("La variable CRON_SECRET no está configurada.", 503);
    }
    if (!hasValidCronSecret(extractCronSecret(request))) {
      throw new AppError("Las credenciales de cron no son válidas.", 401);
    }
    sendSuccess(
      response,
      await workflowTimerService.run({ triggeredBy: "CRON" }),
    );
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/deadline-reminders/config",
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getConfiguration());
  }),
);

automaticJobsRouter.patch(
  "/automatic-jobs/deadline-reminders/policies/:role",
  requirePermission("automatic_jobs.edit"),
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
  requirePermission("automatic_jobs.view"),
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
  requirePermission("automatic_jobs.edit"),
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
  requirePermission("automatic_jobs.view"),
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
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getLatestExecution());
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/executions",
  requirePermission("automatic_jobs.view"),
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
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await deadlineReminderService.getLatestExecution());
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/deadline-monitor/run",
  requirePermission("automatic_jobs.edit"),
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
  requirePermission("automatic_jobs.view"),
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
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await workflowTimerService.getLatestExecution());
  }),
);

automaticJobsRouter.post(
  "/automatic-jobs/workflow-timers/run",
  requirePermission("automatic_jobs.edit"),
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
  "/automatic-jobs/notification-catalog",
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    sendSuccess(response, await getNotificationCatalog());
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/rules",
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    const keys = Object.keys(AUTOMATIC_NOTIFICATION_RULE_DEFAULTS);
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
      where: { deletedAt: null, key: { in: keys } },
    });
    const byKey = new Map(records.map((record) => [record.key, record]));
    sendSuccess(
      response,
      keys.map((key) => ({
        ...(byKey.get(key) ?? {
          active: true,
          description: REMINDER_ALERT_RULE_METADATA[key]?.description ?? null,
          editable: true,
          group: "notificaciones_automaticas",
          id: null,
          key,
          name:
            REMINDER_ALERT_RULE_METADATA[key]?.name ?? key.replaceAll("_", " "),
          updatedAt: null,
          valueType:
            typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS[
              key as keyof typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS
            ] === "number"
              ? "number"
              : "boolean",
        }),
        ...(REMINDER_ALERT_RULE_METADATA[key] ??
          NOTIFICATION_RULE_METADATA[key] ??
          {}),
        defaultValue: String(
          AUTOMATIC_NOTIFICATION_RULE_DEFAULTS[
            key as keyof typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS
          ],
        ),
        value:
          byKey.get(key)?.value ??
          String(
            AUTOMATIC_NOTIFICATION_RULE_DEFAULTS[
              key as keyof typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS
            ],
          ),
        updatedAt: byKey.get(key)?.updatedAt?.toISOString() ?? null,
      })),
    );
  }),
);

automaticJobsRouter.get(
  "/automatic-jobs/deadline-reminders/email-preview",
  requirePermission("automatic_jobs.view"),
  asyncHandler(async (_request, response) => {
    const rendered = await emailService.renderTemplate(
      "deadlineReminder",
      emailTemplateDefinitions.deadlineReminder.sampleVariables,
    );
    sendSuccess(response, {
      html: rendered.html,
      subject: rendered.subject,
      template: "deadlineReminder",
    });
  }),
);

automaticJobsRouter.patch(
  "/automatic-jobs/rules/:key",
  requirePermission("automatic_jobs.edit"),
  asyncHandler(async (request, response) => {
    const key =
      typeof request.params.key === "string" ? request.params.key : "";
    if (!(key in AUTOMATIC_NOTIFICATION_RULE_DEFAULTS)) {
      throw new AppError(
        "No se encontró la regla de notificación automática.",
        404,
      );
    }
    const payload = ruleUpdateSchema.parse(request.body);
    const userId = getUserId(request);
    const previous = await prisma.systemParameter.findUnique({
      where: { key },
    });
    const current = previous
      ? await prisma.systemParameter.update({
          data: { deletedAt: null, value: payload.value, active: true },
          where: { id: previous.id },
        })
      : await prisma.systemParameter.create({
          data: {
            active: true,
            description:
              REMINDER_ALERT_RULE_METADATA[key]?.description ??
              NOTIFICATION_RULE_METADATA[key]?.description ??
              "Regla de notificaciones automáticas del monitor de vencimientos.",
            editable: true,
            group: "notificaciones_automaticas",
            key,
            name:
              REMINDER_ALERT_RULE_METADATA[key]?.name ??
              NOTIFICATION_RULE_METADATA[key]?.name ??
              key.replaceAll("_", " "),
            value: payload.value,
            valueType:
              typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS[
                key as keyof typeof AUTOMATIC_NOTIFICATION_RULE_DEFAULTS
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
