import { Prisma } from "../../generated/prisma/client.js";

import { prisma } from "../utils/prisma.js";
import {
  buildDateRangeFilter,
  titleCaseEntityType,
  toLogJsonValue,
  type LogActorContext,
} from "./logging-utils.js";

type ActivityLogWriter = {
  activityLog: {
    create: typeof prisma.activityLog.create;
  };
};

type ActivityLogPayload = LogActorContext & {
  action: string;
  entityId?: string | null;
  entityType: string;
  metadata?: unknown;
};

export type ListActivityLogsResult = {
  data: Array<{
    action: string;
    createdAt: string;
    entityId: string | null;
    entityType: string;
    id: string;
    ipAddress: string | null;
    metadata: unknown;
    user: {
      email: string;
      id: string;
      name: string;
    } | null;
  }>;
  pagination: {
    page: number;
    perPage: number;
    total: number;
  };
};

type ListActivityLogsQuery = {
  action: string | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  entityType: string | undefined;
  page: number;
  perPage: number;
  search: string;
  sortBy: "action" | "createdAt" | "entityId" | "entityType" | "ipAddress";
  sortDirection: "asc" | "desc";
  userId: string | undefined;
};

const buildOrderBy = (
  sortBy: ListActivityLogsQuery["sortBy"],
  sortDirection: ListActivityLogsQuery["sortDirection"],
): Prisma.ActivityLogOrderByWithRelationInput => {
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

const buildWhereClause = (
  query: ListActivityLogsQuery,
): Prisma.ActivityLogWhereInput => {
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
  async listActivityLogs(query: ListActivityLogsQuery): Promise<ListActivityLogsResult> {
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

  async log(
    payload: ActivityLogPayload,
    options?: {
      db?: ActivityLogWriter;
    },
  ): Promise<void> {
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

  async logSystemEvent(
    payload: Omit<ActivityLogPayload, "userId">,
    options?: {
      db?: ActivityLogWriter;
    },
  ): Promise<void> {
    await this.log(
      {
        ...payload,
        userId: null,
      },
      options,
    );
  },

  async logUserAction(
    payload: ActivityLogPayload,
    options?: {
      db?: ActivityLogWriter;
    },
  ): Promise<void> {
    await this.log(payload, options);
  },
};
