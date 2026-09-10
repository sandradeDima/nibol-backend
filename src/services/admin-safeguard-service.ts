import {
  ADMIN_ROLE_CODE,
  ADMIN_ROLE_NAME,
  CRITICAL_ADMIN_PERMISSIONS,
} from "../permissions/definitions.js";
import { AppError } from "../utils/app-error.js";
import { prisma } from "../utils/prisma.js";

const getRole = async (roleId: string) => {
  return prisma.role.findUnique({
    select: {
      id: true,
      code: true,
      name: true,
    },
    where: {
      id: roleId,
    },
  });
};

const isAdminRole = (roleCode: string | null | undefined): boolean => {
  return roleCode === ADMIN_ROLE_CODE;
};

export const adminSafeguardService = {
  async assertRoleDeletionAllowed(roleId: string): Promise<void> {
    const role = await getRole(roleId);

    if (isAdminRole(role?.code)) {
      throw new AppError("Admin role cannot be deleted.", 400);
    }
  },

  async assertRoleNameUpdateAllowed(
    roleId: string,
    nextRoleName: string,
  ): Promise<void> {
    const role = await getRole(roleId);

    if (!isAdminRole(role?.code)) {
      return;
    }

    if (nextRoleName !== ADMIN_ROLE_NAME) {
      throw new AppError("Admin role name cannot be changed.", 400);
    }
  },

  async assertUserRoleRemovalAllowed(
    userId: string,
    roleId: string,
  ): Promise<void> {
    const role = await getRole(roleId);

    if (!isAdminRole(role?.code)) {
      return;
    }

    const adminCount = await prisma.userRole.count({
      where: {
        roleId,
        user: {
          deletedAt: null,
          isActive: true,
        },
      },
    });

    const userStillHasAdminRole = await prisma.userRole.findUnique({
      select: {
        id: true,
      },
      where: {
        userId_roleId: {
          roleId,
          userId,
        },
      },
    });

    if (userStillHasAdminRole && adminCount <= 1) {
      throw new AppError(
        "Admin role cannot be removed from the last admin.",
        400,
      );
    }
  },

  async assertUserRoleUpdateAllowed(
    userId: string,
    nextRoleIds: string[],
  ): Promise<void> {
    const adminRole = await prisma.role.findFirst({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
        code: ADMIN_ROLE_CODE,
      },
    });

    if (!adminRole) {
      return;
    }

    if (nextRoleIds.includes(adminRole.id)) {
      return;
    }

    await this.assertUserRoleRemovalAllowed(userId, adminRole.id);
  },

  async assertRolePermissionUpdateAllowed(
    roleId: string,
    nextPermissions: string[],
  ): Promise<void> {
    const role = await getRole(roleId);

    if (!isAdminRole(role?.code)) {
      return;
    }

    const nextPermissionSet = new Set(nextPermissions);
    const missingCriticalPermissions = CRITICAL_ADMIN_PERMISSIONS.filter(
      (permission) => !nextPermissionSet.has(permission),
    );

    if (missingCriticalPermissions.length > 0) {
      throw new AppError(
        `Admin role must keep critical permissions: ${missingCriticalPermissions.join(", ")}.`,
        400,
      );
    }
  },
};
