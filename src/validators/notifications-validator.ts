import { z } from "zod";

const notificationTypeValues = [
  "info",
  "success",
  "warning",
  "error",
] as const;

const booleanQuerySchema = z.enum(["true", "false"]).transform((value) => {
  return value === "true";
});

export const notificationIdParamSchema = z.object({
  id: z.uuid(),
});

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  type: z.enum(notificationTypeValues).optional(),
  unreadOnly: booleanQuerySchema.optional(),
});

export const createNotificationSchema = z.object({
  message: z.string().trim().min(1).max(10_000),
  title: z.string().trim().min(1).max(191),
  type: z.enum(notificationTypeValues).default("info"),
  userId: z.uuid(),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type NotificationType = (typeof notificationTypeValues)[number];
