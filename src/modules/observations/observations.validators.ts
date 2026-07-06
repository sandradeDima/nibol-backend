import { z } from "zod";

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

const additionalAreaIdsSchema = z
  .array(z.uuid())
  .max(20)
  .transform((values) => Array.from(new Set(values)));

const observationMutationFields = {
  additionalAreaIds: additionalAreaIdsSchema.optional(),
  areaId: z.uuid(),
  auditRecommendation: z.string().trim().min(1).max(5000),
  category: nullableTextSchema,
  code: z.string().trim().min(3).max(64),
  currentStage: nullableTextSchema,
  description: z.string().trim().min(1).max(10_000),
  detectedAt: z.coerce.date(),
  dueDate: z.coerce.date(),
  observationType: nullableTextSchema,
  process: nullableTextSchema,
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
  responsibleUserId: z.union([z.uuid(), z.null()]).optional(),
  riskLevelId: z.uuid(),
  source: nullableTextSchema,
  statusId: z.uuid(),
  title: z.string().trim().min(3).max(191),
} satisfies Record<string, z.ZodType>;

const observationMutationSchema = z.object(observationMutationFields);

export const observationIdParamSchema = z.object({
  id: z.uuid(),
});

export const listObservationsQuerySchema = z.object({
  areaId: z.uuid().optional(),
  dueDateFrom: dateFilterSchema,
  dueDateTo: dateFilterSchema,
  overdue: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  responsibleUserId: z.uuid().optional(),
  riskLevelId: z.uuid().optional(),
  search: z.string().trim().default(""),
  sortBy: z
    .enum(["code", "detectedAt", "dueDate", "progressPercent", "title", "updatedAt"])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  statusId: z.uuid().optional(),
});

export const createObservationSchema = observationMutationSchema;

export const updateObservationSchema = observationMutationSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required to update an observation.",
  });
