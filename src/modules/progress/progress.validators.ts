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
  comment: z.string().trim().min(1).max(20_000),
  reportedProgressPercent: z.coerce.number().int().min(0).max(100),
  type: z.enum(["ADVANCE", "FINALIZATION"]).default("ADVANCE"),
};
export const createProgressEvaluationSchema = z.object(evaluationFields);
export const updateProgressEvaluationSchema = z
  .object(evaluationFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe modificar al menos un campo.",
  });
export const reviewProgressEvaluationSchema = z.object({
  comment: nullableText.optional().transform((value) => value ?? null),
  officialStatus: z.enum([
    "NOT_STARTED",
    "STARTED",
    "WITH_PROGRESS",
    "CONCLUDED",
  ]),
});
export const reviewEvidenceSchema = z.object({
  comment: nullableText.optional().transform((value) => value ?? null),
});
export const uploadEvidenceSchema = z.object({
  context: z.enum(["FINDING", "ACTION_PLAN", "PROGRESS_EVALUATION", "CLOSURE"]),
  description: nullableText,
  observationAreaId: z.uuid().optional(),
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
  responsibleUserId: z.uuid().optional(),
  reviewStatus: z
    .enum(["DRAFT", "SENT_TO_AUDIT", "APPROVED", "RETURNED"])
    .optional(),
  reviewQueue: z.coerce.boolean().default(false),
  search: z.string().trim().default(""),
});

export type CreateProgressEvaluationInput = z.infer<
  typeof createProgressEvaluationSchema
>;
export type UpdateProgressEvaluationInput = z.infer<
  typeof updateProgressEvaluationSchema
>;
export type ReviewProgressEvaluationInput = z.infer<
  typeof reviewProgressEvaluationSchema
>;
export type ReviewEvidenceInput = z.infer<typeof reviewEvidenceSchema>;
export type UploadEvidenceInput = z.infer<typeof uploadEvidenceSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type ListProgressEvaluationsQuery = z.infer<
  typeof listProgressEvaluationsQuerySchema
>;
