import { z } from "zod";

export const productRecordSchema = z.object({
  createdAt: z.string().min(1),
  description: z.string().nullable(),
  id: z.uuid(),
  isActive: z.boolean(),
  name: z.string().trim().min(1),
  updatedAt: z.string().min(1),
});

export const productMutationSchema = z.object({
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean().default(true),
  name: z.string().trim().min(2).max(191),
});
