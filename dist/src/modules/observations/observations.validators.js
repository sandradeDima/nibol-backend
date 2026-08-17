import { z } from "zod";
const nullableText = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
});
const uniqueIds = (values) => new Set(values).size === values.length;
export const observationAreaInputSchema = z.object({
    areaId: z.uuid(),
    areaResponsibleUserId: z.uuid(),
    processOwnerUserId: z.uuid(),
});
const mutationFields = {
    areaAssignments: z
        .array(observationAreaInputSchema)
        .min(1, "At least one involved area is required.")
        .max(30)
        .refine((rows) => uniqueIds(rows.map((row) => row.areaId)), {
        message: "An area can only be assigned once.",
    }),
    auditRecommendation: z.string().trim().min(1).max(5_000),
    auditReportId: z.uuid(),
    auditorUserId: z.uuid(),
    category: nullableText,
    currentStage: nullableText,
    description: z.string().trim().min(1).max(10_000),
    mainObservationId: z.uuid(),
    observationNumber: z.coerce.number().int().positive().max(999_999),
    process: nullableText,
    riskIds: z
        .array(z.uuid())
        .min(1, "At least one associated risk is required.")
        .max(30)
        .refine(uniqueIds, { message: "A risk can only be selected once." }),
    riskLevelId: z.uuid(),
    source: nullableText,
    title: z.string().trim().min(3).max(191),
};
export const createObservationSchema = z.object(mutationFields);
export const updateObservationSchema = z
    .object(mutationFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
});
export const observationIdParamSchema = z.object({ id: z.uuid() });
export const listObservationsQuerySchema = z.object({
    actionPlanResponsibleUserId: z.uuid().optional(),
    areaId: z.uuid().optional(),
    areaResponsibleUserId: z.uuid().optional(),
    auditReportId: z.uuid().optional(),
    currentDueDateFrom: z.coerce.date().optional(),
    currentDueDateTo: z.coerce.date().optional(),
    mainObservationId: z.uuid().optional(),
    observationStatus: z
        .enum(["NO_INICIADO", "INICIADO", "CON_AVANCE", "CONCLUIDO"])
        .optional(),
    overdue: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
    processOwnerUserId: z.uuid().optional(),
    riskId: z.uuid().optional(),
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().default(""),
    sortBy: z
        .enum([
        "currentDueDate",
        "observationNumber",
        "reportDate",
        "title",
        "updatedAt",
    ])
        .default("updatedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
});
//# sourceMappingURL=observations.validators.js.map