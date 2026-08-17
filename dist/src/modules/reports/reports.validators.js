import { z } from "zod";
const booleanFilter = z
    .enum(["false", "true"])
    .transform((value) => value === "true")
    .optional();
const dateFilter = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();
export const reportTypeSchema = z.enum([
    "OBSERVATIONS",
    "ACTION_PLANS",
    "PROGRESS_EVIDENCE",
    "EXTENSIONS",
    "AREA_COMPLIANCE",
    "RESPONSIBLES",
    "RISKS",
]);
export const reportPeriodFieldSchema = z.enum(["createdAt", "currentDueDate"]);
export const reportFiltersSchema = z.object({
    activeOnly: booleanFilter,
    areaId: z.uuid().optional(),
    dateFrom: dateFilter,
    dateTo: dateFilter,
    dueSoon: booleanFilter,
    dueSoonDays: z.coerce.number().int().min(1).max(90).default(7),
    hasEvidence: booleanFilter,
    hasExtension: booleanFilter,
    hasPlan: booleanFilter,
    overdue: booleanFilter,
    periodField: reportPeriodFieldSchema.default("createdAt"),
    progressMax: z.coerce.number().int().min(0).max(100).optional(),
    progressMin: z.coerce.number().int().min(0).max(100).optional(),
    responsibleUserId: z.uuid().optional(),
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().max(191).default(""),
    statusId: z.uuid().optional(),
});
export const reportQuerySchema = reportFiltersSchema.extend({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
});
export const reportPreviewQuerySchema = reportQuerySchema.extend({
    reportName: z.string().trim().max(191).default("Reporte operativo"),
    type: reportTypeSchema.default("OBSERVATIONS"),
});
export const auditReportTemplateSchema = z.enum([
    "ACTIVITY_AREA",
    "ACTIVITY_USER",
    "APPROVALS",
    "DEADLINES",
    "EVIDENCE",
    "EXTENSIONS",
    "HISTORY",
    "INCUMPLIMIENTOS",
    "WORKFLOW_HISTORY",
]);
export const auditReportQuerySchema = z.object({
    areaId: z.uuid().optional(),
    dateFrom: dateFilter,
    dateTo: dateFilter,
    eventType: z.string().trim().max(100).optional(),
    observationId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    process: z.string().trim().max(100).optional(),
    result: z.string().trim().max(100).optional(),
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().max(191).default(""),
    status: z.string().trim().max(100).optional(),
    template: auditReportTemplateSchema.default("HISTORY"),
    userId: z.uuid().optional(),
});
export const reportExportQuerySchema = reportPreviewQuerySchema.extend({
    perPage: z.coerce.number().int().min(1).max(5000).default(5000),
});
export const auditReportExportQuerySchema = auditReportQuerySchema.extend({
    perPage: z.coerce.number().int().min(1).max(5000).default(5000),
});
//# sourceMappingURL=reports.validators.js.map