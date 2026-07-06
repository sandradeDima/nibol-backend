import { z } from "zod";

const activityLogSortFields = [
  "action",
  "createdAt",
  "entityId",
  "entityType",
  "ipAddress",
] as const;

export const listActivityLogsQuerySchema = z.object({
  action: z.string().trim().min(1).max(191).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  entityType: z.string().trim().min(1).max(191).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  sortBy: z.enum(activityLogSortFields).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  userId: z.uuid().optional(),
});

export type ListActivityLogsQuery = z.infer<typeof listActivityLogsQuerySchema>;
