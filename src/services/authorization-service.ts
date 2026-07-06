import { ADMIN_ROLE_NAME } from "../permissions/definitions.js";
import { prisma } from "../utils/prisma.js";

export type AuthorizationSummary = {
  isAdmin: boolean;
  permissions: string[];
  roles: string[];
  userId: string;
};

export type AuthorizationRequestCache = {
  summaryByUserId: Map<string, AuthorizationSummary>;
};

type AuthorizationLookupOptions = {
  cache?: AuthorizationRequestCache;
};

const buildAuthorizationSummary = async (
  userId: string,
): Promise<AuthorizationSummary> => {
  const userRoles = await prisma.userRole.findMany({
    select: {
      role: {
        select: {
          name: true,
          rolePermissions: {
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
      },
    },
    where: {
      user: {
        deletedAt: null,
        id: userId,
        isActive: true,
      },
      role: {
        deletedAt: null,
      },
    },
  });

  const roles = userRoles.map(({ role }) => role.name).sort((left, right) => {
    return left.localeCompare(right);
  });

  const permissions = Array.from(
    new Set(
      userRoles.flatMap(({ role }) =>
        role.rolePermissions.map(({ permission }) => permission.name),
      ),
    ),
  ).sort((left, right) => {
    return left.localeCompare(right);
  });

  return {
    isAdmin: roles.includes(ADMIN_ROLE_NAME),
    permissions,
    roles,
    userId,
  };
};

const getCachedSummary = (
  userId: string,
  options?: AuthorizationLookupOptions,
): AuthorizationSummary | null => {
  return options?.cache?.summaryByUserId.get(userId) ?? null;
};

const setCachedSummary = (
  summary: AuthorizationSummary,
  options?: AuthorizationLookupOptions,
): AuthorizationSummary => {
  options?.cache?.summaryByUserId.set(summary.userId, summary);
  return summary;
};

export const createAuthorizationRequestCache = (): AuthorizationRequestCache => {
  return {
    summaryByUserId: new Map(),
  };
};

export const authorizationService = {
  async getUserAuthorizationSummary(
    userId: string,
    options?: AuthorizationLookupOptions,
  ): Promise<AuthorizationSummary> {
    const cachedSummary = getCachedSummary(userId, options);

    if (cachedSummary) {
      return cachedSummary;
    }

    const summary = await buildAuthorizationSummary(userId);
    return setCachedSummary(summary, options);
  },

  async getUserPermissions(
    userId: string,
    options?: AuthorizationLookupOptions,
  ): Promise<string[]> {
    const summary = await this.getUserAuthorizationSummary(userId, options);
    return summary.permissions;
  },

  async hasPermission(
    userId: string,
    permission: string,
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId, options);
    return permissions.includes(permission);
  },

  async hasAnyPermission(
    userId: string,
    permissions: string[],
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return true;
    }

    const userPermissions = new Set(await this.getUserPermissions(userId, options));
    return permissions.some((permission) => userPermissions.has(permission));
  },

  async hasAllPermissions(
    userId: string,
    permissions: string[],
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    if (permissions.length === 0) {
      return true;
    }

    const userPermissions = new Set(await this.getUserPermissions(userId, options));
    return permissions.every((permission) => userPermissions.has(permission));
  },
};
