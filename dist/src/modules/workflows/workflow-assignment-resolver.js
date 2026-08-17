import { getAllowlistedRuntimeReference, } from "./workflow-runtime-context.js";
const cleanReference = (value) => {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const getActiveUser = async (db, id) => db.user.findFirst({
    select: { id: true },
    where: { deletedAt: null, id, isActive: true },
});
const getActiveRole = async (db, id) => db.role.findFirst({
    select: { id: true },
    where: { deletedAt: null, id },
});
const getActiveArea = async (db, id) => db.area.findFirst({
    select: {
        id: true,
        managerUser: {
            select: { deletedAt: true, id: true, isActive: true },
        },
    },
    where: { active: true, deletedAt: null, id },
});
const userResolution = (strategy, userId, fallbackApplied = false, fallbackReason) => ({
    assignedUserId: userId,
    ...(fallbackReason ? { fallbackReason } : {}),
    fallbackApplied,
    strategy,
});
const roleResolution = (strategy, roleId, fallbackApplied = false, fallbackReason) => ({
    assignedRoleId: roleId,
    ...(fallbackReason ? { fallbackReason } : {}),
    fallbackApplied,
    strategy,
});
const areaResolution = (strategy, areaId, managerUserId, fallbackApplied = false, fallbackReason) => ({
    assignedAreaId: areaId,
    assignedUserId: managerUserId,
    ...(fallbackReason ? { fallbackReason } : {}),
    fallbackApplied,
    strategy,
});
const resolveConfiguredUser = async (db, strategy, userId) => {
    if (!userId)
        return null;
    const user = await getActiveUser(db, userId);
    return user ? userResolution(strategy, user.id) : null;
};
const resolveConfiguredRole = async (db, strategy, roleId) => {
    if (!roleId)
        return null;
    const role = await getActiveRole(db, roleId);
    return role ? roleResolution(strategy, role.id) : null;
};
const resolveConfiguredArea = async (db, strategy, areaId) => {
    if (!areaId)
        return null;
    const area = await getActiveArea(db, areaId);
    const manager = area?.managerUser;
    if (!area || !manager || !manager.isActive || manager.deletedAt)
        return null;
    return areaResolution(strategy, area.id, manager.id);
};
const resolveDirectAssignment = async (db, configuration, context) => {
    const strategy = configuration.assignmentStrategy;
    switch (strategy) {
        case "FIXED_USER":
            return resolveConfiguredUser(db, strategy, cleanReference(configuration.userId));
        case "ROLE":
            return resolveConfiguredRole(db, strategy, cleanReference(configuration.roleId));
        case "AREA":
            return resolveConfiguredArea(db, strategy, cleanReference(configuration.areaId) ?? cleanReference(context.areaId));
        case "RECORD_OWNER":
            return resolveConfiguredUser(db, strategy, cleanReference(context.custom.recordOwnerUserId));
        case "OBSERVATION_RESPONSIBLE":
            return resolveConfiguredUser(db, strategy, cleanReference(context.responsibleUserId) ??
                cleanReference(context.custom.observationResponsibleUserId));
        case "REQUESTER":
            return resolveConfiguredUser(db, strategy, cleanReference(context.requesterUserId));
        case "SUPERVISOR":
            return resolveConfiguredArea(db, strategy, cleanReference(configuration.areaId) ?? cleanReference(context.areaId));
        case "FIELD_REFERENCE":
            return resolveConfiguredUser(db, strategy, getAllowlistedRuntimeReference(context, configuration.fieldReference));
        case null:
        case undefined:
        default:
            return null;
    }
};
const resolveFallback = async (db, configuration, reason) => {
    switch (configuration.fallbackStrategy) {
        case "USER": {
            const resolved = await resolveConfiguredUser(db, "FALLBACK_USER", cleanReference(configuration.fallbackUserId));
            return resolved
                ? {
                    ...resolved,
                    fallbackApplied: true,
                    fallbackReason: reason,
                }
                : null;
        }
        case "ROLE": {
            const resolved = await resolveConfiguredRole(db, "FALLBACK_ROLE", cleanReference(configuration.fallbackRoleId));
            return resolved
                ? {
                    ...resolved,
                    fallbackApplied: true,
                    fallbackReason: reason,
                }
                : null;
        }
        case "ADMINISTRATOR": {
            const adminRole = await db.role.findFirst({
                select: { id: true },
                where: { deletedAt: null, name: "Admin" },
            });
            return adminRole
                ? roleResolution("FALLBACK_ADMINISTRATOR", adminRole.id, true, reason)
                : null;
        }
        case "STOP":
        case null:
        case undefined:
            return null;
    }
};
export const resolveRuntimeAssignment = async ({ configuration, context, db, }) => {
    const direct = await resolveDirectAssignment(db, configuration, context);
    if (direct)
        return direct;
    const strategy = (configuration.assignmentStrategy ?? "UNASSIGNED");
    const reason = strategy === "MANAGEMENT"
        ? "La estrategia MANAGEMENT no está disponible en el runtime."
        : `No se pudo resolver la asignación ${strategy}.`;
    const fallback = await resolveFallback(db, configuration, reason);
    if (fallback)
        return fallback;
    return {
        fallbackApplied: false,
        fallbackReason: reason,
        strategy,
    };
};
//# sourceMappingURL=workflow-assignment-resolver.js.map