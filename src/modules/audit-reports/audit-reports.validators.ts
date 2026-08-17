import { z } from "zod";

const fields = {
  reportDate: z.coerce.date(),
  reportNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[A-Za-z0-9-]+$/,
      "Report number must be alphanumeric and may contain hyphens.",
    ),
  title: z.string().trim().min(3).max(191),
};

export const createAuditReportSchema = z.object(fields);
export const updateAuditReportSchema = z
  .object(fields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });
export const auditReportIdParamSchema = z.object({ id: z.uuid() });
export const listAuditReportsQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().default(""),
});
