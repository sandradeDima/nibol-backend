import { z } from "zod";
export const progressEvaluationIdParamSchema = z.object({ id: z.uuid() });
export const actionPlanIdParamSchema = z.object({ id: z.uuid() });
export const observationIdParamSchema = z.object({ id: z.uuid() });
export const evidenceIdParamSchema = z.object({ id: z.uuid() });
export const commentIdParamSchema = z.object({ id: z.uuid() });
const nullableText = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => value?.trim() || null);
const evaluationFields = {
    actionPlanStatus: z.enum([
        "NOT_STARTED",
        "STARTED",
        "WITH_PROGRESS",
        "CONCLUDED",
    ]),
    comment: z.string().trim().min(1).max(20_000),
    progressPercent: z.coerce.number().int().min(0).max(100),
    type: z.enum(["ADVANCE", "FINALIZATION", "CORRECTION"]).default("ADVANCE"),
};
const consistentEvaluation = (value, context) => {
    if (value.actionPlanStatus === "NOT_STARTED" &&
        (value.progressPercent ?? 0) > 0)
        context.addIssue({
            code: "custom",
            message: "Un plan con avance no puede permanecer como No iniciado.",
        });
    if (value.actionPlanStatus === "CONCLUDED" && value.progressPercent !== 100)
        context.addIssue({
            code: "custom",
            message: "Un plan concluido debe registrar 100% de avance.",
        });
};
export const createProgressEvaluationSchema = z
    .object(evaluationFields)
    .superRefine(consistentEvaluation);
export const updateProgressEvaluationSchema = z
    .object(evaluationFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
})
    .superRefine(consistentEvaluation);
export const reviewProgressEvaluationSchema = z.object({
    comment: nullableText.optional().transform((value) => value ?? null),
});
export const uploadEvidenceSchema = z.object({
    context: z.enum(["FINDING", "ACTION_PLAN", "PROGRESS_EVALUATION", "CLOSURE"]),
    description: nullableText,
});
export const createCommentSchema = z.object({
    actionPlanId: z.uuid().nullable().optional(),
    body: z.string().trim().min(1).max(20_000),
    progressEvaluationId: z.uuid().nullable().optional(),
    visibility: z
        .enum(["INTERNAL_AUDIT", "AREA_VISIBLE", "SYSTEM"])
        .default("AREA_VISIBLE"),
});
export const updateCommentSchema = z
    .object({
    body: z.string().trim().min(1).max(20_000).optional(),
    visibility: z.enum(["INTERNAL_AUDIT", "AREA_VISIBLE", "SYSTEM"]).optional(),
})
    .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
});
export const listProgressEvaluationsQuerySchema = z.object({
    actionPlanId: z.uuid().optional(),
    areaId: z.uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    observationId: z.uuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    reviewStatus: z
        .enum(["DRAFT", "SENT_TO_AUDIT", "APPROVED", "RETURNED", "REJECTED"])
        .optional(),
    search: z.string().trim().default(""),
});
//# sourceMappingURL=progress.validators.js.map