import { z } from "zod";

import { productMutationSchema } from "./products.schema.js";

const booleanFilterSchema = z
  .enum(["false", "true"])
  .transform((value) => value === "true")
  .optional();

export const productIdParamSchema = z.object({
  id: z.uuid(),
});

export const listProductsQuerySchema = z.object({
  isActive: booleanFilterSchema,
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  sortBy: z.enum(["createdAt", "name", "updatedAt"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const createProductSchema = productMutationSchema;

export const updateProductSchema = productMutationSchema;
