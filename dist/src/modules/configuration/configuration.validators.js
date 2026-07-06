import { z } from "zod";
import { CONFIGURATION_CATALOG_TYPES } from "./configuration.constants.js";
const booleanFilterSchema = z
    .enum(["false", "true"])
    .transform((value) => value === "true")
    .optional();
const normalizeNullableText = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const nullableTextSchema = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => normalizeNullableText(value));
const nullableUppercaseCodeSchema = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
    const normalized = normalizeNullableText(value);
    return normalized ? normalized.toUpperCase() : null;
})
    .refine((value) => value === null || /^[A-Z0-9_-]+$/.test(value), {
    message: "Use solo letras, números, guiones o guiones bajos.",
});
const uppercaseKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9_]+$/.test(value), {
    message: "Use solo letras mayúsculas, números o guiones bajos.",
});
const nullableUppercaseKeySchema = z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
    const normalized = normalizeNullableText(value);
    return normalized ? normalized.toUpperCase() : null;
})
    .refine((value) => value === null || /^[A-Z0-9_]+$/.test(value), {
    message: "Use solo letras mayúsculas, números o guiones bajos.",
});
const keySlugSchema = z
    .string()
    .trim()
    .min(1)
    .max(191)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9_]+$/.test(value), {
    message: "Use solo minúsculas, números o guiones bajos.",
});
const groupSlugSchema = z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9_]+$/.test(value), {
    message: "Use solo minúsculas, números o guiones bajos.",
});
const valueTypeSchema = z.enum(["string", "number", "boolean", "json", "date"]);
const catalogTypeSchema = z.enum(CONFIGURATION_CATALOG_TYPES);
export const recordIdParamSchema = z.object({
    id: z.uuid(),
});
export const listAreasQuerySchema = z.object({
    active: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z.enum(["code", "createdAt", "name", "updatedAt"]).default("name"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
});
export const areaMutationSchema = z.object({
    active: z.boolean().default(true),
    code: nullableUppercaseCodeSchema,
    description: nullableTextSchema.refine((value) => value === null || value.length <= 500, {
        message: "La descripción es demasiado extensa.",
    }),
    managerUserId: z.union([z.uuid(), z.null()]).default(null),
    name: z.string().trim().min(2).max(191),
});
export const listRiskLevelsQuerySchema = z.object({
    active: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z
        .enum([
        "createdAt",
        "defaultDeadlineDays",
        "key",
        "name",
        "severityOrder",
        "updatedAt",
    ])
        .default("severityOrder"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
});
export const riskLevelMutationSchema = z.object({
    active: z.boolean().default(true),
    colorToken: nullableTextSchema.refine((value) => value === null || value.length <= 64, {
        message: "El token de color es demasiado largo.",
    }),
    defaultDeadlineDays: z.coerce.number().int().min(1).max(3650).nullable(),
    description: nullableTextSchema.refine((value) => value === null || value.length <= 500, {
        message: "La descripción es demasiado extensa.",
    }),
    key: uppercaseKeySchema,
    name: z.string().trim().min(2).max(100),
    severityOrder: z.coerce.number().int().min(1).max(999),
});
export const listObservationStatusesQuerySchema = z.object({
    active: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z.enum(["createdAt", "key", "name", "sortOrder", "updatedAt"]).default("sortOrder"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
});
export const observationStatusMutationSchema = z
    .object({
    active: z.boolean().default(true),
    countsAsOverdue: z.boolean().default(false),
    description: nullableTextSchema.refine((value) => value === null || value.length <= 500, {
        message: "La descripción es demasiado extensa.",
    }),
    isFinal: z.boolean().default(false),
    isInitial: z.boolean().default(false),
    key: uppercaseKeySchema,
    name: z.string().trim().min(2).max(100),
    sortOrder: z.coerce.number().int().min(0).max(999),
})
    .refine((value) => !(value.isInitial && value.isFinal), {
    message: "Un estado no puede ser inicial y final al mismo tiempo.",
    path: ["isFinal"],
});
export const listSystemParametersQuerySchema = z.object({
    active: booleanFilterSchema,
    group: groupSlugSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z
        .enum(["createdAt", "group", "key", "name", "updatedAt", "valueType"])
        .default("group"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    valueType: valueTypeSchema.optional(),
});
export const systemParameterMutationSchema = z.object({
    active: z.boolean().default(true),
    description: nullableTextSchema.refine((value) => value === null || value.length <= 500, {
        message: "La descripción es demasiado extensa.",
    }),
    editable: z.boolean().default(true),
    group: groupSlugSchema,
    key: keySlugSchema,
    name: z.string().trim().min(2).max(191),
    value: z.string().trim().min(1).max(10_000),
    valueType: valueTypeSchema,
});
export const listCatalogsQuerySchema = z.object({
    active: booleanFilterSchema,
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z.enum(["createdAt", "key", "name", "sortOrder", "type", "updatedAt"]).default("type"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    type: catalogTypeSchema.optional(),
});
export const catalogMutationSchema = z.object({
    active: z.boolean().default(true),
    description: nullableTextSchema.refine((value) => value === null || value.length <= 500, {
        message: "La descripción es demasiado extensa.",
    }),
    key: nullableUppercaseKeySchema,
    name: z.string().trim().min(2).max(191),
    sortOrder: z.coerce.number().int().min(0).max(999),
    type: catalogTypeSchema,
});
export const bootstrapCatalogTypeSchema = catalogTypeSchema;
//# sourceMappingURL=configuration.validators.js.map