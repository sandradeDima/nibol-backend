import type { Prisma } from "../../../generated/prisma/client.js";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { observationAggregationService } from "./observation-aggregation.service.js";
import { observationDeadlineService } from "./observation-deadline.service.js";
import type {
  CreateObservationInput,
  ListObservationsQuery,
  ObservationDetail,
  ObservationFormOptions,
  ObservationListItem,
  UpdateObservationInput,
} from "./observations.types.js";

const userSummarySelect = {
  email: true,
  id: true,
  jobTitle: true,
  name: true,
} as const;

const observationInclude = {
  actionPlans: {
    select: { progressPercent: true, status: true },
    where: { deletedAt: null },
  },
  areaAssignments: {
    include: {
      actionPlans: {
        select: { progressPercent: true, status: true },
        where: { deletedAt: null },
      },
      area: { select: { id: true, name: true } },
      areaResponsible: { select: userSummarySelect },
      processOwner: { select: userSummarySelect },
    },
    orderBy: { area: { name: "asc" } },
  },
  auditReport: {
    select: { id: true, reportDate: true, reportNumber: true, title: true },
  },
  auditorUser: { select: userSummarySelect },
  mainObservation: { select: { id: true, name: true } },
  riskLevel: {
    select: {
      colorToken: true,
      defaultDeadlineDays: true,
      id: true,
      key: true,
      name: true,
    },
  },
  risks: {
    orderBy: { risk: { name: "asc" } },
    select: { risk: { select: { id: true, name: true } } },
  },
  status: { select: { id: true, isFinal: true, key: true, name: true } },
} satisfies Prisma.ObservationInclude;

type ObservationRecord = Prisma.ObservationGetPayload<{
  include: typeof observationInclude;
}>;

const businessStatusLabel = {
  CONCLUIDO: "Concluido",
  CON_AVANCE: "Con avance",
  INICIADO: "Iniciado",
  NO_INICIADO: "No iniciado",
} as const;

const hasGlobalAccess = (access: AuthorizationSummary): boolean =>
  access.isAdmin ||
  access.roles.some((role) =>
    ["auditoria", "sistema", "sistemas"].includes(
      role
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    ),
  );

export const buildObservationAccessWhere = (
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  if (hasGlobalAccess(access)) return {};

  return {
    OR: [
      { auditorUserId: access.userId },
      {
        areaAssignments: {
          some: {
            OR: [
              { areaResponsibleUserId: access.userId },
              { processOwnerUserId: access.userId },
              { area: { managerUserId: access.userId } },
            ],
          },
        },
      },
      {
        actionPlans: {
          some: { deletedAt: null, responsibleUserId: access.userId },
        },
      },
    ],
  };
};

const formatObservation = (record: ObservationRecord): ObservationDetail => {
  const progressPercent = observationAggregationService.calculateProgress(
    record.actionPlans,
  );
  const businessStatus = observationAggregationService.calculateStatus(
    record.actionPlans,
    record.status.isFinal,
  );
  const now = new Date();

  return {
    actionPlanCount: record.actionPlans.length,
    areas: record.areaAssignments.map((assignment) => ({
      area: assignment.area,
      areaResponsible: assignment.areaResponsible,
      id: assignment.id,
      processOwner: assignment.processOwner,
      progressPercent: observationAggregationService.calculateProgress(
        assignment.actionPlans,
      ),
    })),
    auditRecommendation: record.auditRecommendation,
    auditReport: {
      ...record.auditReport,
      reportDate: record.auditReport.reportDate.toISOString(),
    },
    auditorUser: record.auditorUser,
    category: record.category,
    currentDueDate: record.currentDueDate.toISOString(),
    currentStage: record.currentStage,
    description: record.description,
    displayCode: `${record.auditReport.reportNumber} / OBS-${String(record.observationNumber).padStart(3, "0")}`,
    id: record.id,
    isOverdue:
      !record.status.isFinal && record.currentDueDate.getTime() < now.getTime(),
    mainObservation: record.mainObservation,
    observationNumber: record.observationNumber,
    originalDueDate: record.originalDueDate.toISOString(),
    process: record.process,
    progressPercent,
    risks: record.risks.map(({ risk }) => risk),
    riskLevel: record.riskLevel,
    source: record.source,
    status: {
      id: record.status.id,
      isFinal: record.status.isFinal,
      key: businessStatus,
      name: businessStatusLabel[businessStatus],
    },
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const toListItem = (record: ObservationRecord): ObservationListItem =>
  formatObservation(record);

const requireEntities = async (input: {
  areaAssignments: CreateObservationInput["areaAssignments"];
  auditReportId: string;
  auditorUserId: string;
  mainObservationId: string;
  riskIds: string[];
  riskLevelId: string;
}) => {
  const uniqueUserIds = Array.from(
    new Set([
      input.auditorUserId,
      ...input.areaAssignments.flatMap((row) => [
        row.processOwnerUserId,
        row.areaResponsibleUserId,
      ]),
    ]),
  );
  const [auditReport, mainObservation, riskLevel, risks, areas, users] =
    await Promise.all([
      prisma.auditReport.findFirst({
        select: { id: true, reportDate: true },
        where: { deletedAt: null, id: input.auditReportId },
      }),
      prisma.observationDictionary.findFirst({
        select: { id: true },
        where: { id: input.mainObservationId, isActive: true },
      }),
      prisma.riskLevel.findFirst({
        select: { id: true, key: true },
        where: { active: true, deletedAt: null, id: input.riskLevelId },
      }),
      prisma.risk.count({
        where: { id: { in: input.riskIds }, isActive: true },
      }),
      prisma.area.count({
        where: {
          active: true,
          deletedAt: null,
          id: { in: input.areaAssignments.map((row) => row.areaId) },
        },
      }),
      prisma.user.count({
        where: { deletedAt: null, id: { in: uniqueUserIds }, isActive: true },
      }),
    ]);

  if (!auditReport) throw new AppError("Audit report not found.", 400);
  if (!mainObservation)
    throw new AppError("Main observation is not active.", 400);
  if (!riskLevel) throw new AppError("Risk level is not active.", 400);
  observationDeadlineService.getDays(riskLevel.key);
  if (risks !== input.riskIds.length)
    throw new AppError(
      "One or more associated risks are invalid or inactive.",
      400,
    );
  if (areas !== input.areaAssignments.length)
    throw new AppError(
      "One or more involved areas are invalid or inactive.",
      400,
    );
  if (users !== uniqueUserIds.length)
    throw new AppError(
      "One or more assigned users are invalid or inactive.",
      400,
    );

  return { auditReport, riskLevel };
};

const findRecord = async (
  id: string,
  access?: AuthorizationSummary,
): Promise<ObservationRecord> => {
  const record = await prisma.observation.findFirst({
    include: observationInclude,
    where: {
      deletedAt: null,
      id,
      ...(access ? buildObservationAccessWhere(access) : {}),
    },
  });
  if (!record) throw new AppError("Observation not found.", 404);
  return record;
};

const buildBusinessStatusWhere = (
  status: NonNullable<ListObservationsQuery["observationStatus"]>,
): Prisma.ObservationWhereInput => {
  switch (status) {
    case "NO_INICIADO":
      return {
        OR: [
          { actionPlans: { none: { deletedAt: null } } },
          {
            actionPlans: {
              every: {
                OR: [{ deletedAt: { not: null } }, { status: "NOT_STARTED" }],
              },
            },
          },
        ],
      };
    case "INICIADO":
      return {
        actionPlans: {
          none: { deletedAt: null, progressPercent: { gt: 0 } },
          some: { deletedAt: null, status: "STARTED" },
        },
        status: { isFinal: false },
      };
    case "CON_AVANCE":
      return {
        actionPlans: {
          some: {
            deletedAt: null,
            OR: [
              { progressPercent: { gt: 0 } },
              { status: { in: ["WITH_PROGRESS", "CONCLUDED"] } },
            ],
          },
        },
        status: { isFinal: false },
      };
    case "CONCLUIDO":
      return { status: { isFinal: true } };
  }
};

export const observationsService = {
  async createObservation(
    input: CreateObservationInput,
    access: AuthorizationSummary,
  ): Promise<ObservationDetail> {
    const { auditReport, riskLevel } = await requireEntities(input);
    const initialStatus = await prisma.observationStatus.findFirst({
      select: { id: true },
      where: { active: true, deletedAt: null, isInitial: true },
    });
    if (!initialStatus)
      throw new AppError("Initial observation status is not configured.", 500);
    const deadline = observationDeadlineService.calculate(
      auditReport.reportDate,
      riskLevel.key,
    );

    try {
      const created = await prisma.$transaction(async (tx) =>
        tx.observation.create({
          data: {
            auditRecommendation: input.auditRecommendation,
            auditReportId: input.auditReportId,
            auditorUserId: input.auditorUserId,
            category: input.category,
            currentDueDate: deadline,
            currentStage: input.currentStage,
            description: input.description,
            mainObservationId: input.mainObservationId,
            observationNumber: input.observationNumber,
            originalDueDate: deadline,
            process: input.process,
            riskLevelId: input.riskLevelId,
            source: input.source,
            statusId: initialStatus.id,
            title: input.title,
            areaAssignments: {
              create: input.areaAssignments.map((row) => ({
                areaId: row.areaId,
                areaResponsibleUserId: row.areaResponsibleUserId,
                processOwnerUserId: row.processOwnerUserId,
              })),
            },
            risks: {
              create: input.riskIds.map((riskId) => ({ riskId })),
            },
          },
          select: { id: true },
        }),
      );
      return formatObservation(await findRecord(created.id, access));
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new AppError(
          "That observation number already exists in the selected audit report.",
          409,
        );
      }
      throw error;
    }
  },

  async closeObservation(
    id: string,
    access: AuthorizationSummary,
  ): Promise<{ current: ObservationDetail; previous: ObservationDetail }> {
    const existing = await findRecord(id, access);
    if (existing.status.isFinal) {
      throw new AppError("The observation is already concluded.", 409);
    }
    if (existing.actionPlans.length === 0) {
      throw new AppError(
        "At least one action plan is required before closure.",
        409,
      );
    }
    if (existing.actionPlans.some((plan) => plan.status !== "CONCLUDED")) {
      throw new AppError(
        "All action plans must be concluded before closing the observation.",
        409,
      );
    }
    const pendingEvaluations = await prisma.progressEvaluation.count({
      where: {
        actionPlan: { observationId: id },
        deletedAt: null,
        reviewStatus: { in: ["SENT_TO_AUDIT", "RETURNED"] },
      },
    });
    if (pendingEvaluations > 0) {
      throw new AppError(
        "Pending progress evaluations must be resolved before closure.",
        409,
      );
    }
    const concludedStatus = await prisma.observationStatus.findFirst({
      select: { id: true },
      where: { active: true, deletedAt: null, key: "CONCLUIDO" },
    });
    if (!concludedStatus) {
      throw new AppError(
        "The CONCLUIDO observation status is not configured.",
        500,
      );
    }
    await prisma.observation.update({
      data: {
        currentStage: "Cierre aprobado por Auditoría",
        progressPercent: 100,
        statusId: concludedStatus.id,
      },
      where: { id },
    });
    return {
      current: formatObservation(await findRecord(id, access)),
      previous: formatObservation(existing),
    };
  },

  async deleteObservation(
    id: string,
    access: AuthorizationSummary,
  ): Promise<ObservationDetail> {
    const previous = formatObservation(await findRecord(id, access));
    await prisma.observation.update({
      data: { deletedAt: new Date() },
      where: { id },
    });
    return previous;
  },

  async getObservationById(
    id: string,
    access: AuthorizationSummary,
  ): Promise<ObservationDetail> {
    return formatObservation(await findRecord(id, access));
  },

  async getObservationForActionItems(id: string, access: AuthorizationSummary) {
    const record = await findRecord(id, access);
    return {
      areaAssignments: record.areaAssignments.map((row) => ({
        areaId: row.areaId,
        areaName: row.area.name,
        areaResponsibleUserId: row.areaResponsibleUserId,
        processOwnerUserId: row.processOwnerUserId,
      })),
      currentDueDate: record.currentDueDate,
      id: record.id,
      progressPercent: observationAggregationService.calculateProgress(
        record.actionPlans,
      ),
      riskCount: record.risks.length,
      status: record.status,
    };
  },

  async getObservationFormOptions(
    access: AuthorizationSummary,
  ): Promise<ObservationFormOptions> {
    void access;
    const [areas, auditReports, mainObservations, risks, riskLevels, users] =
      await Promise.all([
        prisma.area.findMany({
          orderBy: { name: "asc" },
          select: {
            code: true,
            id: true,
            managerUser: { select: userSummarySelect },
            name: true,
          },
          where: { active: true, deletedAt: null },
        }),
        prisma.auditReport.findMany({
          orderBy: [{ reportDate: "desc" }, { reportNumber: "asc" }],
          select: {
            id: true,
            reportDate: true,
            reportNumber: true,
            title: true,
          },
          where: { deletedAt: null },
        }),
        prisma.observationDictionary.findMany({
          orderBy: { name: "asc" },
          select: { description: true, id: true, name: true },
          where: { isActive: true },
        }),
        prisma.risk.findMany({
          orderBy: { name: "asc" },
          select: { description: true, id: true, name: true },
          where: { isActive: true },
        }),
        prisma.riskLevel.findMany({
          orderBy: { severityOrder: "asc" },
          select: {
            colorToken: true,
            defaultDeadlineDays: true,
            id: true,
            key: true,
            name: true,
          },
          where: {
            active: true,
            deletedAt: null,
            key: { in: ["ALTO", "MEDIO", "BAJO"] },
          },
        }),
        prisma.user.findMany({
          orderBy: { name: "asc" },
          select: userSummarySelect,
          where: { deletedAt: null, isActive: true },
        }),
      ]);

    return {
      areas,
      auditReports: auditReports.map((report) => ({
        ...report,
        reportDate: report.reportDate.toISOString(),
      })),
      mainObservations,
      risks,
      riskLevels,
      users,
    };
  },

  async listObservations(
    query: ListObservationsQuery,
    access: AuthorizationSummary,
  ) {
    const now = new Date();
    const numericSearch = /^\d+$/.test(query.search)
      ? Number(query.search)
      : null;
    const where: Prisma.ObservationWhereInput = {
      AND: [
        buildObservationAccessWhere(access),
        ...(query.observationStatus
          ? [buildBusinessStatusWhere(query.observationStatus)]
          : []),
      ],
      deletedAt: null,
      ...(query.actionPlanResponsibleUserId
        ? {
            actionPlans: {
              some: {
                deletedAt: null,
                responsibleUserId: query.actionPlanResponsibleUserId,
              },
            },
          }
        : {}),
      ...(query.areaId ||
      query.areaResponsibleUserId ||
      query.processOwnerUserId
        ? {
            areaAssignments: {
              some: {
                ...(query.areaId ? { areaId: query.areaId } : {}),
                ...(query.areaResponsibleUserId
                  ? { areaResponsibleUserId: query.areaResponsibleUserId }
                  : {}),
                ...(query.processOwnerUserId
                  ? { processOwnerUserId: query.processOwnerUserId }
                  : {}),
              },
            },
          }
        : {}),
      ...(query.auditReportId ? { auditReportId: query.auditReportId } : {}),
      ...(query.currentDueDateFrom || query.currentDueDateTo
        ? {
            currentDueDate: {
              ...(query.currentDueDateFrom
                ? { gte: query.currentDueDateFrom }
                : {}),
              ...(query.currentDueDateTo
                ? { lte: query.currentDueDateTo }
                : {}),
            },
          }
        : {}),
      ...(query.mainObservationId
        ? { mainObservationId: query.mainObservationId }
        : {}),
      ...(query.overdue !== undefined
        ? query.overdue
          ? { currentDueDate: { lt: now }, status: { isFinal: false } }
          : {
              OR: [
                { currentDueDate: { gte: now } },
                { status: { isFinal: true } },
              ],
            }
        : {}),
      ...(query.riskId ? { risks: { some: { riskId: query.riskId } } } : {}),
      ...(query.riskLevelId ? { riskLevelId: query.riskLevelId } : {}),
      ...(query.search
        ? {
            OR: [
              ...(numericSearch ? [{ observationNumber: numericSearch }] : []),
              { title: { contains: query.search } },
              { auditReport: { reportNumber: { contains: query.search } } },
              { auditReport: { title: { contains: query.search } } },
              { mainObservation: { name: { contains: query.search } } },
              {
                risks: { some: { risk: { name: { contains: query.search } } } },
              },
              {
                areaAssignments: {
                  some: { area: { name: { contains: query.search } } },
                },
              },
              {
                areaAssignments: {
                  some: {
                    OR: [
                      { processOwner: { name: { contains: query.search } } },
                      { processOwner: { email: { contains: query.search } } },
                      { areaResponsible: { name: { contains: query.search } } },
                      {
                        areaResponsible: { email: { contains: query.search } },
                      },
                    ],
                  },
                },
              },
              {
                actionPlans: {
                  some: {
                    responsibleUser: {
                      OR: [
                        { name: { contains: query.search } },
                        { email: { contains: query.search } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ObservationOrderByWithRelationInput =
      query.sortBy === "reportDate"
        ? { auditReport: { reportDate: query.sortDirection } }
        : { [query.sortBy]: query.sortDirection };
    const [records, total] = await Promise.all([
      prisma.observation.findMany({
        include: observationInclude,
        orderBy: [orderBy, { id: "asc" }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
      prisma.observation.count({ where }),
    ]);

    return {
      data: records.map(toListItem),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  },

  async updateObservation(
    id: string,
    input: UpdateObservationInput,
    access: AuthorizationSummary,
  ): Promise<{ current: ObservationDetail; previous: ObservationDetail }> {
    const existing = await findRecord(id, access);
    if (
      input.areaAssignments !== undefined &&
      !access.isAdmin &&
      !access.permissions.includes("observation_areas.manage")
    ) {
      throw new AppError(
        "You cannot change observation area assignments.",
        403,
      );
    }
    const merged = {
      areaAssignments:
        input.areaAssignments ??
        existing.areaAssignments.map((row) => ({
          areaId: row.areaId,
          areaResponsibleUserId: row.areaResponsibleUserId,
          processOwnerUserId: row.processOwnerUserId,
        })),
      auditReportId: input.auditReportId ?? existing.auditReportId,
      auditorUserId: input.auditorUserId ?? existing.auditorUserId,
      mainObservationId: input.mainObservationId ?? existing.mainObservationId,
      riskIds: input.riskIds ?? existing.risks.map(({ risk }) => risk.id),
      riskLevelId: input.riskLevelId ?? existing.riskLevelId,
    };
    const { auditReport, riskLevel } = await requireEntities(merged);
    const extensionCount = await prisma.deadlineExtensionRequest.count({
      where: { deletedAt: null, observationId: id },
    });
    const shouldRecalculateDeadline =
      existing.actionPlans.length === 0 &&
      extensionCount === 0 &&
      (merged.auditReportId !== existing.auditReportId ||
        merged.riskLevelId !== existing.riskLevelId);
    const deadline = shouldRecalculateDeadline
      ? observationDeadlineService.calculate(
          auditReport.reportDate,
          riskLevel.key,
        )
      : null;

    const retainedAreaIds = new Set(
      merged.areaAssignments.map((row) => row.areaId),
    );
    const blockedRemoval = existing.areaAssignments.find(
      (row) => !retainedAreaIds.has(row.areaId) && row.actionPlans.length > 0,
    );
    if (blockedRemoval) {
      throw new AppError(
        `Area ${blockedRemoval.area.name} cannot be removed while it has action plans.`,
        409,
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.observation.update({
          data: {
            ...(input.auditRecommendation !== undefined
              ? { auditRecommendation: input.auditRecommendation }
              : {}),
            ...(input.auditReportId !== undefined
              ? { auditReportId: input.auditReportId }
              : {}),
            ...(input.auditorUserId !== undefined
              ? { auditorUserId: input.auditorUserId }
              : {}),
            ...(input.category !== undefined
              ? { category: input.category }
              : {}),
            ...(input.currentStage !== undefined
              ? { currentStage: input.currentStage }
              : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.mainObservationId !== undefined
              ? { mainObservationId: input.mainObservationId }
              : {}),
            ...(input.observationNumber !== undefined
              ? { observationNumber: input.observationNumber }
              : {}),
            ...(input.process !== undefined ? { process: input.process } : {}),
            ...(input.riskLevelId !== undefined
              ? { riskLevelId: input.riskLevelId }
              : {}),
            ...(input.source !== undefined ? { source: input.source } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(deadline
              ? { currentDueDate: deadline, originalDueDate: deadline }
              : {}),
          },
          where: { id },
        });

        if (input.riskIds) {
          await tx.observationRisk.deleteMany({ where: { observationId: id } });
          await tx.observationRisk.createMany({
            data: input.riskIds.map((riskId) => ({
              observationId: id,
              riskId,
            })),
          });
        }

        if (input.areaAssignments) {
          await tx.observationArea.deleteMany({
            where: {
              observationId: id,
              areaId: { notIn: input.areaAssignments.map((row) => row.areaId) },
            },
          });
          for (const row of input.areaAssignments) {
            await tx.observationArea.upsert({
              create: { observationId: id, ...row },
              update: {
                areaResponsibleUserId: row.areaResponsibleUserId,
                processOwnerUserId: row.processOwnerUserId,
              },
              where: {
                observationId_areaId: { areaId: row.areaId, observationId: id },
              },
            });
          }
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new AppError(
          "That observation number already exists in the selected audit report.",
          409,
        );
      }
      throw error;
    }

    return {
      current: formatObservation(await findRecord(id, access)),
      previous: formatObservation(existing),
    };
  },
};
