import { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../utils/prisma.js";
import {
  buildDateRangeFilter,
  deriveAuditAction,
  titleCaseEntityType,
  toLogJsonValue,
  type LogActorContext,
} from "./logging-utils.js";

type AuditLogWriter = {
  auditLog: {
    create: typeof prisma.auditLog.create;
  };
};

type AuditLogPayload = LogActorContext & {
  entityId?: string | null;
  entityType: string;
  newValues?: unknown;
  oldValues?: unknown;
};

export type ListAuditLogsResult = {
  data: Array<{
    action: "Created" | "Deleted" | "Updated";
    changedBy: {
      email: string;
      id: string;
      name: string;
    } | null;
    createdAt: string;
    entityId: string | null;
    entityType: string;
    id: string;
    newValues: unknown;
    oldValues: unknown;
  }>;
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
};

type ListAuditLogsQuery = {
  action: "Created" | "Deleted" | "Updated" | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  entityType: string | undefined;
  page: number;
  perPage: number;
  search: string;
  sortBy: "createdAt" | "entityId" | "entityType";
  sortDirection: "asc" | "desc";
  userId: string | undefined;
};

const buildOrderBy = (
  sortBy: ListAuditLogsQuery["sortBy"],
  sortDirection: ListAuditLogsQuery["sortDirection"],
): Prisma.AuditLogOrderByWithRelationInput => {
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

const buildWhereClause = (
  query: Omit<ListAuditLogsQuery, "action">,
): Prisma.AuditLogWhereInput => {
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
  async create(
    payload: AuditLogPayload,
    options?: {
      db?: AuditLogWriter;
    },
  ): Promise<void> {
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
              newValues: toLogJsonValue(payload.newValues) ?? Prisma.JsonNull,
            }
          : {}),
        ...(payload.oldValues !== undefined
          ? {
              oldValues: toLogJsonValue(payload.oldValues) ?? Prisma.JsonNull,
            }
          : {}),
      },
    });
  },

  async listAuditLogs(query: ListAuditLogsQuery): Promise<ListAuditLogsResult> {
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

    const filteredAuditLogs = auditLogs.filter((auditLog) => {
      if (!query.action) {
        return true;
      }

      return deriveAuditAction(auditLog.oldValues, auditLog.newValues) === query.action;
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
