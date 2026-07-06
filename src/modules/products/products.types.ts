import type { z } from "zod";

import type { productRecordSchema } from "./products.schema.js";
import type {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "./products.validators.js";

export type ProductRecord = z.infer<
  typeof productRecordSchema
>;

export type CreateProductInput = z.infer<
  typeof createProductSchema
>;

export type UpdateProductInput = z.infer<
  typeof updateProductSchema
>;

export type ListProductsQuery = z.infer<
  typeof listProductsQuerySchema
>;
