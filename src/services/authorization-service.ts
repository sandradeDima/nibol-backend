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

export type AuthorizationAssignmentContext = {
  areaResponsibleUserId?: string | null;
  executorUserId?: string | null;
  processOwnerUserId?: string | null;
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

const OPERATIONAL_ROLE_RANK: Partial<Record<RoleCode, number>> = {
  AREA_RESPONSIBLE: 0,
  PROCESS_OWNER: 1,
  EXECUTOR: 2,
};

const CONTEXTUAL_OPERATIONAL_PERMISSIONS = new Set([
  "action_plans.create",
  "action_plans.edit",
  "action_plans.submit_to_audit",
  "action_plans.view",
  "action_plans.history.view",
  "deadline_extensions.approve",
  "deadline_extensions.reject",
  "deadline_extensions.request",
  "deadline_extensions.view",
  "evidence.create",
  "evidence.view",
  "observations.history.view",
  "observations.view",
  "progress_evaluations.view",
  "recommended_action_plans.view",
  "reports.view",
  "workflow_tasks.approve",
  "workflow_tasks.complete",
  "workflow_tasks.reject",
  "workflow_tasks.request_correction",
  "workflow_tasks.view",
]);

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

const getAreaAssignmentPredicates = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput[] => {
  if (access.roleCode === "AREA_RESPONSIBLE") {
    return [
      { areaResponsibleUserId: access.userId },
      { processOwnerUserId: access.userId },
    ];
  }
  if (access.roleCode === "PROCESS_OWNER") {
    return [{ processOwnerUserId: access.userId }];
  }
  return [];
};

const getAreaAssignmentWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput | null => {
  const assignments = getAreaAssignmentPredicates(access);
  if (assignments.length === 1) return assignments[0] ?? null;
  return assignments.length ? { OR: assignments } : null;
};

const getAssignedOperationalRoleCodes = (
  access: AuthorizationSummary,
  assignments: AuthorizationAssignmentContext,
): RoleCode[] => {
  const platformRank = access.roleCode
    ? OPERATIONAL_ROLE_RANK[access.roleCode]
    : undefined;
  if (platformRank === undefined) return [];

  return (
    Object.entries({
      AREA_RESPONSIBLE: assignments.areaResponsibleUserId,
      PROCESS_OWNER: assignments.processOwnerUserId,
      EXECUTOR: assignments.executorUserId,
    }) as Array<[RoleCode, string | null | undefined]>
  )
    .filter(
      ([roleCode, userId]) =>
        userId === access.userId &&
        platformRank <= (OPERATIONAL_ROLE_RANK[roleCode] ?? -1),
    )
    .map(([roleCode]) => roleCode);
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
      return {
        ...base,
        OR: [
          ...(areaAssignments.length
            ? [
                {
                  areaAssignments: {
                    some:
                      areaAssignments.length === 1
                        ? (areaAssignments[0] ?? {})
                        : { OR: areaAssignments },
                  },
                },
              ]
            : []),
          { actionPlans: { some: assignedActionPlanWhere(access) } },
        ],
      };
    }
    case "ASSIGNED": {
      const areaAssignments = getAreaAssignmentPredicates(access);
      return {
        ...base,
        OR: [
          ...(areaAssignments.length
            ? [{ areaAssignments: { some: { OR: areaAssignments } } }]
            : []),
          { actionPlans: { some: assignedActionPlanWhere(access) } },
        ],
      };
    }
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
  const areaAssignments = getAreaAssignmentPredicates(access);
  return {
    ...base,
    OR: [
      ...areaAssignments,
      { actionPlans: { some: assignedActionPlanWhere(access) } },
    ],
  };
};

export const buildAssignedObservationAreaScopeWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationAreaWhereInput => {
  const base = {
    observation: { deletedAt: null },
  } satisfies Prisma.ObservationAreaWhereInput;
  if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
    return base;
  }
  return {
    ...base,
    ...(getAreaAssignmentWhere(access) ?? { id: { in: [] } }),
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
  const areaAssignment = getAreaAssignmentWhere(access);
  return {
    ...base,
    OR: [
      ...(areaAssignment ? [{ observationArea: areaAssignment }] : []),
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
  const areaAssignment = getAreaAssignmentWhere(access) ?? { id: { in: [] } };
  return {
    ...base,
    observation: buildObservationScopeWhere(access),
    area: {
      observationAreas: {
        some: {
          ...areaAssignment,
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
  const areaAssignment = getAreaAssignmentWhere(access);
  return {
    ...base,
    OR: [
      { actionPlan: buildActionPlanScopeWhere(access) },
      {
        progressEvaluation: {
          actionPlan: buildActionPlanScopeWhere(access),
        },
      },
      ...(areaAssignment
        ? [
            {
              observationArea: {
                observation: { deletedAt: null },
                ...areaAssignment,
              },
            },
            {
              actionPlanId: null,
              observationAreaId: null,
              observation: {
                deletedAt: null,
                areaAssignments: { some: areaAssignment },
              },
            },
          ]
        : []),
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
  const areaAssignment = getAreaAssignmentWhere(access);
  return {
    ...base,
    OR: [
      { requestedByUserId: access.userId },
      { actionPlan: buildActionPlanScopeWhere(access) },
      ...(areaAssignment
        ? [
            {
              observationArea: {
                observation: { deletedAt: null },
                ...areaAssignment,
              },
            },
            {
              actionPlanId: null,
              observationAreaId: null,
              observation: {
                deletedAt: null,
                areaAssignments: { some: areaAssignment },
              },
            },
          ]
        : []),
    ],
  };
};

export const authorizationService = {
  can(access: AuthorizationSummary, permission: string): boolean {
    return access.isAdmin || access.permissions.includes(permission);
  },

  async canForAssignments(
    access: AuthorizationSummary,
    permission: string,
    assignments: AuthorizationAssignmentContext,
    inheritDownward = true,
  ): Promise<boolean> {
    if (access.isAdmin) return true;
    if (
      !access.roleCode ||
      OPERATIONAL_ROLE_RANK[access.roleCode] === undefined
    ) {
      return this.can(access, permission);
    }
    const assignedRoleCodes = getAssignedOperationalRoleCodes(
      access,
      assignments,
    );
    if (!assignedRoleCodes.length) return false;

    if (
      assignedRoleCodes.includes(access.roleCode as RoleCode) &&
      access.permissions.includes(permission)
    ) {
      return true;
    }

    if (
      !inheritDownward ||
      !CONTEXTUAL_OPERATIONAL_PERMISSIONS.has(permission)
    ) {
      return false;
    }
    const inheritedRoleCodes = assignedRoleCodes.filter(
      (roleCode) => roleCode !== access.roleCode,
    );
    if (!inheritedRoleCodes.length) return false;

    const roles = await prisma.role.findMany({
      select: {
        rolePermissions: {
          select: { permission: { select: { name: true } } },
          where: { permission: { deletedAt: null, name: permission } },
        },
      },
      where: { code: { in: inheritedRoleCodes }, deletedAt: null },
    });
    return roles.some((role) => role.rolePermissions.length > 0);
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
