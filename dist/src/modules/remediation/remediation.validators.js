import { z } from "zod";
const csvArray = (item) => z.preprocess((value) => typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : value, z.array(item).min(1).optional());
export const actionPlanIdParamSchema = z.object({ id: z.uuid() });
export const observationActionPlanParamsSchema = z.object({ id: z.uuid() });
export const remediationPlanIdParamSchema = z.object({ id: z.uuid() });
const remediationPlanFields = {
    additionalComments: z.string().trim().max(10_000).nullable().optional(),
    areaId: z.uuid(),
    mitigationText: z.string().trim().max(10_000).nullable().optional(),
    ownerUserId: z.uuid().nullable().optional(),
    strategyText: z.string().trim().min(10).max(10_000),
};
export const createRemediationPlanSchema = z.object(remediationPlanFields);
export const updateRemediationPlanSchema = z
    .object(remediationPlanFields)
    .omit({ areaId: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
});
const fields = {
    description: z.string().trim().min(1).max(10_000),
    dueDate: z.coerce.date(),
    observationAreaId: z.uuid(),
    responsibleUserId: z.uuid(),
    sortOrder: z.coerce.number().int().min(0).optional(),
};
export const createActionPlanSchema = z.object(fields);
export const updateActionPlanSchema = z
    .object(fields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
});
export const listActionPlansQuerySchema = z.object({
    areaId: csvArray(z.uuid()),
    areaResponsibleUserId: csvArray(z.uuid()),
    deadlineStatus: csvArray(z.enum(["VIGENTE", "VENCIDO", "REPROGRAMADO"])),
    dueDateFrom: z.coerce.date().optional(),
    dueDateTo: z.coerce.date().optional(),
    observationId: csvArray(z.uuid()),
    overdue: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    progressStatus: csvArray(z.enum(["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"])),
    reportNumber: z.string().trim().max(64).optional(),
    responsibleUserId: csvArray(z.uuid()),
    search: z.string().trim().default(""),
    sortBy: z
        .enum(["currentDueDate", "progressPercent", "updatedAt"])
        .default("currentDueDate"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    status: csvArray(z.enum(["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"])),
});
//# sourceMappingURL=remediation.validators.js.map