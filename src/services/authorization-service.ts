import type { Prisma } from "../../generated/prisma/client.js";

import { ADMIN_ROLE_CODE, type RoleCode } from "../permissions/role-codes.js";
import { prisma } from "../utils/prisma.js";

export type DataScope = "ALL" | "AUDIT_SCOPE" | "AREA" | "ASSIGNED";

export type AuthorizationSummary = {
  dataScope: DataScope;
  isAdmin: boolean;
  permissions: string[];
  roleCode: RoleCode | null;
  roleCodes?: RoleCode[];
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

const ROLE_CODE_PRIORITY: readonly RoleCode[] = [
  ADMIN_ROLE_CODE,
  "AUDITOR",
  "AUDIT_CHIEF",
  "PROCESS_OWNER",
  "AREA_RESPONSIBLE",
  "EXECUTOR",
];

type AssignedRole = {
  code: string;
  name: string;
  permissions: string[];
};

const recognizedRoleCodes = (roles: readonly AssignedRole[]): RoleCode[] =>
  ROLE_CODE_PRIORITY.filter((code) => roles.some((role) => role.code === code));

const getDataScope = (roleCodes: readonly RoleCode[]): DataScope => {
  if (roleCodes.includes(ADMIN_ROLE_CODE)) return "ALL";
  if (roleCodes.includes("AUDITOR") || roleCodes.includes("AUDIT_CHIEF"))
    return "AUDIT_SCOPE";
  if (
    roleCodes.includes("PROCESS_OWNER") ||
    roleCodes.includes("AREA_RESPONSIBLE")
  ) {
    return "AREA";
  }
  return "ASSIGNED";
};

export const buildAuthorizationSummaryFromRoles = (
  userId: string,
  roles: readonly AssignedRole[],
): AuthorizationSummary => {
  const roleCodes = recognizedRoleCodes(roles);
  const roleCode = roleCodes[0] ?? null;
  const primaryRole = roles.find((role) => role.code === roleCode);
  const isAdmin = roleCodes.includes(ADMIN_ROLE_CODE);
  return {
    dataScope: getDataScope(roleCodes),
    isAdmin,
    permissions: [...new Set(roles.flatMap((role) => role.permissions))].sort(
      (left, right) => left.localeCompare(right),
    ),
    roleCode,
    roleCodes,
    roleName: primaryRole?.name ?? null,
    roles: [...new Set(roles.map((role) => role.name))],
    userId,
  };
};

const buildAuthorizationSummary = async (
  userId: string,
): Promise<AuthorizationSummary> => {
  const userRoles = await prisma.userRole.findMany({
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

  return buildAuthorizationSummaryFromRoles(
    userId,
    userRoles.map(({ role }) => ({
      code: role.code,
      name: role.name,
      permissions: role.rolePermissions.map(
        ({ permission }) => permission.name,
      ),
    })),
  );
};

const getRoleCodes = (access: AuthorizationSummary): readonly RoleCode[] =>
  access.roleCodes ?? (access.roleCode ? [access.roleCode] : []);

const getAreaAssignmentPredicates = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput[] => {
  return [
    { processOwnerUserId: access.userId },
    { areaResponsibleUserId: access.userId },
  ];
};

const assignedActionPlanWhere = (
  access: AuthorizationSummary,
): Prisma.ActionPlanWhereInput => ({
  OR: [{ remediationPlanId: null }, { remediationPlan: { deletedAt: null } }],
  deletedAt: null,
  responsibleUserId: access.userId,
});

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
    case "AREA": {
      const areaAssignments = getAreaAssignmentPredicates(access);
      if (getRoleCodes(access).includes("EXECUTOR")) {
        return {
          ...base,
          OR: [
            {
              areaAssignments: {
                some:
                  areaAssignments.length === 1
                    ? (areaAssignments[0] ?? {})
                    : { OR: areaAssignments },
              },
            },
            { actionPlans: { some: assignedActionPlanWhere(access) } },
          ],
        };
      }
      return {
        ...base,
        areaAssignments: {
          some:
            areaAssignments.length === 1
              ? (areaAssignments[0] ?? {})
              : { OR: areaAssignments },
        },
      };
    }
    case "ASSIGNED":
      return {
        ...base,
        OR: [
          {
            areaAssignments: {
              some: { OR: getAreaAssignmentPredicates(access) },
            },
          },
          { actionPlans: { some: assignedActionPlanWhere(access) } },
        ],
      };
  }
};

export const buildObservationAreaScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput => {
  const base = {
    observation: { deletedAt: null },
  } satisfies Prisma.ObservationAreaWhereInput;
  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  if (access.dataScope === "AREA") {
    const areaAssignments = getAreaAssignmentPredicates(access);
    if (getRoleCodes(access).includes("EXECUTOR")) {
      return {
        ...base,
        OR: [
          ...areaAssignments,
          { actionPlans: { some: assignedActionPlanWhere(access) } },
        ],
      };
    }
    return {
      ...base,
      ...(areaAssignments.length === 1
        ? areaAssignments[0]
        : { OR: areaAssignments }),
    };
  }
  return {
    ...base,
    OR: [
      ...getAreaAssignmentPredicates(access),
      { actionPlans: { some: assignedActionPlanWhere(access) } },
    ],
  };
};

export const buildActionPlanScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ActionPlanWhereInput => {
  const base = {
    AND: [
      {
        OR: [
          { remediationPlanId: null },
          { remediationPlan: { deletedAt: null } },
        ],
      },
    ],
    deletedAt: null,
    observation: { deletedAt: null },
  } satisfies Prisma.ActionPlanWhereInput;

  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  if (access.dataScope === "AREA") {
    if (getRoleCodes(access).includes("EXECUTOR")) {
      return {
        ...base,
        OR: [
          { observationArea: buildObservationAreaScopeWhere(access) },
          { responsibleUserId: access.userId },
        ],
      };
    }
    return {
      ...base,
      observationArea: buildObservationAreaScopeWhere(access),
    };
  }
  return {
    ...base,
    OR: [
      { observationArea: buildObservationAreaScopeWhere(access) },
      { responsibleUserId: access.userId },
    ],
  };
};

export const buildRemediationPlanScopeWhere = (
  access: AuthorizationSummary,
  observationId?: string,
): Prisma.RemediationPlanWhereInput => {
  const base = {
    deletedAt: null,
    observation: { deletedAt: null },
  } satisfies Prisma.RemediationPlanWhereInput;
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
  const base = {
    AND: [
      {
        OR: [
          { actionPlanId: null },
          { actionPlan: buildActionPlanScopeWhere(access) },
        ],
      },
    ],
    deletedAt: null,
    observation: { deletedAt: null },
  } satisfies Prisma.EvidenceFileWhereInput;

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
    AND: [
      {
        OR: [
          { actionPlan: buildActionPlanScopeWhere(access) },
          { actionPlanId: null, observation: { deletedAt: null } },
          {
            actionPlanId: null,
            observationArea: { observation: { deletedAt: null } },
          },
        ],
      },
    ],
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
      { observationArea: buildObservationAreaScopeWhere(access) },
      { observation: buildObservationScopeWhere(access) },
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
