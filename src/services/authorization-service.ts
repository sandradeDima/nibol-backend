import type { Prisma } from "../../generated/prisma/client.js";

import { ADMIN_ROLE_CODE, type RoleCode } from "../permissions/role-codes.js";
import { prisma } from "../utils/prisma.js";

export type DataScope = "ALL" | "AUDIT_SCOPE" | "AREA" | "ASSIGNED";

export type AuthorizationSummary = {
  dataScope: DataScope;
  isAdmin: boolean;
  permissions: string[];
  roleCode: RoleCode | null;
  roleName: string | null;
  roles: string[];
  userId: string;
};

export type AuthorizationRequestCache = {
  summaryByUserId: Map<string, AuthorizationSummary>;
};

type AuthorizationLookupOptions = {
  cache?: AuthorizationRequestCache;
};

const getDataScope = (
  roleCode: RoleCode | null,
  isAdmin: boolean,
): DataScope => {
  if (isAdmin) return "ALL";
  if (roleCode === "AUDITOR") return "AUDIT_SCOPE";
  if (roleCode === "PROCESS_OWNER" || roleCode === "AREA_RESPONSIBLE") {
    return "AREA";
  }
  return "ASSIGNED";
};

const buildAuthorizationSummary = async (
  userId: string,
): Promise<AuthorizationSummary> => {
  const userRole = await prisma.userRole.findFirst({
    select: {
      role: {
        select: {
          code: true,
          name: true,
          rolePermissions: {
            select: {
              permission: { select: { name: true } },
            },
            where: { permission: { deletedAt: null } },
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
      role: { deletedAt: null },
    },
  });

  const roleCode = (userRole?.role.code ?? null) as RoleCode | null;
  const isAdmin = roleCode === ADMIN_ROLE_CODE;
  const permissions =
    userRole?.role.rolePermissions
      .map(({ permission }) => permission.name)
      .sort((left, right) => left.localeCompare(right)) ?? [];
  const roleName = userRole?.role.name ?? null;

  return {
    dataScope: getDataScope(roleCode, isAdmin),
    isAdmin,
    permissions,
    roleCode,
    roleName,
    roles: roleName ? [roleName] : [],
    userId,
  };
};

const getCachedSummary = (
  userId: string,
  options?: AuthorizationLookupOptions,
): AuthorizationSummary | null =>
  options?.cache?.summaryByUserId.get(userId) ?? null;

const setCachedSummary = (
  summary: AuthorizationSummary,
  options?: AuthorizationLookupOptions,
): AuthorizationSummary => {
  options?.cache?.summaryByUserId.set(summary.userId, summary);
  return summary;
};

export const buildObservationScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  const base = { deletedAt: null } satisfies Prisma.ObservationWhereInput;

  switch (access.dataScope) {
    case "ALL":
    case "AUDIT_SCOPE":
      return base;
    case "AREA":
      return {
        ...base,
        areaAssignments: {
          some:
            access.roleCode === "PROCESS_OWNER"
              ? { processOwnerUserId: access.userId }
              : { areaResponsibleUserId: access.userId },
        },
      };
    case "ASSIGNED":
      return {
        ...base,
        actionPlans: {
          some: { deletedAt: null, responsibleUserId: access.userId },
        },
      };
  }
};

export const buildObservationAreaScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput => {
  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return {};
  }
  if (access.dataScope === "AREA") {
    return access.roleCode === "PROCESS_OWNER"
      ? { processOwnerUserId: access.userId }
      : { areaResponsibleUserId: access.userId };
  }
  return {
    actionPlans: {
      some: { deletedAt: null, responsibleUserId: access.userId },
    },
  };
};

export const buildActionPlanScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ActionPlanWhereInput => {
  const base = { deletedAt: null } satisfies Prisma.ActionPlanWhereInput;

  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  if (access.dataScope === "AREA") {
    return {
      ...base,
      observationArea: buildObservationAreaScopeWhere(access),
    };
  }
  return { ...base, responsibleUserId: access.userId };
};

export const buildRemediationPlanScopeWhere = (
  access: AuthorizationSummary,
  observationId?: string,
): Prisma.RemediationPlanWhereInput => {
  const base = { deletedAt: null } satisfies Prisma.RemediationPlanWhereInput;
  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  return {
    ...base,
    observation: buildObservationScopeWhere(access),
    area: {
      observationAreas: {
        some: {
          ...buildObservationAreaScopeWhere(access),
          ...(observationId ? { observationId } : {}),
        },
      },
    },
  };
};

export const buildEvidenceScopeWhere = (
  access: AuthorizationSummary,
): Prisma.EvidenceFileWhereInput => {
  const base = { deletedAt: null } satisfies Prisma.EvidenceFileWhereInput;

  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  if (access.dataScope === "AREA") {
    return {
      ...base,
      OR: [
        { observationArea: buildObservationAreaScopeWhere(access) },
        { actionPlan: buildActionPlanScopeWhere(access) },
        { observation: buildObservationScopeWhere(access) },
      ],
    };
  }
  return {
    ...base,
    OR: [
      { actionPlan: buildActionPlanScopeWhere(access) },
      { observation: buildObservationScopeWhere(access) },
    ],
  };
};

export const buildProgressEvaluationScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ProgressEvaluationWhereInput => ({
  deletedAt: null,
  actionPlan: buildActionPlanScopeWhere(access),
});

export const buildExtensionRequestScopeWhere = (
  access: AuthorizationSummary,
): Prisma.DeadlineExtensionRequestWhereInput => {
  const base = {
    deletedAt: null,
  } satisfies Prisma.DeadlineExtensionRequestWhereInput;
  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  if (access.dataScope === "AREA") {
    return {
      ...base,
      OR: [
        { observationArea: buildObservationAreaScopeWhere(access) },
        { actionPlan: buildActionPlanScopeWhere(access) },
        { observation: buildObservationScopeWhere(access) },
      ],
    };
  }
  return {
    ...base,
    OR: [
      { requestedByUserId: access.userId },
      { actionPlan: buildActionPlanScopeWhere(access) },
    ],
  };
};

export const authorizationService = {
  can(access: AuthorizationSummary, permission: string): boolean {
    return access.isAdmin || access.permissions.includes(permission);
  },

  getAccessibleScope(
    access: AuthorizationSummary,
    resource: string,
  ): DataScope {
    void resource;
    return access.dataScope;
  },

  async getUserAuthorizationSummary(
    userId: string,
    options?: AuthorizationLookupOptions,
  ): Promise<AuthorizationSummary> {
    const cachedSummary = getCachedSummary(userId, options);
    if (cachedSummary) return cachedSummary;
    return setCachedSummary(await buildAuthorizationSummary(userId), options);
  },

  async getUserPermissions(
    userId: string,
    options?: AuthorizationLookupOptions,
  ): Promise<string[]> {
    return (await this.getUserAuthorizationSummary(userId, options))
      .permissions;
  },

  async hasPermission(
    userId: string,
    permission: string,
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    return (await this.getUserPermissions(userId, options)).includes(
      permission,
    );
  },

  async hasAnyPermission(
    userId: string,
    permissions: string[],
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    if (permissions.length === 0) return true;
    const userPermissions = new Set(
      await this.getUserPermissions(userId, options),
    );
    return permissions.some((permission) => userPermissions.has(permission));
  },

  async hasAllPermissions(
    userId: string,
    permissions: string[],
    options?: AuthorizationLookupOptions,
  ): Promise<boolean> {
    if (permissions.length === 0) return true;
    const userPermissions = new Set(
      await this.getUserPermissions(userId, options),
    );
    return permissions.every((permission) => userPermissions.has(permission));
  },
};

export const createAuthorizationRequestCache =
  (): AuthorizationRequestCache => ({
    summaryByUserId: new Map(),
  });
