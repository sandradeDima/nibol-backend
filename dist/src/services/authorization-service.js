import { ADMIN_ROLE_CODE } from "../permissions/role-codes.js";
import { prisma } from "../utils/prisma.js";
const getDataScope = (roleCode, isAdmin) => {
    if (isAdmin)
        return "ALL";
    if (roleCode === "AUDITOR" || roleCode === "AUDIT_CHIEF")
        return "AUDIT_SCOPE";
    if (roleCode === "PROCESS_OWNER" || roleCode === "AREA_RESPONSIBLE") {
        return "AREA";
    }
    return "ASSIGNED";
};
const buildAuthorizationSummary = async (userId) => {
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
    const roleCode = (userRole?.role.code ?? null);
    const isAdmin = roleCode === ADMIN_ROLE_CODE;
    const permissions = userRole?.role.rolePermissions
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
const getCachedSummary = (userId, options) => options?.cache?.summaryByUserId.get(userId) ?? null;
const setCachedSummary = (summary, options) => {
    options?.cache?.summaryByUserId.set(summary.userId, summary);
    return summary;
};
export const buildObservationScopeWhere = (access) => {
    const base = { deletedAt: null };
    switch (access.dataScope) {
        case "ALL":
        case "AUDIT_SCOPE":
            return base;
        case "AREA":
            return {
                ...base,
                areaAssignments: {
                    some: access.roleCode === "PROCESS_OWNER"
                        ? { processOwnerUserId: access.userId }
                        : { areaResponsibleUserId: access.userId },
                },
            };
        case "ASSIGNED":
            return {
                ...base,
                actionPlans: {
                    some: {
                        OR: [
                            { remediationPlanId: null },
                            { remediationPlan: { deletedAt: null } },
                        ],
                        deletedAt: null,
                        responsibleUserId: access.userId,
                    },
                },
            };
    }
};
export const buildObservationAreaScopeWhere = (access) => {
    const base = {
        observation: { deletedAt: null },
    };
    if (access.dataScope === "ALL" || access.dataScope === "AUDIT_SCOPE") {
        return base;
    }
    if (access.dataScope === "AREA") {
        return {
            ...base,
            ...(access.roleCode === "PROCESS_OWNER"
                ? { processOwnerUserId: access.userId }
                : { areaResponsibleUserId: access.userId }),
        };
    }
    return {
        ...base,
        actionPlans: {
            some: {
                OR: [
                    { remediationPlanId: null },
                    { remediationPlan: { deletedAt: null } },
                ],
                deletedAt: null,
                responsibleUserId: access.userId,
            },
        },
    };
};
export const buildActionPlanScopeWhere = (access) => {
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
    };
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
export const buildRemediationPlanScopeWhere = (access, observationId) => {
    const base = {
        deletedAt: null,
        observation: { deletedAt: null },
    };
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
export const buildEvidenceScopeWhere = (access) => {
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
    };
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
export const buildProgressEvaluationScopeWhere = (access) => ({
    deletedAt: null,
    actionPlan: buildActionPlanScopeWhere(access),
});
export const buildExtensionRequestScopeWhere = (access) => {
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
    };
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
    can(access, permission) {
        return access.isAdmin || access.permissions.includes(permission);
    },
    getAccessibleScope(access, resource) {
        void resource;
        return access.dataScope;
    },
    async getUserAuthorizationSummary(userId, options) {
        const cachedSummary = getCachedSummary(userId, options);
        if (cachedSummary)
            return cachedSummary;
        return setCachedSummary(await buildAuthorizationSummary(userId), options);
    },
    async getUserPermissions(userId, options) {
        return (await this.getUserAuthorizationSummary(userId, options))
            .permissions;
    },
    async hasPermission(userId, permission, options) {
        return (await this.getUserPermissions(userId, options)).includes(permission);
    },
    async hasAnyPermission(userId, permissions, options) {
        if (permissions.length === 0)
            return true;
        const userPermissions = new Set(await this.getUserPermissions(userId, options));
        return permissions.some((permission) => userPermissions.has(permission));
    },
    async hasAllPermissions(userId, permissions, options) {
        if (permissions.length === 0)
            return true;
        const userPermissions = new Set(await this.getUserPermissions(userId, options));
        return permissions.every((permission) => userPermissions.has(permission));
    },
};
export const createAuthorizationRequestCache = () => ({
    summaryByUserId: new Map(),
});
//# sourceMappingURL=authorization-service.js.map