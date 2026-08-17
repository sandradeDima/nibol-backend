import type { Prisma } from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { observationDeadlineService } from "../observations/observation-deadline.service.js";
import type { z } from "zod";
import type {
  createAuditReportSchema,
  listAuditReportsQuerySchema,
  updateAuditReportSchema,
} from "./audit-reports.validators.js";

type CreateInput = z.infer<typeof createAuditReportSchema>;
type UpdateInput = z.infer<typeof updateAuditReportSchema>;
type ListQuery = z.infer<typeof listAuditReportsQuerySchema>;

const include = {
  _count: { select: { observations: { where: { deletedAt: null } } } },
  createdByUser: {
    select: { email: true, id: true, jobTitle: true, name: true },
  },
  observations: {
    select: {
      actionPlans: {
        select: { progressPercent: true },
        where: { deletedAt: null },
      },
      riskLevel: { select: { key: true, name: true } },
    },
    where: { deletedAt: null },
  },
} satisfies Prisma.AuditReportInclude;

type AuditReportRecord = Prisma.AuditReportGetPayload<{
  include: typeof include;
}>;

const format = (record: AuditReportRecord) => {
  const plans = record.observations.flatMap(
    (observation) => observation.actionPlans,
  );
  const completionPercent = plans.length
    ? Math.round(
        plans.reduce((sum, plan) => sum + plan.progressPercent, 0) /
          plans.length,
      )
    : 0;
  const byRiskLevel = record.observations.reduce<{ [key: string]: number }>(
    (counts, observation) => {
      counts[observation.riskLevel.name] =
        (counts[observation.riskLevel.name] ?? 0) + 1;
      return counts;
    },
    {},
  );
  return {
    completionPercent,
    createdAt: record.createdAt.toISOString(),
    createdByUser: record.createdByUser,
    id: record.id,
    observationCount: record._count.observations,
    observationsByRiskLevel: byRiskLevel,
    reportDate: record.reportDate.toISOString(),
    reportNumber: record.reportNumber,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const find = async (id: string): Promise<AuditReportRecord> => {
  const record = await prisma.auditReport.findFirst({
    include,
    where: { deletedAt: null, id },
  });
  if (!record) throw new AppError("Audit report not found.", 404);
  return record;
};

export const auditReportsService = {
  async create(input: CreateInput, createdByUserId: string) {
    try {
      const record = await prisma.auditReport.create({
        data: { ...input, createdByUserId },
        include,
      });
      return format(record);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new AppError(
          "An audit report with that number already exists.",
          409,
        );
      throw error;
    }
  },

  async getById(id: string) {
    const report = format(await find(id));
    const observations = await prisma.observation.findMany({
      orderBy: { observationNumber: "asc" },
      select: {
        currentDueDate: true,
        id: true,
        observationNumber: true,
        progressPercent: true,
        riskLevel: { select: { name: true } },
        status: { select: { name: true } },
        title: true,
      },
      where: { auditReportId: id, deletedAt: null },
    });
    return {
      ...report,
      observations: observations.map((observation) => ({
        ...observation,
        currentDueDate: observation.currentDueDate.toISOString(),
      })),
    };
  },

  async list(query: ListQuery) {
    const where: Prisma.AuditReportWhereInput = {
      deletedAt: null,
      ...(query.dateFrom || query.dateTo
        ? {
            reportDate: {
              ...(query.dateFrom ? { gte: query.dateFrom } : {}),
              ...(query.dateTo ? { lte: query.dateTo } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { reportNumber: { contains: query.search } },
              { title: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      prisma.auditReport.findMany({
        include,
        orderBy: [{ reportDate: "desc" }, { reportNumber: "asc" }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
      prisma.auditReport.count({ where }),
    ]);
    return {
      data: records.map(format),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  },

  async remove(id: string) {
    const record = await find(id);
    if (record._count.observations > 0) {
      throw new AppError(
        "An audit report with observations cannot be archived.",
        409,
      );
    }
    const previous = format(record);
    await prisma.auditReport.update({
      data: { deletedAt: new Date() },
      where: { id },
    });
    return previous;
  },

  async update(id: string, input: UpdateInput) {
    const previous = format(await find(id));
    try {
      await prisma.$transaction(async (tx) => {
        await tx.auditReport.update({
          data: {
            ...(input.reportDate !== undefined
              ? { reportDate: input.reportDate }
              : {}),
            ...(input.reportNumber !== undefined
              ? { reportNumber: input.reportNumber }
              : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
          },
          where: { id },
        });
        if (input.reportDate) {
          const observations = await tx.observation.findMany({
            select: {
              _count: {
                select: { actionPlans: { where: { deletedAt: null } } },
              },
              deadlineExtensionRequests: {
                select: { id: true },
                where: { deletedAt: null },
              },
              id: true,
              riskLevel: { select: { key: true } },
            },
            where: { auditReportId: id, deletedAt: null },
          });
          for (const observation of observations) {
            if (
              observation._count.actionPlans > 0 ||
              observation.deadlineExtensionRequests.length > 0
            )
              continue;
            const deadline = observationDeadlineService.calculate(
              input.reportDate,
              observation.riskLevel.key,
            );
            await tx.observation.update({
              data: { currentDueDate: deadline, originalDueDate: deadline },
              where: { id: observation.id },
            });
          }
        }
      });
      return { current: format(await find(id)), previous };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002")
        throw new AppError(
          "An audit report with that number already exists.",
          409,
        );
      throw error;
    }
  },
};
