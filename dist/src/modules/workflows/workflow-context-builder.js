import { canonicalizeWorkflowConditionField, normalizeWorkflowSimulationContext, } from "./workflow-rule-fields.js";
const cleanReference = (value) => {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
export const buildWorkflowSimulationContext = (context) => normalizeWorkflowSimulationContext(context);
const getContextReference = (context, reference) => {
    const normalizedReference = cleanReference(reference);
    if (!normalizedReference)
        return null;
    const field = canonicalizeWorkflowConditionField(normalizedReference);
    if (field)
        return cleanReference(context[field]);
    if (normalizedReference === "requesterUserId") {
        return cleanReference(context.requesterUserId);
    }
    if (normalizedReference === "responsibleUserId") {
        return cleanReference(context.responsibleUserId);
    }
    return null;
};
const baseProjection = (configuration) => ({
    fallbackApplied: false,
    kind: "UNRESOLVED",
    strategy: configuration.assignmentStrategy ?? "UNASSIGNED",
    warnings: [],
    errors: [],
});
export const resolveAssignmentProjection = (configuration, context, lookup = {}) => {
    const projection = baseProjection(configuration);
    const strategy = configuration.assignmentStrategy;
    switch (strategy) {
        case "FIXED_USER":
            {
                const userId = cleanReference(configuration.userId);
                if (!userId)
                    break;
                projection.kind = "USER";
                projection.userId = userId;
            }
            break;
        case "ROLE":
            {
                const roleId = cleanReference(configuration.roleId);
                if (!roleId)
                    break;
                projection.kind = "ROLE";
                projection.roleId = roleId;
            }
            break;
        case "AREA": {
            const areaId = cleanReference(configuration.areaId) ?? context.areaId;
            if (areaId) {
                projection.kind = "AREA";
                projection.areaId = areaId;
            }
            break;
        }
        case "RECORD_OWNER":
            projection.warnings.push("El propietario del registro no está disponible en este contexto de simulación.");
            break;
        case "OBSERVATION_RESPONSIBLE":
            if (context.responsibleUserId) {
                projection.kind = "USER";
                projection.userId = context.responsibleUserId;
            }
            break;
        case "REQUESTER":
            if (context.requesterUserId) {
                projection.kind = "USER";
                projection.userId = context.requesterUserId;
            }
            break;
        case "SUPERVISOR": {
            const areaId = configuration.areaId ?? context.areaId;
            const managerUserId = areaId
                ? lookup.areaManagerUserIds?.[areaId]
                : undefined;
            if (managerUserId && areaId) {
                projection.kind = "USER";
                projection.userId = managerUserId;
                projection.areaId = areaId;
            }
            break;
        }
        case "FIELD_REFERENCE": {
            const referencedValue = getContextReference(context, configuration.fieldReference);
            if (referencedValue) {
                projection.kind = "USER";
                projection.userId = referencedValue;
            }
            break;
        }
        case "MANAGEMENT":
            projection.errors.push("La estrategia MANAGEMENT no está disponible en esta fase.");
            break;
        case null:
        case undefined:
            projection.errors.push("El nodo no tiene una estrategia de asignación.");
            break;
        default:
            projection.errors.push("La estrategia de asignación no está soportada.");
            break;
    }
    if (projection.kind !== "UNRESOLVED") {
        return projection;
    }
    switch (configuration.fallbackStrategy) {
        case "ROLE":
            if (configuration.fallbackRoleId) {
                projection.fallbackApplied = true;
                projection.kind = "ROLE";
                projection.roleId = configuration.fallbackRoleId;
                projection.warnings.push("Se aplicó el rol de respaldo configurado.");
                return projection;
            }
            break;
        case "USER":
            if (configuration.fallbackUserId) {
                projection.fallbackApplied = true;
                projection.kind = "USER";
                projection.userId = configuration.fallbackUserId;
                projection.warnings.push("Se aplicó el usuario de respaldo configurado.");
                return projection;
            }
            break;
        case "ADMINISTRATOR":
            projection.fallbackApplied = true;
            projection.warnings.push("Se proyectó una escalada al administrador; no se resolvió un usuario concreto.");
            return projection;
        case "STOP":
        case null:
        case undefined:
            break;
    }
    projection.errors.push("No se pudo resolver un responsable concreto con la configuración disponible.");
    return projection;
};
export const conditionFieldForReference = (reference) => {
    if (!reference)
        return null;
    return canonicalizeWorkflowConditionField(reference);
};
//# sourceMappingURL=workflow-context-builder.js.map