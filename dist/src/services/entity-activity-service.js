import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../utils/app-error.js";
export const ACTIVITY_ENTITY_TYPES = {
    comment: "COMMENT",
    commitment: "COMMITMENT",
    evidence: "EVIDENCE",
    extensionRequest: "EXTENSION_REQUEST",
    notification: "NOTIFICATION",
    observation: "OBSERVATION",
    plan: "REMEDIATION_PLAN",
    progressUpdate: "PROGRESS_UPDATE",
    system: "SYSTEM",
};
export const ACTIVITY_VISIBILITIES = {
    adminOnly: "ADMIN_ONLY",
    allAuthorized: "ALL_AUTHORIZED",
    areaVisible: "AREA_VISIBLE",
    auditOnly: "AUDIT_ONLY",
};
const REDACTED_KEY = /password|token|secret|credential|authorization|cookie|header|private|storedname|relativepath|filepath|ipaddress|useragent/i;
const safeValue = (value, key) => {
    if (key && (REDACTED_KEY.test(key) || key === "id" || key.endsWith("Id"))) {
        return null;
    }
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "bigint")
        return value.toString();
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.map((item) => safeValue(item)).filter((item) => item !== null);
    if (typeof value === "object") {
        const result = {};
        for (const [entryKey, entryValue] of Object.entries(value)) {
            const sanitized = safeValue(entryValue, entryKey);
            if (sanitized !== null)
                result[entryKey] = sanitized;
        }
        return result;
    }
    return String(value);
};
export const sanitizeActivityData = (value) => safeValue(value);
const asJson = (value) => safeValue(value) ?? Prisma.JsonNull;
const isSystemOperator = (access) => {
    if (access.isAdmin)
        return true;
    return access.roles.some((role) => /^(sistemas?|systems?)$/i.test(role.trim()));
};
const isAuditRole = (access) => access.roles.some((role) => /audit|auditor|auditoria/i.test(role));
const isManagerRole = (access) => access.roles.some((role) => /gerencia|manager|jefatura/i.test(role));
const activityScope = (access) => {
    if (isSystemOperator(access))
        return {};
    const observationScope = {
        OR: [
            { responsibleUserId: access.userId },
            { auditorUserId: access.userId },
            { area: { managerUserId: access.userId } },
            { commitments: { some: { responsibleUserId: access.userId } } },
            { remediationPlans: { some: { ownerUserId: access.userId } } },
        ],
    };
    if (isAuditRole(access)) {
        return {
            visibility: { in: [ACTIVITY_VISIBILITIES.allAuthorized, ACTIVITY_VISIBILITIES.areaVisible, ACTIVITY_VISIBILITIES.auditOnly] },
            OR: [{ observationId: null }, { observation: observationScope }],
        };
    }
    return {
        visibility: { in: [ACTIVITY_VISIBILITIES.allAuthorized, ACTIVITY_VISIBILITIES.areaVisible] },
        observation: isManagerRole(access)
            ? { area: { managerUserId: access.userId } }
            : observationScope,
    };
};
const dateFilter = (dateFrom, dateTo) => {
    const filter = {};
    if (dateFrom)
        filter.gte = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) {
        const end = new Date(`${dateTo}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        filter.lt = end;
    }
    return filter;
};
const buildWhere = (query, access) => {
    const observationFilters = [];
    if (query.areaId)
        observationFilters.push({ observation: { areaId: query.areaId } });
    if (query.observationCode)
        observationFilters.push({ observation: { code: { contains: query.observationCode } } });
    return {
        ...activityScope(access),
        ...(query.activityType ? { activityType: query.activityType } : {}),
        ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
        ...(query.dateFrom || query.dateTo ? { createdAt: dateFilter(query.dateFrom, query.dateTo) } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.observationId ? { observationId: query.observationId } : {}),
        ...(query.origin ? { actorType: query.origin } : {}),
        ...(observationFilters.length ? { AND: observationFilters } : {}),
        ...(query.role
            ? { actorUser: { userRoles: { some: { role: { name: { contains: query.role } } } } } }
            : {}),
        ...(query.search
            ? {
                OR: [
                    { title: { contains: query.search } },
                    { description: { contains: query.search } },
                    { action: { contains: query.search } },
                    { observation: { code: { contains: query.search } } },
                    { actorUser: { name: { contains: query.search } } },
                ],
            }
            : {}),
    };
};
const activitySelect = {
    action: true,
    activityType: true,
    actorType: true,
    actorUser: {
        select: {
            email: true,
            id: true,
            name: true,
            userRoles: { select: { role: { select: { name: true } } } },
        },
    },
    createdAt: true,
    description: true,
    entityId: true,
    entityType: true,
    id: true,
    metadataJson: true,
    newDataJson: true,
    observation: { select: { area: { select: { id: true, name: true } }, code: true, title: true } },
    previousDataJson: true,
    relatedAuditLogId: true,
    targetUrl: true,
    title: true,
    visibility: true,
};
const resolveObservationId = async (entityType, entityId) => {
    const normalized = entityType.toUpperCase();
    if (normalized === "OBSERVATION")
        return entityId;
    if (normalized === "REMEDIATION_PLAN") {
        return (await prisma.remediationPlan.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    if (normalized === "COMMITMENT") {
        return (await prisma.commitment.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    if (normalized === "PROGRESS_UPDATE") {
        return (await prisma.progressUpdate.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    if (normalized === "EVIDENCE") {
        return (await prisma.evidenceFile.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    if (normalized === "COMMENT") {
        return (await prisma.observationComment.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    if (normalized === "EXTENSION_REQUEST") {
        return (await prisma.deadlineExtensionRequest.findUnique({ where: { id: entityId }, select: { observationId: true } }))?.observationId ?? null;
    }
    return null;
};
const mapActivity = (activity, includeTechnicalDetails) => ({
    action: activity.action,
    activityType: activity.activityType,
    actor: activity.actorUser
        ? {
            email: activity.actorUser.email,
            id: includeTechnicalDetails ? activity.actorUser.id : null,
            name: activity.actorUser.name,
            roles: activity.actorUser.userRoles.map((item) => item.role.name),
        }
        : null,
    actorType: activity.actorType,
    area: activity.observation?.area ?? null,
    createdAt: activity.createdAt.toISOString(),
    description: activity.description,
    entityId: includeTechnicalDetails ? activity.entityId : null,
    entityType: activity.entityType,
    id: includeTechnicalDetails ? activity.id : undefined,
    metadata: activity.metadataJson,
    newData: activity.newDataJson,
    observation: activity.observation
        ? { code: activity.observation.code, title: activity.observation.title }
        : null,
    previousData: activity.previousDataJson,
    relatedAuditLogId: includeTechnicalDetails ? activity.relatedAuditLogId : null,
    targetUrl: activity.targetUrl,
    title: activity.title,
    visibility: activity.visibility,
});
export const entityActivityService = {
    async create(input, options) {
        const db = options?.db ?? prisma;
        const observationId = input.observationId ?? (await resolveObservationId(input.entityType, input.entityId));
        const data = {
            action: input.action,
            activityType: input.activityType,
            actorType: input.actorType ?? (input.actorUserId ? "USER" : "SYSTEM"),
            ...(input.actorUserId ? { actorUser: { connect: { id: input.actorUserId } } } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
            entityId: input.entityId,
            entityType: input.entityType,
            ...(input.metadata !== undefined ? { metadataJson: asJson(input.metadata) } : {}),
            ...(input.newData !== undefined ? { newDataJson: asJson(input.newData) } : {}),
            ...(observationId ? { observation: { connect: { id: observationId } } } : {}),
            ...(input.previousData !== undefined ? { previousDataJson: asJson(input.previousData) } : {}),
            ...(input.relatedAuditLogId ? { relatedAuditLogId: input.relatedAuditLogId } : {}),
            ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
            title: input.title,
            visibility: input.visibility ?? ACTIVITY_VISIBILITIES.allAuthorized,
        };
        try {
            await db.entityActivity.create({ data: data });
        }
        catch (error) {
            if (error.code === "P2002" && input.dedupeKey)
                return;
            throw error;
        }
    },
    async recordEntityChange(input) {
        return this.create({
            ...input,
            metadata: input.metadata ?? { fieldLabels: { statusId: "Estado", riskLevelId: "Nivel de riesgo", dueDate: "Fecha de vencimiento", responsibleUserId: "Responsable", areaId: "Área", progressPercent: "Porcentaje de avance" } },
            newData: input.newData,
            previousData: input.previousData,
        });
    },
    async list(query, access) {
        const where = buildWhere(query, access);
        const includeTechnicalDetails = Boolean(query.includeTechnicalDetails && isSystemOperator(access));
        const [total, activities] = await prisma.$transaction([
            prisma.entityActivity.count({ where }),
            prisma.entityActivity.findMany({
                orderBy: { createdAt: "desc" },
                select: activitySelect,
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
                where,
            }),
        ]);
        return {
            data: activities.map((activity) => mapActivity(activity, includeTechnicalDetails)),
            pagination: { page: query.page, perPage: query.pageSize, total },
        };
    },
    async assertEntityExists(entityType, entityId, access) {
        const result = await this.list({ entityType, entityId, page: 1, pageSize: 1, search: "" }, access);
        if (result.pagination.total === 0)
            throw new AppError("No se encontró historial para la entidad.", 404);
        return result;
    },
    async export(query, access) {
        const result = await this.list({ ...query, page: 1, pageSize: 5000 }, access);
        const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
        const rows = result.data.map((item) => [
            new Date(item.createdAt).toLocaleDateString("es-BO"),
            new Date(item.createdAt).toLocaleTimeString("es-BO"),
            item.observation?.code ?? "",
            item.entityType,
            item.activityType,
            item.action,
            item.description ?? item.title,
            item.actor?.name ?? (item.actorType === "CRON" ? "Proceso automático" : "Sistema"),
            item.actor?.roles?.join(", ") ?? "",
            item.area?.name ?? "",
            item.actorType,
        ].map(escape).join(","));
        return ["\uFEFFFecha,Hora,Código de observación,Entidad,Tipo de actividad,Acción,Descripción,Usuario,Rol,Área,Origen", ...rows].join("\n");
    },
};
//# sourceMappingURL=entity-activity-service.js.map