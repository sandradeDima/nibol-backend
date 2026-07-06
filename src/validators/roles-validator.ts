import { z } from "zod";

const roleSortFields = ["createdAt", "name"] as const;

const permissionNamesSchema = z
  .array(z.string().trim().min(1))
  .max(200)
  .transform((value) => Array.from(new Set(value)));

const roleDescriptionSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
  })
  .refine((value) => value === null || value.length <= 255, {
    message: "Description must be 255 characters or fewer.",
  });

export const roleIdParamSchema = z.object({
  id: z.uuid(),
});

export const listRolesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  sortBy: z.enum(roleSortFields).default("name"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const createRoleSchema = z.object({
  description: roleDescriptionSchema,
  name: z.string().trim().min(2).max(191),
  permissionNames: permissionNamesSchema.default([]),
});

export const updateRoleSchema = createRoleSchema;

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
