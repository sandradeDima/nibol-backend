import { z } from "zod";
export const actionPlanIdParamSchema = z.object({ id: z.uuid() });
export const observationActionPlanParamsSchema = z.object({ id: z.uuid() });
const fields = {
    description: z.string().trim().min(1).max(10_000),
    dueDate: z.coerce.date(),
    observationAreaId: z.uuid(),
    responsibleUserId: z.uuid(),
    sortOrder: z.coerce.number().int().min(0).optional(),
    title: z.string().trim().min(2).max(191),
};
export const createActionPlanSchema = z.object(fields);
export const updateActionPlanSchema = z
    .object(fields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
});
export const listActionPlansQuerySchema = z.object({
    areaId: z.uuid().optional(),
    dueDateFrom: z.coerce.date().optional(),
    dueDateTo: z.coerce.date().optional(),
    observationId: z.uuid().optional(),
    overdue: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    responsibleUserId: z.uuid().optional(),
    search: z.string().trim().default(""),
    sortBy: z
        .enum(["currentDueDate", "progressPercent", "title", "updatedAt"])
        .default("currentDueDate"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    status: z
        .enum(["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"])
        .optional(),
});
//# sourceMappingURL=remediation.validators.js.map