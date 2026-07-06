import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { emailService } from "../emails/EmailService.js";
import { env } from "../utils/env.js";
import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../utils/prisma.js";
import { activityLogService } from "./activity-log-service.js";
import { auditLogService } from "./audit-log-service.js";
import { notificationService } from "./notification-service.js";
const DEFAULT_EXPIRATION_DAYS = 7;
const TOKEN_BYTE_LENGTH = 32;
const credentialProviderId = "credential";
const buildOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "acceptedAt":
            return {
                acceptedAt: sortDirection,
            };
        case "createdAt":
            return {
                createdAt: sortDirection,
            };
        case "email":
            return {
                email: sortDirection,
            };
        case "expiresAt":
            return {
                expiresAt: sortDirection,
            };
    }
};
const getExpiresAt = () => {
    return new Date(Date.now() + DEFAULT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000);
};
const generateSecureToken = () => {
    return randomBytes(TOKEN_BYTE_LENGTH).toString("hex");
};
const getInvitationStatus = (invitation) => {
    if (invitation.acceptedAt) {
        return "Accepted";
    }
    if (invitation.deletedAt) {
        return "Revoked";
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
        return "Expired";
    }
    return "Pending";
};
const formatDateTime = (value) => {
    return new Intl.DateTimeFormat("es-BO", {
        dateStyle: "long",
        timeStyle: "short",
    }).format(value);
};
const buildInvitationLink = (token) => {
    const url = new URL("/accept-invitation", env.FRONTEND_URL);
    url.searchParams.set("token", token);
    return url.toString();
};
const buildInvitationWhereClause = (query) => {
    const now = new Date();
    return {
        ...(query.search.length > 0
            ? {
                OR: [
                    {
                        email: {
                            contains: query.search,
                        },
                    },
                    {
                        createdBy: {
                            name: {
                                contains: query.search,
                            },
                        },
                    },
                    {
                        role: {
                            name: {
                                contains: query.search,
                            },
                        },
                    },
                ],
            }
            : {}),
        ...(query.status === "accepted"
            ? {
                acceptedAt: {
                    not: null,
                },
            }
            : {}),
        ...(query.status === "expired"
            ? {
                acceptedAt: null,
                deletedAt: null,
                expiresAt: {
                    lte: now,
                },
            }
            : {}),
        ...(query.status === "pending"
            ? {
                acceptedAt: null,
                deletedAt: null,
                expiresAt: {
                    gt: now,
                },
            }
            : {}),
        ...(query.status === "revoked"
            ? {
                acceptedAt: null,
                deletedAt: {
                    not: null,
                },
            }
            : {}),
    };
};
const assertRoleExists = async (roleId) => {
    const role = await prisma.role.findFirst({
        select: {
            id: true,
        },
        where: {
            deletedAt: null,
            id: roleId,
        },
    });
    if (!role) {
        throw new AppError("The selected role is invalid.", 400);
    }
};
const assertEmailAvailableForInvitation = async (email) => {
    const existingUser = await prisma.user.findFirst({
        select: {
            id: true,
        },
        where: {
            email,
        },
    });
    if (existingUser) {
        throw new AppError("A user with this email already exists.", 400);
    }
};
const assertNoActiveInvitationForEmail = async (email) => {
    const existingInvitation = await prisma.invitation.findFirst({
        select: {
            id: true,
        },
        where: {
            acceptedAt: null,
            deletedAt: null,
            email,
            expiresAt: {
                gt: new Date(),
            },
        },
    });
    if (existingInvitation) {
        throw new AppError("An active invitation already exists for this email address.", 400);
    }
};
const getInvitationRecordById = async (invitationId) => {
    return prisma.invitation.findFirst({
        select: {
            acceptedAt: true,
            createdAt: true,
            createdBy: {
                select: {
                    id: true,
                    name: true,
                },
            },
            deletedAt: true,
            email: true,
            expiresAt: true,
            id: true,
            role: {
                select: {
                    description: true,
                    id: true,
                    name: true,
                },
            },
        },
        where: {
            id: invitationId,
        },
    });
};
const mapInvitationRecord = (invitation) => {
    return {
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        createdAt: invitation.createdAt.toISOString(),
        createdBy: {
            id: invitation.createdBy.id,
            name: invitation.createdBy.name,
        },
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        role: {
            description: invitation.role.description,
            id: invitation.role.id,
            name: invitation.role.name,
        },
        status: getInvitationStatus(invitation),
    };
};
const sendInvitationEmail = async (invitation, invitedByName) => {
    const result = await emailService.sendTemplate({
        template: "invitation",
        to: invitation.email,
        variables: {
            expiresAt: formatDateTime(invitation.expiresAt),
            invitationLink: buildInvitationLink(invitation.token),
            invitedByName,
            roleName: invitation.roleName,
            userName: "",
        },
    });
    if (!result.success) {
        throw new AppError("The invitation email could not be sent.", 502);
    }
};
const getInvitationForToken = async (token) => {
    return prisma.invitation.findUnique({
        select: {
            acceptedAt: true,
            createdBy: {
                select: {
                    id: true,
                    name: true,
                },
            },
            deletedAt: true,
            email: true,
            expiresAt: true,
            id: true,
            role: {
                select: {
                    deletedAt: true,
                    id: true,
                    name: true,
                },
            },
        },
        where: {
            token,
        },
    });
};
const getValidInvitationForAcceptance = async (token) => {
    const invitation = await getInvitationForToken(token);
    if (!invitation) {
        throw new AppError("This invitation is invalid or no longer available.", 400);
    }
    if (invitation.deletedAt) {
        throw new AppError("This invitation has been revoked.", 400);
    }
    if (invitation.acceptedAt) {
        throw new AppError("This invitation has already been accepted.", 400);
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
        throw new AppError("This invitation has expired.", 400);
    }
    if (invitation.role.deletedAt) {
        throw new AppError("The assigned role is no longer available.", 400);
    }
    return invitation;
};
const getInvitationAuditSnapshot = async (db, invitationId) => {
    const invitation = await db.invitation.findFirst({
        select: {
            acceptedAt: true,
            createdById: true,
            deletedAt: true,
            email: true,
            expiresAt: true,
            id: true,
            role: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        where: {
            id: invitationId,
        },
    });
    if (!invitation) {
        return null;
    }
    return {
        acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
        createdById: invitation.createdById,
        deletedAt: invitation.deletedAt?.toISOString() ?? null,
        email: invitation.email,
        expiresAt: invitation.expiresAt.toISOString(),
        id: invitation.id,
        roleId: invitation.role.id,
        roleName: invitation.role.name,
        status: getInvitationStatus(invitation),
    };
};
const getCreatedUserSnapshot = async (db, userId) => {
    return db.user.findFirst({
        select: {
            email: true,
            id: true,
            isActive: true,
            name: true,
            userRoles: {
                orderBy: {
                    role: {
                        name: "asc",
                    },
                },
                select: {
                    role: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            },
        },
        where: {
            id: userId,
        },
    });
};
export const invitationsService = {
    async acceptInvitation(input, context) {
        const invitation = await getValidInvitationForAcceptance(input.token);
        await assertEmailAvailableForInvitation(invitation.email);
        const passwordHash = await bcrypt.hash(input.password, 12);
        const acceptedAt = new Date();
        await prisma.$transaction(async (transaction) => {
            const previousInvitationSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            const user = await transaction.user.create({
                data: {
                    email: invitation.email,
                    emailVerified: true,
                    isActive: true,
                    name: input.name,
                    password: passwordHash,
                },
                select: {
                    id: true,
                },
            });
            await transaction.account.create({
                data: {
                    accountId: invitation.email,
                    password: passwordHash,
                    providerId: credentialProviderId,
                    userId: user.id,
                },
            });
            await transaction.userRole.create({
                data: {
                    roleId: invitation.role.id,
                    userId: user.id,
                },
            });
            await transaction.invitation.update({
                data: {
                    acceptedAt,
                    token: generateSecureToken(),
                },
                where: {
                    id: invitation.id,
                },
            });
            const createdUser = await getCreatedUserSnapshot(transaction, user.id);
            const nextInvitationSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            if (createdUser) {
                const roleNames = createdUser.userRoles.map(({ role }) => role.name);
                await auditLogService.create({
                    ...context,
                    entityId: createdUser.id,
                    entityType: "user",
                    newValues: {
                        email: createdUser.email,
                        id: createdUser.id,
                        isActive: createdUser.isActive,
                        name: createdUser.name,
                        roleIds: createdUser.userRoles.map(({ role }) => role.id),
                        roleNames,
                    },
                    oldValues: null,
                }, {
                    db: transaction,
                });
                await activityLogService.logSystemEvent({
                    action: "User created",
                    entityId: createdUser.id,
                    entityType: "user",
                    ipAddress: context?.ipAddress ?? null,
                    metadata: {
                        email: createdUser.email,
                        summary: `${createdUser.name} joined through an invitation.`,
                    },
                }, {
                    db: transaction,
                });
                if (roleNames.length > 0) {
                    await activityLogService.logSystemEvent({
                        action: "Role assigned",
                        entityId: createdUser.id,
                        entityType: "user",
                        ipAddress: context?.ipAddress ?? null,
                        metadata: {
                            roles: roleNames,
                            summary: `Assigned ${roleNames.join(", ")} to ${createdUser.name}.`,
                        },
                    }, {
                        db: transaction,
                    });
                }
            }
            if (previousInvitationSnapshot && nextInvitationSnapshot) {
                await auditLogService.create({
                    ...context,
                    entityId: invitation.id,
                    entityType: "invitation",
                    newValues: nextInvitationSnapshot,
                    oldValues: previousInvitationSnapshot,
                }, {
                    db: transaction,
                });
                await activityLogService.logSystemEvent({
                    action: "Invitation accepted",
                    entityId: invitation.id,
                    entityType: "invitation",
                    ipAddress: context?.ipAddress ?? null,
                    metadata: {
                        email: nextInvitationSnapshot.email,
                        roleName: nextInvitationSnapshot.roleName,
                        summary: `${nextInvitationSnapshot.email} accepted an invitation.`,
                    },
                }, {
                    db: transaction,
                });
                await notificationService.create({
                    message: `${nextInvitationSnapshot.email} accepted the ${nextInvitationSnapshot.roleName} invitation.`,
                    title: "Invitation accepted",
                    type: "success",
                    userId: invitation.createdBy.id,
                }, {
                    db: transaction,
                });
            }
        });
        void emailService.sendTemplate({
            template: "welcome",
            to: invitation.email,
            variables: {
                loginLink: `${env.FRONTEND_URL}/login`,
                userName: input.name,
            },
        });
        return {
            acceptedAt: acceptedAt.toISOString(),
            email: invitation.email,
            roleName: invitation.role.name,
        };
    },
    async createInvitation(input, createdById, context) {
        await assertRoleExists(input.roleId);
        await assertEmailAvailableForInvitation(input.email);
        await assertNoActiveInvitationForEmail(input.email);
        const token = generateSecureToken();
        const expiresAt = getExpiresAt();
        const invitation = await prisma.$transaction(async (transaction) => {
            const createdInvitation = await transaction.invitation.create({
                data: {
                    createdById,
                    email: input.email,
                    expiresAt,
                    roleId: input.roleId,
                    token,
                },
                select: {
                    id: true,
                },
            });
            const createdSnapshot = await getInvitationAuditSnapshot(transaction, createdInvitation.id);
            if (createdSnapshot) {
                await auditLogService.create({
                    ...context,
                    entityId: createdSnapshot.id,
                    entityType: "invitation",
                    newValues: createdSnapshot,
                    oldValues: null,
                }, {
                    db: transaction,
                });
                await activityLogService.logUserAction({
                    ...context,
                    action: "Invitation sent",
                    entityId: createdSnapshot.id,
                    entityType: "invitation",
                    metadata: {
                        email: createdSnapshot.email,
                        roleName: createdSnapshot.roleName,
                        summary: `Sent an invitation to ${createdSnapshot.email}.`,
                    },
                }, {
                    db: transaction,
                });
            }
            return createdInvitation;
        });
        const invitationDetails = await prisma.invitation.findUniqueOrThrow({
            select: {
                createdBy: {
                    select: {
                        name: true,
                    },
                },
                email: true,
                expiresAt: true,
                role: {
                    select: {
                        name: true,
                    },
                },
                token: true,
            },
            where: {
                id: invitation.id,
            },
        });
        try {
            await sendInvitationEmail({
                email: invitationDetails.email,
                expiresAt: invitationDetails.expiresAt,
                roleName: invitationDetails.role.name,
                token: invitationDetails.token,
            }, invitationDetails.createdBy.name);
        }
        catch (error) {
            await prisma.invitation.delete({
                where: {
                    id: invitation.id,
                },
            });
            throw error;
        }
        void notificationService
            .create({
            message: `${invitationDetails.email} was invited as ${invitationDetails.role.name}.`,
            title: "User invited",
            type: "success",
            userId: createdById,
        })
            .catch((error) => {
            logger.error("Failed to create invitation notification.", {
                error: error instanceof Error ? error.message : String(error),
                invitationId: invitation.id,
                userId: createdById,
            });
        });
        return this.getInvitationById(invitation.id);
    },
    async getInvitationAcceptancePreview(token) {
        const invitation = await getValidInvitationForAcceptance(token);
        return {
            email: invitation.email,
            expiresAt: invitation.expiresAt.toISOString(),
            invitedByName: invitation.createdBy.name,
            roleName: invitation.role.name,
        };
    },
    async getInvitationById(invitationId) {
        const invitation = await getInvitationRecordById(invitationId);
        if (!invitation) {
            throw new AppError("Invitation not found.", 404);
        }
        return mapInvitationRecord(invitation);
    },
    async listInvitations(query) {
        const where = buildInvitationWhereClause(query);
        const [total, invitations] = await prisma.$transaction([
            prisma.invitation.count({
                where,
            }),
            prisma.invitation.findMany({
                orderBy: buildOrderBy(query.sortBy, query.sortDirection),
                select: {
                    acceptedAt: true,
                    createdAt: true,
                    createdBy: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    deletedAt: true,
                    email: true,
                    expiresAt: true,
                    id: true,
                    role: {
                        select: {
                            description: true,
                            id: true,
                            name: true,
                        },
                    },
                },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: invitations.map((invitation) => mapInvitationRecord(invitation)),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async resendInvitation(invitationId, context) {
        const invitation = await prisma.invitation.findFirst({
            select: {
                acceptedAt: true,
                createdBy: {
                    select: {
                        name: true,
                    },
                },
                deletedAt: true,
                email: true,
                id: true,
                expiresAt: true,
                role: {
                    select: {
                        deletedAt: true,
                        name: true,
                    },
                },
                token: true,
            },
            where: {
                id: invitationId,
            },
        });
        if (!invitation) {
            throw new AppError("Invitation not found.", 404);
        }
        if (invitation.acceptedAt) {
            throw new AppError("Accepted invitations cannot be resent.", 400);
        }
        if (invitation.deletedAt) {
            throw new AppError("Revoked invitations cannot be resent.", 400);
        }
        if (invitation.role.deletedAt) {
            throw new AppError("The assigned role is no longer available.", 400);
        }
        await assertEmailAvailableForInvitation(invitation.email);
        const token = generateSecureToken();
        const expiresAt = getExpiresAt();
        await prisma.$transaction(async (transaction) => {
            const previousSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            await transaction.invitation.update({
                data: {
                    expiresAt,
                    token,
                },
                where: {
                    id: invitation.id,
                },
            });
            const nextSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            if (previousSnapshot && nextSnapshot) {
                await auditLogService.create({
                    ...context,
                    entityId: invitation.id,
                    entityType: "invitation",
                    newValues: nextSnapshot,
                    oldValues: previousSnapshot,
                }, {
                    db: transaction,
                });
                await activityLogService.logUserAction({
                    ...context,
                    action: "Invitation resent",
                    entityId: invitation.id,
                    entityType: "invitation",
                    metadata: {
                        email: nextSnapshot.email,
                        roleName: nextSnapshot.roleName,
                        summary: `Resent an invitation to ${nextSnapshot.email}.`,
                    },
                }, {
                    db: transaction,
                });
            }
        });
        try {
            await sendInvitationEmail({
                email: invitation.email,
                expiresAt,
                roleName: invitation.role.name,
                token,
            }, invitation.createdBy.name);
        }
        catch (error) {
            await prisma.invitation.update({
                data: {
                    expiresAt: invitation.expiresAt,
                    token: invitation.token,
                },
                where: {
                    id: invitation.id,
                },
            });
            throw error;
        }
        return this.getInvitationById(invitation.id);
    },
    async revokeInvitation(invitationId, context) {
        const invitation = await prisma.invitation.findFirst({
            select: {
                acceptedAt: true,
                deletedAt: true,
                id: true,
            },
            where: {
                id: invitationId,
            },
        });
        if (!invitation) {
            throw new AppError("Invitation not found.", 404);
        }
        if (invitation.acceptedAt) {
            throw new AppError("Accepted invitations cannot be revoked.", 400);
        }
        if (invitation.deletedAt) {
            return this.getInvitationById(invitation.id);
        }
        await prisma.$transaction(async (transaction) => {
            const previousSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            await transaction.invitation.update({
                data: {
                    deletedAt: new Date(),
                    token: generateSecureToken(),
                },
                where: {
                    id: invitation.id,
                },
            });
            const nextSnapshot = await getInvitationAuditSnapshot(transaction, invitation.id);
            if (previousSnapshot && nextSnapshot) {
                await auditLogService.create({
                    ...context,
                    entityId: invitation.id,
                    entityType: "invitation",
                    newValues: nextSnapshot,
                    oldValues: previousSnapshot,
                }, {
                    db: transaction,
                });
                await activityLogService.logUserAction({
                    ...context,
                    action: "Invitation revoked",
                    entityId: invitation.id,
                    entityType: "invitation",
                    metadata: {
                        email: nextSnapshot.email,
                        roleName: nextSnapshot.roleName,
                        summary: `Revoked the invitation for ${nextSnapshot.email}.`,
                    },
                }, {
                    db: transaction,
                });
            }
        });
        return this.getInvitationById(invitation.id);
    },
};
//# sourceMappingURL=invitations-service.js.map