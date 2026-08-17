import { z } from "zod";

export const observationIdParamSchema = z.object({ id: z.uuid() });
export const actionPlanIdParamSchema = z.object({ id: z.uuid() });
export const extensionRequestIdParamSchema = z.object({ id: z.uuid() });

const fields = {
  evidenceFileIds: z.array(z.uuid()).max(20).default([]),
  proposedDueDate: z.coerce.date(),
  reason: z.string().trim().min(3).max(20_000),
};
export const createExtensionRequestSchema = z.object(fields);
export const updateExtensionRequestSchema = z
  .object(fields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });
export const reviewExtensionRequestSchema = z.object({
  comment: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => value?.trim() || null),
});
export const listExtensionRequestsQuerySchema = z.object({
  actionPlanId: z.uuid().optional(),
  observationId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  requestedByUserId: z.uuid().optional(),
  search: z.string().trim().default(""),
  status: z
    .enum([
      "DRAFT",
      "SENT_TO_MANAGER",
      "MANAGER_APPROVED",
      "MANAGER_REJECTED",
      "SENT_TO_AUDIT",
      "AUDIT_APPROVED",
      "AUDIT_REJECTED",
      "CANCELLED",
    ])
    .optional(),
  targetType: z.enum(["OBSERVATION", "ACTION_PLAN"]).optional(),
});

export type CreateExtensionRequestInput = z.infer<
  typeof createExtensionRequestSchema
>;
export type UpdateExtensionRequestInput = z.infer<
  typeof updateExtensionRequestSchema
>;
export type ReviewExtensionRequestInput = z.infer<
  typeof reviewExtensionRequestSchema
>;
export type ListExtensionRequestsQuery = z.infer<
  typeof listExtensionRequestsQuerySchema
>;
