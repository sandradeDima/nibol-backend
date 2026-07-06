import type { Prisma } from "../../generated/prisma/client.js";

import { ADMIN_ROLE_NAME } from "../permissions/definitions.js";
import { activityLogService } from "./activity-log-service.js";
import { auditLogService } from "./audit-log-service.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";
import type {
  CreateRoleInput,
  ListRolesQuery,
  UpdateRoleInput,
} from "../validators/roles-validator.js";
import { adminSafeguardService } from "./admin-safeguard-service.js";
import {
  areStringArraysEqual,
  type LogActorContext,
} from "./logging-utils.js";

const MAX_ROLE_NAME_LENGTH = 191;

const buildOrderBy = (
  sortBy: ListRolesQuery["sortBy"],
  sortDirection: ListRolesQuery["sortDirection"],
): Prisma.RoleOrderByWithRelationInput => {
  switch (sortBy) {
    case "createdAt":
      return {
        createdAt: sortDirection,
      };
    case "name":
      return {
        name: sortDirection,
      };
  }
};

const buildWhereClause = (query: ListRolesQuery): Prisma.RoleWhereInput => {
  return {
    ...(query.search.length > 0
      ? {
          OR: [
            {
              description: {
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

const buildDeletedRoleName = (roleName: string, roleId: string): string => {
  const suffix = `__deleted__${roleId.slice(0, 8)}__${Date.now()}`;
  const maxBaseLength = Math.max(1, MAX_ROLE_NAME_LENGTH - suffix.length);
  return `${roleName.slice(0, maxBaseLength)}${suffix}`;
};

const assertRoleNameAvailable = async (
  roleName: string,
  excludedRoleId?: string,
): Promise<void> => {
  const existingRole = await prisma.role.findFirst({
    select: {
      id: true,
    },
    where: {
      name: roleName,
    },
  });

  if (existingRole && existingRole.id !== excludedRoleId) {
    throw new AppError("A role with this name already exists.", 400);
  }
};

const getPermissionRecords = async (
  permissionNames: string[],
): Promise<Array<{ id: string; name: string }>> => {
  if (permissionNames.length === 0) {
    return [];
  }

  const permissions = await prisma.permission.findMany({
    select: {
      id: true,
      name: true,
    },
    where: {
      deletedAt: null,
      name: {
        in: permissionNames,
      },
    },
  });

  if (permissions.length !== permissionNames.length) {
    throw new AppError("One or more selected permissions are invalid.", 400);
  }

  return permissions;
};

const getRoleDetailsRecord = async (roleId: string) => {
  return prisma.role.findFirst({
    select: {
      _count: {
        select: {
          userRoles: {
            where: {
              user: {
                deletedAt: null,
              },
            },
          },
        },
      },
      createdAt: true,
      description: true,
      id: true,
      name: true,
      rolePermissions: {
        orderBy: {
          permission: {
            name: "asc",
          },
        },
        select: {
          permission: {
            select: {
              name: true,
            },
          },
        },
        where: {
          permission: {
            deletedAt: null,
          },
        },
      },
      updatedAt: true,
    },
    where: {
      deletedAt: null,
      id: roleId,
    },
  });
};

const mapRoleDetails = (
  role: NonNullable<Awaited<ReturnType<typeof getRoleDetailsRecord>>>,
) => {
  return {
    createdAt: role.createdAt.toISOString(),
    description: role.description,
    id: role.id,
    isAdmin: role.name === ADMIN_ROLE_NAME,
    name: role.name,
    permissions: role.rolePermissions.map(({ permission }) => permission.name),
    updatedAt: role.updatedAt.toISOString(),
    usersCount: role._count.userRoles,
  };
};

type RoleAuditSnapshot = {
  description: string | null;
  id: string;
  name: string;
  permissionNames: string[];
  userCount: number;
};

const getRoleAuditSnapshot = async (
  db: {
    role: Pick<typeof prisma.role, "findFirst">;
  },
  roleId: string,
): Promise<RoleAuditSnapshot | null> => {
  const role = await db.role.findFirst({
    select: {
      _count: {
        select: {
          userRoles: {
            where: {
              user: {
                deletedAt: null,
              },
            },
          },
        },
      },
      description: true,
      id: true,
      name: true,
      rolePermissions: {
        orderBy: {
          permission: {
            name: "asc",
          },
        },
        select: {
          permission: {
            select: {
              name: true,
            },
          },
        },
        where: {
          permission: {
            deletedAt: null,
          },
        },
      },
    },
    where: {
      id: roleId,
    },
  });

  if (!role) {
    return null;
  }

  return {
    description: role.description,
    id: role.id,
    name: role.name,
    permissionNames: role.rolePermissions.map(({ permission }) => permission.name),
    userCount: role._count.userRoles,
  };
};

export const rolesService = {
  async createRole(input: CreateRoleInput, context?: LogActorContext) {
    await assertRoleNameAvailable(input.name);
    const permissions = await getPermissionRecords(input.permissionNames);

    const createdRole = await prisma.$transaction(async (transaction) => {
      const role = await transaction.role.create({
        data: {
          description: input.description,
          name: input.name,
        },
        select: {
          id: true,
        },
      });

      if (permissions.length > 0) {
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            permissionId: permission.id,
            roleId: role.id,
          })),
        });
      }

      const createdSnapshot = await getRoleAuditSnapshot(transaction, role.id);

      if (createdSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: createdSnapshot.id,
            entityType: "role",
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
            action: "Role created",
            entityId: createdSnapshot.id,
            entityType: "role",
            metadata: {
              permissions: createdSnapshot.permissionNames,
              summary: `${createdSnapshot.name} was created.`,
            },
          },
          {
            db: transaction,
          },
        );

        if (createdSnapshot.permissionNames.length > 0) {
          await activityLogService.logUserAction(
            {
              ...context,
              action: "Permission changed",
              entityId: createdSnapshot.id,
              entityType: "role",
              metadata: {
                afterPermissions: createdSnapshot.permissionNames,
                beforePermissions: [],
                summary: `${createdSnapshot.permissionNames.length} permission(s) were assigned to ${createdSnapshot.name}.`,
              },
            },
            {
              db: transaction,
            },
          );
        }
      }

      return role;
    });

    return this.getRoleById(createdRole.id);
  },

  async deleteRole(roleId: string, context?: LogActorContext): Promise<void> {
    const role = await prisma.role.findFirst({
      select: {
        id: true,
        name: true,
      },
      where: {
        deletedAt: null,
        id: roleId,
      },
    });

    if (!role) {
      throw new AppError("Role not found.", 404);
    }

    await adminSafeguardService.assertRoleDeletionAllowed(roleId);

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getRoleAuditSnapshot(transaction, roleId);

      await transaction.userRole.deleteMany({
        where: {
          roleId,
        },
      });

      await transaction.rolePermission.deleteMany({
        where: {
          roleId,
        },
      });

      await transaction.role.update({
        data: {
          deletedAt: new Date(),
          name: buildDeletedRoleName(role.name, role.id),
        },
        where: {
          id: roleId,
        },
      });

      if (previousSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: previousSnapshot.id,
            entityType: "role",
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
            action: "Role deleted",
            entityId: previousSnapshot.id,
            entityType: "role",
            metadata: {
              summary: `${previousSnapshot.name} was deleted.`,
            },
          },
          {
            db: transaction,
          },
        );
      }
    });
  },

  async getRoleById(roleId: string) {
    const role = await getRoleDetailsRecord(roleId);

    if (!role) {
      throw new AppError("Role not found.", 404);
    }

    return mapRoleDetails(role);
  },

  async listRoles(query: ListRolesQuery) {
    const where = buildWhereClause(query);
    const [total, roles] = await prisma.$transaction([
      prisma.role.count({
        where,
      }),
      prisma.role.findMany({
        orderBy: buildOrderBy(query.sortBy, query.sortDirection),
        select: {
          _count: {
            select: {
              userRoles: {
                where: {
                  user: {
                    deletedAt: null,
                  },
                },
              },
            },
          },
          createdAt: true,
          description: true,
          id: true,
          name: true,
        },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: roles.map((role) => ({
        createdAt: role.createdAt.toISOString(),
        description: role.description,
        id: role.id,
        isAdmin: role.name === ADMIN_ROLE_NAME,
        name: role.name,
        usersCount: role._count.userRoles,
      })),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async updateRole(roleId: string, input: UpdateRoleInput, context?: LogActorContext) {
    const existingRole = await prisma.role.findFirst({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        id: roleId,
      },
    });

    if (!existingRole) {
      throw new AppError("Role not found.", 404);
    }

    await assertRoleNameAvailable(input.name, roleId);
    await adminSafeguardService.assertRoleNameUpdateAllowed(roleId, input.name);
    await adminSafeguardService.assertRolePermissionUpdateAllowed(
      roleId,
      input.permissionNames,
    );

    const permissions = await getPermissionRecords(input.permissionNames);

    await prisma.$transaction(async (transaction) => {
      const previousSnapshot = await getRoleAuditSnapshot(transaction, roleId);

      await transaction.role.update({
        data: {
          description: input.description,
          name: input.name,
        },
        where: {
          id: roleId,
        },
      });

      await transaction.rolePermission.deleteMany({
        where: {
          roleId,
        },
      });

      if (permissions.length > 0) {
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            permissionId: permission.id,
            roleId,
          })),
        });
      }

      const nextSnapshot = await getRoleAuditSnapshot(transaction, roleId);

      if (previousSnapshot && nextSnapshot) {
        await auditLogService.create(
          {
            ...context,
            entityId: roleId,
            entityType: "role",
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
            action: "Role updated",
            entityId: roleId,
            entityType: "role",
            metadata: {
              summary: `${nextSnapshot.name} was updated.`,
              updatedFields: ["description", "name", "permissions"],
            },
          },
          {
            db: transaction,
          },
        );

        if (
          !areStringArraysEqual(
            previousSnapshot.permissionNames,
            nextSnapshot.permissionNames,
          )
        ) {
          await activityLogService.logUserAction(
            {
              ...context,
              action: "Permission changed",
              entityId: roleId,
              entityType: "role",
              metadata: {
                afterPermissions: nextSnapshot.permissionNames,
                beforePermissions: previousSnapshot.permissionNames,
                summary: `${nextSnapshot.name}'s permissions changed.`,
              },
            },
            {
              db: transaction,
            },
          );
        }
      }
    });

    return this.getRoleById(roleId);
  },
};
