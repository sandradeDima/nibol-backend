import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../utils/prisma.js";
import { buildDateRangeFilter, titleCaseEntityType, toLogJsonValue, } from "./logging-utils.js";
const buildOrderBy = (sortBy, sortDirection) => {
    switch (sortBy) {
        case "action":
            return {
                action: sortDirection,
            };
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
        case "ipAddress":
            return {
                ipAddress: sortDirection,
            };
    }
};
const buildWhereClause = (query) => {
    const createdAt = buildDateRangeFilter(query.dateFrom, query.dateTo);
    return {
        ...(query.action
            ? {
                action: query.action,
            }
            : {}),
        ...(createdAt
            ? {
                createdAt,
            }
            : {}),
        ...(query.entityType
            ? {
                entityType: query.entityType,
            }
            : {}),
        ...(query.userId
            ? {
                userId: query.userId,
            }
            : {}),
        ...(query.search.length > 0
            ? {
                OR: [
                    {
                        action: {
                            contains: query.search,
                        },
                    },
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
                        ipAddress: {
                            contains: query.search,
                        },
                    },
                    {
                        user: {
                            email: {
                                contains: query.search,
                            },
                        },
                    },
                    {
                        user: {
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
export const activityLogService = {
    async listActivityLogs(query) {
        const where = buildWhereClause(query);
        const [total, activityLogs] = await prisma.$transaction([
            prisma.activityLog.count({
                where,
            }),
            prisma.activityLog.findMany({
                orderBy: buildOrderBy(query.sortBy, query.sortDirection),
                select: {
                    action: true,
                    createdAt: true,
                    entityId: true,
                    entityType: true,
                    id: true,
                    ipAddress: true,
                    metadata: true,
                    user: {
                        select: {
                            email: true,
                            id: true,
                            name: true,
                        },
                    },
                },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
        ]);
        return {
            data: activityLogs.map((activityLog) => ({
                action: activityLog.action,
                createdAt: activityLog.createdAt.toISOString(),
                entityId: activityLog.entityId,
                entityType: titleCaseEntityType(activityLog.entityType),
                id: activityLog.id,
                ipAddress: activityLog.ipAddress,
                metadata: activityLog.metadata,
                user: activityLog.user,
            })),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async log(payload, options) {
        const db = options?.db ?? prisma;
        await db.activityLog.create({
            data: {
                action: payload.action,
                entityType: payload.entityType,
                ...(payload.entityId !== undefined
                    ? {
                        entityId: payload.entityId,
                    }
                    : {}),
                ...(payload.ipAddress !== undefined
                    ? {
                        ipAddress: payload.ipAddress,
                    }
                    : {}),
                ...(payload.metadata !== undefined
                    ? {
                        metadata: toLogJsonValue(payload.metadata) ?? Prisma.JsonNull,
                    }
                    : {}),
                ...(payload.userId
                    ? {
                        user: {
                            connect: {
                                id: payload.userId,
                            },
                        },
                    }
                    : {}),
            },
        });
    },
    async logSystemEvent(payload, options) {
        await this.log({
            ...payload,
            userId: null,
        }, options);
    },
    async logUserAction(payload, options) {
        await this.log(payload, options);
    },
};
//# sourceMappingURL=activity-log-service.js.map