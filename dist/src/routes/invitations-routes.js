import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.js";
import { requirePermission, } from "../middleware/authorization-middleware.js";
import { invitationsService } from "../services/invitations-service.js";
import { AppError } from "../utils/app-error.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import { createInvitationSchema, invitationAcceptanceRequestSchema, invitationIdParamSchema, listInvitationsQuerySchema, } from "../validators/invitations-validator.js";
import { getRequestLogActorContext } from "../utils/request-context.js";
const getQueryValue = (value) => {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const firstValue = value[0];
        if (typeof firstValue === "string") {
            return firstValue;
        }
    }
    return undefined;
};
const getRequiredInvitationId = (value) => {
    const invitationId = Array.isArray(value) ? value[0] : value;
    if (!invitationId) {
        throw new AppError("Invitation id is required.", 400);
    }
    return invitationIdParamSchema.parse({
        id: invitationId,
    }).id;
};
const getAuthenticatedUserId = (request) => {
    const userId = request.authSession?.user.id;
    if (!userId) {
        throw new AppError("Authentication required.", 401);
    }
    return userId;
};
export const invitationsRouter = Router();
invitationsRouter.get("/invitations", requirePermission("invitations.view"), asyncHandler(async (request, response) => {
    const query = listInvitationsQuerySchema.parse({
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        status: getQueryValue(request.query["filter.status"]),
    });
    const result = await invitationsService.listInvitations(query);
    sendPaginated(response, result.data, result.pagination);
}));
invitationsRouter.get("/invitations/:id", requirePermission("invitations.view"), asyncHandler(async (request, response) => {
    const invitation = await invitationsService.getInvitationById(getRequiredInvitationId(request.params.id));
    sendSuccess(response, invitation);
}));
invitationsRouter.post("/invitations", requirePermission("invitations.create"), asyncHandler(async (request, response) => {
    const payload = createInvitationSchema.parse(request.body);
    const invitation = await invitationsService.createInvitation(payload, getAuthenticatedUserId(request), getRequestLogActorContext(request));
    sendSuccess(response, invitation, 201);
}));
invitationsRouter.post("/invitations/:id/resend", requirePermission("invitations.edit"), asyncHandler(async (request, response) => {
    const invitation = await invitationsService.resendInvitation(getRequiredInvitationId(request.params.id), getRequestLogActorContext(request));
    sendSuccess(response, invitation);
}));
invitationsRouter.post("/invitations/:id/revoke", requirePermission("invitations.delete"), asyncHandler(async (request, response) => {
    const invitation = await invitationsService.revokeInvitation(getRequiredInvitationId(request.params.id), getRequestLogActorContext(request));
    sendSuccess(response, invitation);
}));
invitationsRouter.post("/invitations/accept", asyncHandler(async (request, response) => {
    const payload = invitationAcceptanceRequestSchema.parse(request.body);
    if (payload.mode === "preview") {
        const preview = await invitationsService.getInvitationAcceptancePreview(payload.token);
        sendSuccess(response, preview);
        return;
    }
    const acceptedInvitation = await invitationsService.acceptInvitation(payload, getRequestLogActorContext(request));
    sendSuccess(response, acceptedInvitation);
}));
//# sourceMappingURL=invitations-routes.js.map