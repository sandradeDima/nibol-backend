import { z } from "zod";
const invitationSortFields = [
    "acceptedAt",
    "createdAt",
    "email",
    "expiresAt",
];
const invitationStatusValues = [
    "accepted",
    "expired",
    "pending",
    "revoked",
];
const tokenSchema = z.string().trim().min(32).max(191);
export const invitationIdParamSchema = z.object({
    id: z.uuid(),
});
export const listInvitationsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(""),
    sortBy: z.enum(invitationSortFields).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    status: z.enum(invitationStatusValues).optional(),
});
export const createInvitationSchema = z.object({
    email: z.email(),
    roleId: z.uuid(),
});
export const previewInvitationAcceptanceSchema = z.object({
    mode: z.literal("preview"),
    token: tokenSchema,
});
export const acceptInvitationSchema = z.object({
    mode: z.literal("accept"),
    name: z.string().trim().min(2).max(191),
    password: z.string().min(8).max(255),
    token: tokenSchema,
});
export const invitationAcceptanceRequestSchema = z.discriminatedUnion("mode", [
    previewInvitationAcceptanceSchema,
    acceptInvitationSchema,
]);
//# sourceMappingURL=invitations-validator.js.map