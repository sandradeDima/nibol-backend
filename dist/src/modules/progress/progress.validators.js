import { z } from "zod";
import { commentVisibilityValues, progressUpdateStatusValues, progressUpdateTypeValues, } from "./progress.constants.js";
const booleanFilterSchema = z
    .enum(["false", "true"])
    .transform((value) => value === "true")
    .optional();
const dateFilterSchema = z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional();
const nullableTextSchema = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
});
const nullableUuidSchema = z
    .union([z.uuid(), z.null(), z.undefined()])
    .transform((value) => value ?? null);
const progressPercentSchema = z
    .union([z.coerce.number().int().min(0).max(100), z.null(), z.undefined()])
    .transform((value) => {
    if (value === undefined) {
        return null;
    }
    return value;
});
export const observationIdParamSchema = z.object({
    id: z.uuid(),
});
export const progressUpdateIdParamSchema = z.object({
    id: z.uuid(),
});
export const evidenceIdParamSchema = z.object({
    id: z.uuid(),
});
export const commentIdParamSchema = z.object({
    id: z.uuid(),
});
const progressUpdateMutationSchema = z.object({
    comment: z.string().trim().min(1).max(20_000),
    commitmentId: nullableUuidSchema,
    progressPercent: progressPercentSchema,
    remediationPlanId: nullableUuidSchema,
    type: z.enum(progressUpdateTypeValues),
});
const addFinalizationProgressIssue = (value, context) => {
    if (value.type === "FINALIZATION" && value.progressPercent !== null && value.progressPercent !== undefined && value.progressPercent < 100) {
        context.addIssue({
            code: "custom",
            message: "La finalizacion debe registrar 100% de avance.",
            path: ["progressPercent"],
        });
    }
};
export const createProgressUpdateSchema = progressUpdateMutationSchema.superRefine(addFinalizationProgressIssue);
export const updateProgressUpdateSchema = progressUpdateMutationSchema
    .partial()
    .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
        context.addIssue({
            code: "custom",
            message: "At least one progress field is required.",
        });
    }
    addFinalizationProgressIssue(value, context);
});
export const reviewProgressUpdateSchema = z.object({
    comment: nullableTextSchema,
});
export const uploadObservationEvidenceSchema = z.object({
    description: nullableTextSchema,
});
export const createCommentSchema = z.object({
    body: z.string().trim().min(1).max(20_000),
    progressUpdateId: nullableUuidSchema.optional(),
    visibility: z.enum(commentVisibilityValues).optional(),
});
export const updateCommentSchema = z
    .object({
    body: z.string().trim().min(1).max(20_000).optional(),
    visibility: z.enum(commentVisibilityValues).optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one comment field is required.",
});
export const listProgressUpdatesQuerySchema = z.object({
    areaId: z.uuid().optional(),
    dateFrom: dateFilterSchema,
    dateTo: dateFilterSchema,
    evidencePending: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    responsibleUserId: z.uuid().optional(),
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().default(""),
    sortBy: z
        .enum(["createdAt", "observationCode", "progressPercent", "status", "type"])
        .default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    status: z.enum(progressUpdateStatusValues).optional(),
    type: z.enum(progressUpdateTypeValues).optional(),
});
//# sourceMappingURL=progress.validators.js.map