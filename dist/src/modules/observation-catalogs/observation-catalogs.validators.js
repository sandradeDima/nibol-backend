import { z } from "zod";
const fields = {
    description: z
        .union([z.string(), z.null(), z.undefined()])
        .transform((value) => value?.trim() || null),
    isActive: z.boolean().default(true),
    name: z.string().trim().min(2).max(191),
};
export const createObservationCatalogSchema = z.object(fields);
export const updateObservationCatalogSchema = z
    .object(fields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
});
export const observationCatalogIdSchema = z.object({ id: z.uuid() });
export const listObservationCatalogSchema = z.object({
    active: z
        .enum(["false", "true"])
        .transform((value) => value === "true")
        .optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().default(""),
});
//# sourceMappingURL=observation-catalogs.validators.js.map