import { prisma } from "../utils/prisma.js";
import { buildDateRangeFilter, deriveAuditAction, parseDatabaseJson, titleCaseEntityType, toDatabaseJson, } from "./logging-utils.js";
const buildOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "createdAt":
            return {
                createdAt: sortDirection,
            };
        case "entityId":
            return {
                entityId: sortDirection,
            };
        case "entityType":
            return {
                entityType: sortDirection,
            };
    }
};
const buildWhereClause = (query) => {
    const createdAt = buildDateRangeFilter(query.dateFrom, query.dateTo);
    return {
        ...(query.entityType
            ? {
                entityType: query.entityType,
            }
            : {}),
        ...(query.userId
            ? {
                changedById: query.userId,
            }
            : {}),
        ...(createdAt
            ? {
                createdAt,
            }
            : {}),
        ...(query.search.length > 0
            ? {
                OR: [
                    {
                        entityId: {
                            contains: query.search,
                        },
                    },
                    {
                        entityType: {
                            contains: query.search,
                        },
                    },
                    {
                        changedBy: {
                            email: {
                                contains: query.search,
                            },
                        },
                    },
                    {
                        changedBy: {
                            name: {
                                contains: query.search,
                            },
                        },
                    },
                ],
            }
            : {}),
    };
};
export const auditLogService = {
    async create(payload, options) {
        const db = options?.db ?? prisma;
        await db.auditLog.create({
            data: {
                entityType: payload.entityType,
                ...(payload.userId
                    ? {
                        changedBy: {
                            connect: {
                                id: payload.userId,
                            },
                        },
                    }
                    : {}),
                ...(payload.entityId !== undefined
                    ? {
                        entityId: payload.entityId,
                    }
                    : {}),
                ...(payload.newValues !== undefined
                    ? {
                        newValues: toDatabaseJson(payload.newValues),
                    }
                    : {}),
                ...(payload.oldValues !== undefined
                    ? {
                        oldValues: toDatabaseJson(payload.oldValues),
                    }
                    : {}),
            },
        });
    },
    async listAuditLogs(query) {
        const where = buildWhereClause(query);
        const auditLogs = await prisma.auditLog.findMany({
            orderBy: buildOrderBy(query.sortBy, query.sortDirection),
            select: {
                changedBy: {
                    select: {
                        email: true,
                        id: true,
                        name: true,
                    },
                },
                createdAt: true,
                entityId: true,
                entityType: true,
                id: true,
                newValues: true,
                oldValues: true,
            },
            where,
        });
        const decodedAuditLogs = auditLogs.map((auditLog) => ({
            ...auditLog,
            newValues: parseDatabaseJson(auditLog.newValues, "audit_logs.new_values"),
            oldValues: parseDatabaseJson(auditLog.oldValues, "audit_logs.old_values"),
        }));
        const filteredAuditLogs = decodedAuditLogs.filter((auditLog) => {
            if (!query.action) {
                return true;
            }
            return (deriveAuditAction(auditLog.oldValues, auditLog.newValues) ===
                query.action);
        });
        const total = filteredAuditLogs.length;
        const startIndex = (query.page - 1) * query.perPage;
        const pageLogs = filteredAuditLogs.slice(startIndex, startIndex + query.perPage);
        return {
            data: pageLogs.map((auditLog) => ({
                action: deriveAuditAction(auditLog.oldValues, auditLog.newValues),
                changedBy: auditLog.changedBy,
                createdAt: auditLog.createdAt.toISOString(),
                entityId: auditLog.entityId,
                entityType: titleCaseEntityType(auditLog.entityType),
                id: auditLog.id,
                newValues: auditLog.newValues,
                oldValues: auditLog.oldValues,
            })),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
};
//# sourceMappingURL=audit-log-service.js.map