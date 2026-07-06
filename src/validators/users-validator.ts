import { z } from "zod";

const userSortFields = [
  "createdAt",
  "email",
  "emailVerified",
  "isActive",
  "lastLoginAt",
  "name",
] as const;

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long.");

const booleanFilterSchema = z
  .enum(["false", "true"])
  .transform((value) => value === "true")
  .optional();

const csvStringArraySchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )
  .optional()
  .default([]);

const roleIdsSchema = z.array(z.uuid()).min(1, "Select at least one role.");

export const userIdParamSchema = z.object({
  id: z.uuid(),
});

export const listUsersQuerySchema = z.object({
  emailVerified: booleanFilterSchema,
  isActive: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  roles: csvStringArraySchema,
  search: z.string().trim().default(""),
  sortBy: z.enum(userSortFields).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const createUserSchema = z.object({
  email: z.email(),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(2).max(191),
  password: passwordSchema,
  roleIds: roleIdsSchema,
});

export const updateUserSchema = z.object({
  email: z.email(),
  isActive: z.boolean(),
  name: z.string().trim().min(2).max(191),
  roleIds: roleIdsSchema,
});

export const bulkDeleteUsersSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(191),
});

export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});

export const avatarUploadSchema = z.object({
  mimetype: z.enum(["image/jpeg", "image/png", "image/webp"]),
  originalName: z.string().min(1),
  size: z.number().int().positive().max(5 * 1024 * 1024),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
