import { z } from "zod";
import { EXTENSION_REQUEST_STATUS_VALUES } from "./extension-requests.constants.js";
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
const evidenceFileIdsSchema = z
    .array(z.uuid())
    .max(20)
    .transform((value) => Array.from(new Set(value)));
const extensionRequestMutationFields = {
    evidenceFileIds: evidenceFileIdsSchema.optional(),
    reason: z.string().trim().min(1).max(20_000),
    requestedDueDate: z.coerce.date(),
};
const extensionRequestMutationSchema = z.object(extensionRequestMutationFields);
export const observationIdParamSchema = z.object({
    id: z.uuid(),
});
export const commitmentIdParamSchema = z.object({
    id: z.uuid(),
});
export const extensionRequestIdParamSchema = z.object({
    id: z.uuid(),
});
export const createExtensionRequestSchema = extensionRequestMutationSchema;
export const updateExtensionRequestSchema = extensionRequestMutationSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required to update the extension request.",
});
export const reviewExtensionRequestSchema = z.object({
    comment: nullableTextSchema,
});
export const listExtensionRequestsQuerySchema = z.object({
    areaId: z.uuid().optional(),
    observationId: z.uuid().optional(),
    overdue: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    pendingMine: booleanFilterSchema,
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    requestedByUserId: z.uuid().optional(),
    requestedDateFrom: dateFilterSchema,
    requestedDateTo: dateFilterSchema,
    riskLevelId: z.uuid().optional(),
    search: z.string().trim().default(""),
    sortBy: z
        .enum([
        "currentDueDate",
        "observationCode",
        "requestedDueDate",
        "status",
        "updatedAt",
    ])
        .default("updatedAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    status: z.enum(EXTENSION_REQUEST_STATUS_VALUES).optional(),
});
//# sourceMappingURL=extension-requests.validators.js.map