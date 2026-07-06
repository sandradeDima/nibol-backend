import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import bcrypt from "bcryptjs";
import type { Prisma } from "../../generated/prisma/client.js";

import { ADMIN_ROLE_NAME } from "../permissions/definitions.js";
import { resendVerificationEmailToUser } from "../modules/auth/verification-email.js";
import { activityLogService } from "./activity-log-service.js";
import { auditLogService } from "./audit-log-service.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import { avatarUploadsDir, buildAvatarUrl } from "../utils/uploads.js";
import type {
  ChangePasswordInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateProfileInput,
  UpdateUserInput,
} from "../validators/users-validator.js";
import { adminSafeguardService } from "./admin-safeguard-service.js";
import {
  areStringArraysEqual,
  type LogActorContext,
} from "./logging-utils.js";
import { notificationService } from "./notification-service.js";

const credentialProviderId = "credential";

const buildOrderBy = (
  sortBy: ListUsersQuery["sortBy"],
  sortDirection: ListUsersQuery["sortDirection"],
): Prisma.UserOrderByWithRelationInput => {
  switch (sortBy) {
    case "createdAt":
      return {
        createdAt: sortDirection,
      };
    case "email":
      return {
        email: sortDirection,
      };
    case "emailVerified":
      return {
        emailVerified: sortDirection,
      };
    case "isActive":
      return {
        isActive: sortDirection,
      };
    case "lastLoginAt":
      return {
        lastLoginAt: sortDirection,
      };
    case "name":
      return {
        name: sortDirection,
      };
  }
};

const buildWhereClause = (query: ListUsersQuery): Prisma.UserWhereInput => {
  return {
    ...(query.emailVerified !== undefined
      ? {
          emailVerified: query.emailVerified,
        }
      : {}),
    ...(query.isActive !== undefined
      ? {
          isActive: query.isActive,
        }
      : {}),
    ...(query.roles.length > 0
      ? {
          userRoles: {
            some: {
              role: {
                deletedAt: null,
                name: {
                  in: query.roles,
                },
              },
            },
          },
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              email: {
                contains: query.search,
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
    deletedAt: null,
  };
};

const getAdminRoleId = async (): Promise<string | null> => {
  const adminRole = await prisma.role.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      name: ADMIN_ROLE_NAME,
    },
  });

  return adminRole?.id ?? null;
};

const assertUserCanLoseActiveAccess = async (userId: string): Promise<void> => {
  const adminRoleId = await getAdminRoleId();

  if (!adminRoleId) {
    return;
  }

  const hasAdminRole = await prisma.userRole.findUnique({
    select: {
      id: true,
    },
    where: {
      userId_roleId: {
        roleId: adminRoleId,
        userId,
      },
    },
  });

  if (!hasAdminRole) {
    return;
  }

  const remainingAdminCount = await prisma.userRole.count({
    where: {
      roleId: adminRoleId,
      user: {
        deletedAt: null,
        id: {
          not: userId,
        },
        isActive: true,
      },
    },
  });

  if (remainingAdminCount === 0) {
    throw new AppError("The last admin user cannot be deactivated.", 400);
  }
};

const assertEmailAvailable = async (
  email: string,
  excludedUserId?: string,
): Promise<void> => {
  const existingUser = await prisma.user.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      email,
      ...(excludedUserId
        ? {
            id: {
              not: excludedUserId,
            },
          }
        : {}),
    },
  });

  if (existingUser) {
    throw new AppError("A user with this email already exists.", 400);
  }
};

const assertRolesExist = async (roleIds: string[]): Promise<void> => {
  const matchingRoles = await prisma.role.count({
    where: {
      deletedAt: null,
      id: {
        in: roleIds,
      },
    },
  });

  if (matchingRoles !== roleIds.length) {
    throw new AppError("One or more selected roles are invalid.", 400);
  }
};

const getUserDetailsRecord = async (userId: string) => {
  return prisma.user.findFirst({
    select: {
      avatar: true,
      createdAt: true,
      email: true,
      emailVerified: true,
      id: true,
      isActive: true,
      lastLoginAt: true,
      name: true,
      updatedAt: true,
      userRoles: {
        orderBy: {
          role: {
            name: "asc",
          },
        },
        select: {
          role: {
            select: {
              description: true,
              id: true,
              name: true,
            },
          },
        },
        where: {
          role: {
            deletedAt: null,
          },
        },
      },
    },
    where: {
      deletedAt: null,
      id: userId,
    },
  });
};

const mapUserDetails = (
  user: NonNullable<Awaited<ReturnType<typeof getUserDetailsRecord>>>,
) => {
  return {
    avatar: user.avatar,
    createdAt: user.createdAt.toISOString(),
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    name: user.name,
    roleIds: user.userRoles.map(({ role }) => role.id),
    roles: user.userRoles.map(({ role }) => ({
      description: role.description,
      id: role.id,
      name: role.name,
    })),
    updatedAt: user.updatedAt.toISOString(),
  };
};

const buildAvatarFileName = (userId: string, originalName: string): string => {
  const extension = path.extname(originalName).toLowerCase() || ".png";
  return `${userId}-${Date.now()}-${randomUUID()}${extension}`;
};

type UserAuditSnapshot = {
  avatar: string | null;
  deletedAt: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  isActive: boolean;
  name: string;
  roleIds: string[];
  roleNames: string[];
};

const getUserAuditSnapshot = async (
  db: {
    user: Pick<typeof prisma.user, "findFirst">;
  },
  userId: string,
): Promise<UserAuditSnapshot | null> => {
  const user = await db.user.findFirst({
    select: {
      avatar: true,
      deletedAt: true,
      email: true,
      emailVerified: true,
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
        where: {
          role: {
            deletedAt: null,
          },
        },
      },
    },
    where: {
      id: userId,
    },
  });

  if (!user) {
    return null;
  }

  return {
    avatar: user.avatar,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    isActive: user.isActive,
    name: user.name,
    roleIds: user.userRoles.map(({ role }) => role.id),
    roleNames: user.userRoles.map(({ role }) => role.name),
  };
};

const removePreviousAvatarIfLocal = async (
  avatarUrl: string | null | undefined,
): Promise<void> => {
  if (!avatarUrl) {
    return;
  }

  const marker = "/uploads/avatars/";
  const markerIndex = avatarUrl.indexOf(marker);

  if (markerIndex === -1) {
    return;
  }

  const fileName = avatarUrl.slice(markerIndex + marker.length);

  if (!fileName) {
    return;
  }

  try {
    await unlink(path.join(avatarUploadsDir, fileName));
  } catch {
    // Ignore missing files so avatar replacement remains resilient.
  }
};

export const usersService = {
  async bulkDeleteUsers(
    ids: string[],
    context?: LogActorContext,
  ): Promise<number> {
    const existingUsers = await prisma.user.findMany({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        id: {
          in: ids,
        },
      },
    });

    if (existingUsers.length === 0) {
      return 0;
    }

    await Promise.all(
      existingUsers.map((user) => assertUserCanLoseActiveAccess(user.id)),
    );

    const deletedUsers = await prisma.$transaction(async (transaction) => {
      const snapshots = (
        await Promise.all(
          existingUsers.map((user) => getUserAuditSnapshot(transaction, user.id)),
        )
      ).filter((snapshot): snapshot is UserAuditSnapshot => snapshot !== null);

      const result = await transaction.user.updateMany({
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
        where: {
          deletedAt: null,
          id: {
            in: existingUsers.map((user) => user.id),
          },
        },
      });

      await Promise.all(
        snapshots.flatMap((snapshot) => [
          auditLogService.create(
            {
              ...context,
              entityId: snapshot.id,
              entityType: "user",
              newValues: null,
              oldValues: snapshot,
            },
            {
              db: transaction,
            },
          ),
          activityLogService.logUserAction(
            {
              ...context,
              action: "User deleted",
              entityId: snapshot.id,
              entityType: "user",
              metadata: {
                email: snapshot.email,
                summary: `${snapshot.name} was deleted.`,
              },
            },
            {
              db: transaction,
            },
          ),
        ]),
      );

      return result;
    });

    return deletedUsers.count;
  },

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context?: LogActorContext,
  ): Promise<void> {
    const user = await prisma.user.findFirst({
      select: {
        email: true,
        name: true,
        password: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user?.password) {
      throw new AppError("Password credentials are not available for this account.", 400);
    }

    const passwordMatches = await bcrypt.compare(
      input.currentPassword,
      user.password,
    );

    if (!passwordMatches) {
      throw new AppError("The current password is incorrect.", 400);
    }

    const nextPasswordHash = await bcrypt.hash(input.newPassword, 12);

    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        data: {
          password: nextPasswordHash,
        },
        where: {
          id: userId,
        },
      });

      await transaction.account.updateMany({
        data: {
          password: nextPasswordHash,
        },
        where: {
          providerId: credentialProviderId,
          userId,
        },
      });

      await activityLogService.logUserAction(
        {
          ...context,
          action: "User updated",
          entityId: userId,
          entityType: "user",
          metadata: {
            email: user.email,
            summary: `${user.name} changed their password.`,
            updatedFields: ["password"],
          },
        },
        {
          db: transaction,
        },
      );
    });
  },

  async createUser(input: CreateUserInput, context?: LogActorContext) {
    await assertEmailAvailable(input.email);
    await assertRolesExist(input.roleIds);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const createdUser = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          emailVerified: false,
          isActive: input.isActive,
          name: input.name,
          password: passwordHash,
        },
        select: {
          id: true,
        },
      });

      await transaction.account.create({
        data: {
          accountId: input.email,
          password: passwordHash,
          providerId: credentialProviderId,
          userId: user.id,
        },
      });

      await transaction.userRole.createMany({
        data: input.roleIds.map((roleId) => ({
          roleId,
          userId: user.id,
        })),
      });

      const createdSnapshot = await getUserAuditSnapshot(transaction, user.id);

      if (createdSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: createdSnapshot.id,
            entityType: "user",
            newValues: createdSnapshot,
            oldValues: null,
          },
          {
            db: transaction,
          },
        );

        await activityLogService.logUserAction(
          {
            ...context,
            action: "User created",
            entityId: createdSnapshot.id,
            entityType: "user",
            metadata: {
              email: createdSnapshot.email,
              roles: createdSnapshot.roleNames,
              summary: `${createdSnapshot.name} was created.`,
            },
          },
          {
            db: transaction,
          },
        );

        if (createdSnapshot.roleNames.length > 0) {
          await activityLogService.logUserAction(
            {
              ...context,
              action: "Role assigned",
              entityId: createdSnapshot.id,
              entityType: "user",
              metadata: {
                roles: createdSnapshot.roleNames,
                summary: `Assigned ${createdSnapshot.roleNames.join(", ")} to ${createdSnapshot.name}.`,
              },
            },
            {
              db: transaction,
            },
          );
        }
      }

      return user;
    });

    return this.getUserById(createdUser.id);
  },

  async deleteUser(userId: string, context?: LogActorContext): Promise<void> {
    const user = await prisma.user.findFirst({
      select: {
        avatar: true,
        id: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    await assertUserCanLoseActiveAccess(userId);

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getUserAuditSnapshot(transaction, userId);

      await transaction.user.update({
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
        where: {
          id: userId,
        },
      });

      if (previousSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: previousSnapshot.id,
            entityType: "user",
            newValues: null,
            oldValues: previousSnapshot,
          },
          {
            db: transaction,
          },
        );

        await activityLogService.logUserAction(
          {
            ...context,
            action: "User deleted",
            entityId: previousSnapshot.id,
            entityType: "user",
            metadata: {
              email: previousSnapshot.email,
              summary: `${previousSnapshot.name} was deleted.`,
            },
          },
          {
            db: transaction,
          },
        );
      }
    });

    await removePreviousAvatarIfLocal(user.avatar);
  },

  async getProfile(userId: string) {
    const user = await prisma.user.findFirst({
      select: {
        avatar: true,
        createdAt: true,
        email: true,
        id: true,
        lastLoginAt: true,
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
                name: true,
              },
            },
          },
          where: {
            role: {
              deletedAt: null,
            },
          },
        },
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    return {
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      id: user.id,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      name: user.name,
      roles: user.userRoles.map(({ role }) => role.name),
    };
  },

  async getUserById(userId: string) {
    const user = await getUserDetailsRecord(userId);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    return mapUserDetails(user);
  },

  async listUsers(query: ListUsersQuery) {
    const where = buildWhereClause(query);
    const [total, users] = await prisma.$transaction([
      prisma.user.count({
        where,
      }),
      prisma.user.findMany({
        orderBy: buildOrderBy(query.sortBy, query.sortDirection),
        select: {
          createdAt: true,
          email: true,
          emailVerified: true,
          id: true,
          isActive: true,
          lastLoginAt: true,
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
                  name: true,
                },
              },
            },
            where: {
              role: {
                deletedAt: null,
              },
            },
          },
        },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: users.map((user) => ({
        createdAt: user.createdAt.toISOString(),
        email: user.email,
        emailVerified: user.emailVerified,
        id: user.id,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        name: user.name,
        roles: user.userRoles.map(({ role }) => role.name),
      })),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listUserOptions() {
    const users = await prisma.user.findMany({
      orderBy: [
        {
          name: "asc",
        },
        {
          email: "asc",
        },
      ],
      select: {
        email: true,
        id: true,
        name: true,
      },
      where: {
        deletedAt: null,
      },
    });

    return users;
  },

  async resendVerificationEmail(userId: string, context?: LogActorContext): Promise<void> {
    const user = await prisma.user.findFirst({
      select: {
        email: true,
        emailVerified: true,
        id: true,
        name: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    if (user.emailVerified) {
      throw new AppError("Este usuario ya verifico su correo.", 400);
    }

    await resendVerificationEmailToUser({
      email: user.email,
      name: user.name,
    });

    await activityLogService.logUserAction({
      ...context,
      action: "Verification email resent",
      entityId: user.id,
      entityType: "user",
      metadata: {
        email: user.email,
        summary: `Se reenvio un correo de verificacion a ${user.name}.`,
      },
    });
  },

  async setUserActiveState(
    userId: string,
    isActive: boolean,
    context?: LogActorContext,
  ) {
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        isActive: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    if (user.isActive === isActive) {
      return this.getUserById(userId);
    }

    if (!isActive) {
      await assertUserCanLoseActiveAccess(userId);
    }

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getUserAuditSnapshot(transaction, userId);

      await transaction.user.update({
        data: {
          isActive,
        },
        where: {
          id: userId,
        },
      });

      const nextSnapshot = await getUserAuditSnapshot(transaction, userId);

      if (previousSnapshot && nextSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: userId,
            entityType: "user",
            newValues: nextSnapshot,
            oldValues: previousSnapshot,
          },
          {
            db: transaction,
          },
        );

        await activityLogService.logUserAction(
          {
            ...context,
            action: isActive ? "User enabled" : "User disabled",
            entityId: userId,
            entityType: "user",
            metadata: {
              summary: `${nextSnapshot.name} was ${isActive ? "enabled" : "disabled"}.`,
            },
          },
          {
            db: transaction,
          },
        );
      }
    });

    return this.getUserById(userId);
  },

  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
    context?: LogActorContext,
  ) {
    const user = await prisma.user.findFirst({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getUserAuditSnapshot(transaction, userId);

      await transaction.user.update({
        data: {
          name: input.name,
        },
        where: {
          id: userId,
        },
      });

      const nextSnapshot = await getUserAuditSnapshot(transaction, userId);

      if (previousSnapshot && nextSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: userId,
            entityType: "user",
            newValues: nextSnapshot,
            oldValues: previousSnapshot,
          },
          {
            db: transaction,
          },
        );

        await activityLogService.logUserAction(
          {
            ...context,
            action: "User updated",
            entityId: userId,
            entityType: "user",
            metadata: {
              summary: `${nextSnapshot.name} updated their profile.`,
              updatedFields: ["name"],
            },
          },
          {
            db: transaction,
          },
        );
      }
    });

    return this.getProfile(userId);
  },

  async updateUser(
    userId: string,
    input: UpdateUserInput,
    context?: LogActorContext,
  ) {
    const existingUser = await prisma.user.findFirst({
      select: {
        email: true,
        id: true,
        isActive: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!existingUser) {
      throw new AppError("User not found.", 404);
    }

    await assertEmailAvailable(input.email, userId);
    await assertRolesExist(input.roleIds);
    await adminSafeguardService.assertUserRoleUpdateAllowed(userId, input.roleIds);

    if (!input.isActive && existingUser.isActive) {
      await assertUserCanLoseActiveAccess(userId);
    }

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getUserAuditSnapshot(transaction, userId);

      await transaction.user.update({
        data: {
          email: input.email,
          isActive: input.isActive,
          name: input.name,
        },
        where: {
          id: userId,
        },
      });

      if (existingUser.email !== input.email) {
        await transaction.account.updateMany({
          data: {
            accountId: input.email,
          },
          where: {
            providerId: credentialProviderId,
            userId,
          },
        });
      }

      await transaction.userRole.deleteMany({
        where: {
          userId,
        },
      });

      await transaction.userRole.createMany({
        data: input.roleIds.map((roleId) => ({
          roleId,
          userId,
        })),
      });

      const nextSnapshot = await getUserAuditSnapshot(transaction, userId);

      if (previousSnapshot && nextSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: userId,
            entityType: "user",
            newValues: nextSnapshot,
            oldValues: previousSnapshot,
          },
          {
            db: transaction,
          },
        );

        await activityLogService.logUserAction(
          {
            ...context,
            action: "User updated",
            entityId: userId,
            entityType: "user",
            metadata: {
              summary: `${nextSnapshot.name} was updated.`,
              updatedFields: ["email", "isActive", "name", "roles"],
            },
          },
          {
            db: transaction,
          },
        );

        if (!areStringArraysEqual(previousSnapshot.roleNames, nextSnapshot.roleNames)) {
          await activityLogService.logUserAction(
            {
              ...context,
              action: "Role changed",
              entityId: userId,
              entityType: "user",
              metadata: {
                afterRoles: nextSnapshot.roleNames,
                beforeRoles: previousSnapshot.roleNames,
                summary: `${nextSnapshot.name}'s roles changed from ${previousSnapshot.roleNames.join(", ") || "none"} to ${nextSnapshot.roleNames.join(", ") || "none"}.`,
              },
            },
            {
              db: transaction,
            },
          );

          await notificationService.create(
            {
              message: `Your access roles changed from ${previousSnapshot.roleNames.join(", ") || "none"} to ${nextSnapshot.roleNames.join(", ") || "none"}.`,
              title: "Role changed",
              type: "warning",
              userId,
            },
            {
              db: transaction,
            },
          );
        }
      }
    });

    return this.getUserById(userId);
  },

  async uploadAvatar(
    userId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalName: string;
    },
  ) {
    const user = await prisma.user.findFirst({
      select: {
        avatar: true,
        id: true,
      },
      where: {
        deletedAt: null,
        id: userId,
      },
    });

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    const fileName = buildAvatarFileName(userId, file.originalName);
    const destination = path.join(avatarUploadsDir, fileName);

    await writeFile(destination, file.buffer);

    const avatarUrl = buildAvatarUrl(fileName);

    await prisma.user.update({
      data: {
        avatar: avatarUrl,
      },
      where: {
        id: userId,
      },
    });

    await removePreviousAvatarIfLocal(user.avatar);

    return {
      avatar: avatarUrl,
    };
  },
};
