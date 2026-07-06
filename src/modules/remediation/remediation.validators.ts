import { z } from "zod";

import {
  commitmentStatusValues,
  remediationPlanStatusValues,
} from "./remediation.constants.js";

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

export const observationRemediationParamsSchema = z.object({
  id: z.uuid(),
});

export const observationRemediationQuerySchema = z.object({
  areaId: z.uuid().optional(),
});

export const remediationPlanIdParamSchema = z.object({
  id: z.uuid(),
});

export const commitmentIdParamSchema = z.object({
  id: z.uuid(),
});

export const remediationPlanMutationSchema = z.object({
  additionalComments: nullableTextSchema,
  areaId: z.uuid(),
  mitigationText: nullableTextSchema,
  ownerUserId: nullableUuidSchema,
  strategyText: z.string().trim().min(1).max(20_000),
});

export const remediationPlanUpdateSchema = remediationPlanMutationSchema
  .omit({
    areaId: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one remediation field is required.",
  });

export const remediationPlanReturnSchema = z.object({
  reason: z.string().trim().min(3).max(5_000),
});

export const createCommitmentSchema = z.object({
  description: nullableTextSchema,
  dueDate: z.coerce.date(),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  responsibleUserId: nullableUuidSchema,
  sortOrder: z.coerce.number().int().min(0).optional(),
  status: z.enum(commitmentStatusValues).optional(),
  title: z.string().trim().min(1).max(191),
});

export const updateCommitmentSchema = createCommitmentSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one commitment field is required.",
  });

export const listRemediationPlansQuerySchema = z.object({
  areaId: z.uuid().optional(),
  overdue: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  responsibleUserId: z.uuid().optional(),
  riskLevelId: z.uuid().optional(),
  search: z.string().trim().default(""),
  sortBy: z
    .enum(["areaName", "observationCode", "status", "updatedAt"])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(remediationPlanStatusValues).optional(),
});

export const listCommitmentsQuerySchema = z.object({
  areaId: z.uuid().optional(),
  dueDateFrom: dateFilterSchema,
  dueDateTo: dateFilterSchema,
  overdue: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  responsibleUserId: z.uuid().optional(),
  search: z.string().trim().default(""),
  sortBy: z
    .enum(["dueDate", "progressPercent", "title", "updatedAt"])
    .default("dueDate"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  status: z.enum(commitmentStatusValues).optional(),
});

export type ObservationRemediationQuery = z.infer<
  typeof observationRemediationQuerySchema
>;
export type RemediationPlanMutationInput = z.infer<
  typeof remediationPlanMutationSchema
>;
export type RemediationPlanUpdateInput = z.infer<
  typeof remediationPlanUpdateSchema
>;
export type RemediationPlanReturnInput = z.infer<
  typeof remediationPlanReturnSchema
>;
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;
export type UpdateCommitmentInput = z.infer<typeof updateCommitmentSchema>;
export type ListRemediationPlansQuery = z.infer<
  typeof listRemediationPlansQuerySchema
>;
export type ListCommitmentsQuery = z.infer<
  typeof listCommitmentsQuerySchema
>;

