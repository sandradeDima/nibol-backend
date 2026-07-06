import type { Prisma } from "../../../generated/prisma/client.js";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { buildDateRangeFilter } from "../../services/logging-utils.js";
import { configurationService } from "../configuration/configuration.service.js";
import {
  OBSERVATION_OVERDUE_STATUS_KEY,
  OBSERVATION_TERMINAL_STATUS_KEYS,
} from "./observations.constants.js";
import { OBSERVATIONS_PERMISSIONS } from "./observations.permissions.js";
import type {
  CreateObservationInput,
  ListObservationsQuery,
  ObservationDetail,
  ObservationFormOptions,
  ObservationListItem,
  UpdateObservationInput,
} from "./observations.types.js";

const SYSTEM_WIDE_ROLE_NAMES = new Set([
  "admin",
  "sistema",
  "sistemas",
  "system",
  "systems",
]);

const terminalStatusKeys = new Set<string>(OBSERVATION_TERMINAL_STATUS_KEYS);

const userSummarySelect = {
  email: true,
  id: true,
  name: true,
} as const;

const areaSummarySelect = {
  id: true,
  name: true,
} as const;

const areaOptionSelect = {
  code: true,
  id: true,
  managerUser: {
    select: userSummarySelect,
  },
  name: true,
} as const;

const riskLevelSelect = {
  colorToken: true,
  defaultDeadlineDays: true,
  id: true,
  key: true,
  name: true,
  severityOrder: true,
} as const;

const statusSelect = {
  countsAsOverdue: true,
  id: true,
  isFinal: true,
  isInitial: true,
  key: true,
  name: true,
  sortOrder: true,
} as const;

const observationListSelect = {
  area: {
    select: areaSummarySelect,
  },
  code: true,
  createdAt: true,
  currentStage: true,
  detectedAt: true,
  dueDate: true,
  id: true,
  progressPercent: true,
  responsibleUser: {
    select: userSummarySelect,
  },
  riskLevel: {
    select: riskLevelSelect,
  },
  status: {
    select: statusSelect,
  },
  title: true,
  updatedAt: true,
} as const;

const observationDetailSelect = {
  ...observationListSelect,
  areaAssignments: {
    orderBy: {
      area: {
        name: "asc",
      },
    },
    select: {
      area: {
        select: areaSummarySelect,
      },
      id: true,
      responsibleUser: {
        select: userSummarySelect,
      },
      roleInFinding: true,
    },
  },
  auditRecommendation: true,
  auditorUser: {
    select: userSummarySelect,
  },
  category: true,
  description: true,
  observationType: true,
  process: true,
  source: true,
} as const;

const observationMutationSelect = {
  areaAssignments: {
    select: {
      areaId: true,
    },
  },
  areaId: true,
  auditRecommendation: true,
  category: true,
  code: true,
  currentStage: true,
  description: true,
  detectedAt: true,
  dueDate: true,
  id: true,
  observationType: true,
  process: true,
  progressPercent: true,
  responsibleUserId: true,
  riskLevelId: true,
  source: true,
  statusId: true,
  title: true,
} as const;

const configurationPrisma = prisma as typeof prisma & {
  catalog: any;
};

type ObservationUserRow = {
  email: string;
  id: string;
  name: string;
};

type ObservationAreaRow = {
  id: string;
  name: string;
};

type ObservationRiskLevelRow = {
  colorToken: string | null;
  defaultDeadlineDays: number | null;
  id: string;
  key: string;
  name: string;
  severityOrder: number;
};

type ObservationStatusRow = {
  countsAsOverdue: boolean;
  id: string;
  isFinal: boolean;
  isInitial: boolean;
  key: string;
  name: string;
  sortOrder: number;
};

type ObservationListRecord = {
  area: ObservationAreaRow;
  code: string;
  createdAt: Date;
  currentStage: string | null;
  detectedAt: Date;
  dueDate: Date;
  id: string;
  progressPercent: number;
  responsibleUser: ObservationUserRow | null;
  riskLevel: ObservationRiskLevelRow;
  status: ObservationStatusRow;
  title: string;
  updatedAt: Date;
};

type ObservationDetailRecord = ObservationListRecord & {
  areaAssignments: Array<{
    area: ObservationAreaRow;
    id: string;
    responsibleUser: ObservationUserRow | null;
    roleInFinding: string | null;
  }>;
  auditRecommendation: string;
  auditorUser: ObservationUserRow;
  category: string | null;
  description: string;
  observationType: string | null;
  process: string | null;
  source: string | null;
};

type ObservationMutationRecord = {
  areaAssignments: Array<{
    areaId: string;
  }>;
  areaId: string;
  auditRecommendation: string;
  category: string | null;
  code: string;
  currentStage: string | null;
  description: string;
  detectedAt: Date;
  dueDate: Date;
  id: string;
  observationType: string | null;
  process: string | null;
  progressPercent: number;
  responsibleUserId: string | null;
  riskLevelId: string;
  source: string | null;
  statusId: string;
  title: string;
};

const normalizeRoleName = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
};

const hasGlobalObservationAccess = (access: AuthorizationSummary): boolean => {
  if (access.isAdmin) {
    return true;
  }

  if (
    access.permissions.includes(OBSERVATIONS_PERMISSIONS.create) ||
    access.permissions.includes(OBSERVATIONS_PERMISSIONS.edit) ||
    access.permissions.includes(OBSERVATIONS_PERMISSIONS.delete)
  ) {
    return true;
  }

  return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};

const isObservationOverdue = (dueDate: Date, statusKey: string): boolean => {
  if (statusKey === OBSERVATION_OVERDUE_STATUS_KEY) {
    return true;
  }

  if (terminalStatusKeys.has(statusKey)) {
    return false;
  }

  return dueDate.getTime() < Date.now();
};

const buildEffectiveStatus = (status: ObservationListRecord["status"], dueDate: Date) => {
  if (isObservationOverdue(dueDate, status.key)) {
    return {
      key: OBSERVATION_OVERDUE_STATUS_KEY,
      name: "Vencida",
    };
  }

  return {
    key: status.key,
    name: status.name,
  };
};

const mapObservationListItem = (
  observation: ObservationListRecord,
): ObservationListItem => {
  const isOverdue = isObservationOverdue(observation.dueDate, observation.status.key);

  return {
    area: observation.area,
    code: observation.code,
    createdAt: observation.createdAt.toISOString(),
    currentStage: observation.currentStage,
    detectedAt: observation.detectedAt.toISOString(),
    dueDate: observation.dueDate.toISOString(),
    effectiveStatus: buildEffectiveStatus(observation.status, observation.dueDate),
    id: observation.id,
    isOverdue,
    progressPercent: observation.progressPercent,
    responsibleUser: observation.responsibleUser,
    riskLevel: observation.riskLevel,
    status: observation.status,
    title: observation.title,
    updatedAt: observation.updatedAt.toISOString(),
  };
};

const mapObservationDetail = (
  observation: ObservationDetailRecord,
): ObservationDetail => {
  const listItem = mapObservationListItem(observation);

  return {
    ...listItem,
    additionalAreas: observation.areaAssignments.map((assignment) => ({
      area: assignment.area,
      id: assignment.id,
      responsibleUser: assignment.responsibleUser,
      roleInFinding: assignment.roleInFinding,
    })),
    auditRecommendation: observation.auditRecommendation,
    auditorUser: observation.auditorUser,
    category: observation.category,
    description: observation.description,
    observationType: observation.observationType,
    process: observation.process,
    source: observation.source,
  };
};

const sanitizeAdditionalAreaIds = (
  areaId: string,
  additionalAreaIds?: string[],
): string[] => {
  return Array.from(new Set(additionalAreaIds ?? [])).filter(
    (value) => value !== areaId,
  );
};

const buildAssignmentCreateInput = (
  areaId: string,
  responsibleUserId?: string | null,
) => {
  return {
    area: {
      connect: {
        id: areaId,
      },
    },
    ...(responsibleUserId
      ? {
          responsibleUser: {
            connect: {
              id: responsibleUserId,
            },
          },
        }
      : {}),
  };
};

const buildVisibilityCondition = (
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput | undefined => {
  if (hasGlobalObservationAccess(access)) {
    return undefined;
  }

  return {
    OR: [
      {
        responsibleUserId: access.userId,
      },
      {
        auditorUserId: access.userId,
      },
      {
        area: {
          active: true,
          deletedAt: null,
          managerUserId: access.userId,
        },
      },
      {
        areaAssignments: {
          some: {
            OR: [
              {
                responsibleUserId: access.userId,
              },
              {
                area: {
                  active: true,
                  deletedAt: null,
                  managerUserId: access.userId,
                },
              },
            ],
          },
        },
      },
    ],
  };
};

const buildOrderBy = (
  sortBy: ListObservationsQuery["sortBy"],
  sortDirection: ListObservationsQuery["sortDirection"],
): Prisma.ObservationOrderByWithRelationInput => {
  switch (sortBy) {
    case "code":
      return {
        code: sortDirection,
      };
    case "detectedAt":
      return {
        detectedAt: sortDirection,
      };
    case "dueDate":
      return {
        dueDate: sortDirection,
      };
    case "progressPercent":
      return {
        progressPercent: sortDirection,
      };
    case "title":
      return {
        title: sortDirection,
      };
    case "updatedAt":
      return {
        updatedAt: sortDirection,
      };
  }
};

const buildWhereClause = (
  query: ListObservationsQuery,
  access: AuthorizationSummary,
): Prisma.ObservationWhereInput => {
  const dueDate = buildDateRangeFilter(query.dueDateFrom, query.dueDateTo);
  const visibilityCondition = buildVisibilityCondition(access);
  const conditions: Prisma.ObservationWhereInput[] = [
    {
      deletedAt: null,
    },
  ];

  if (visibilityCondition) {
    conditions.push(visibilityCondition);
  }

  if (query.search.length > 0) {
    conditions.push({
      OR: [
        {
          code: {
            contains: query.search,
          },
        },
        {
          title: {
            contains: query.search,
          },
        },
      ],
    });
  }

  if (query.statusId) {
    conditions.push({
      statusId: query.statusId,
    });
  }

  if (query.riskLevelId) {
    conditions.push({
      riskLevelId: query.riskLevelId,
    });
  }

  if (query.areaId) {
    conditions.push({
      OR: [
        {
          areaId: query.areaId,
        },
        {
          areaAssignments: {
            some: {
              areaId: query.areaId,
            },
          },
        },
      ],
    });
  }

  if (query.responsibleUserId) {
    conditions.push({
      responsibleUserId: query.responsibleUserId,
    });
  }

  if (dueDate) {
    conditions.push({
      dueDate,
    });
  }

  if (query.overdue) {
    conditions.push({
      OR: [
        {
          status: {
            key: OBSERVATION_OVERDUE_STATUS_KEY,
          },
        },
        {
          dueDate: {
            lt: new Date(),
          },
          status: {
            key: {
              notIn: [...terminalStatusKeys, OBSERVATION_OVERDUE_STATUS_KEY],
            },
          },
        },
      ],
    });
  }

  return {
    AND: conditions,
  };
};

const assertCodeAvailable = async (
  code: string,
  observationId?: string,
): Promise<void> => {
  const existingObservation = await prisma.observation.findFirst({
    select: {
      id: true,
    },
    where: {
      code,
      deletedAt: null,
      ...(observationId
        ? {
            id: {
              not: observationId,
            },
          }
        : {}),
    },
  });

  if (existingObservation) {
    throw new AppError("An observation with this code already exists.", 400);
  }
};

const assertReferencesExist = async (input: {
  additionalAreaIds: string[];
  areaId: string;
  category?: string | null;
  observationType?: string | null;
  process?: string | null;
  responsibleUserId?: string | null;
  riskLevelId: string;
  source?: string | null;
  statusId: string;
}): Promise<void> => {
  const areaIds = Array.from(new Set([input.areaId, ...input.additionalAreaIds]));

  const [
    riskLevelCount,
    statusCount,
    areaCount,
    responsibleUserCount,
    processCatalogCount,
    typeCatalogCount,
    sourceCatalogCount,
    categoryCatalogCount,
  ] = await Promise.all([
    prisma.riskLevel.count({
      where: {
        active: true,
        deletedAt: null,
        id: input.riskLevelId,
      },
    }),
    prisma.observationStatus.count({
      where: {
        active: true,
        deletedAt: null,
        id: input.statusId,
      },
    }),
    prisma.area.count({
      where: {
        active: true,
        deletedAt: null,
        id: {
          in: areaIds,
        },
      },
    }),
    input.responsibleUserId
      ? prisma.user.count({
          where: {
            deletedAt: null,
            id: input.responsibleUserId,
          },
        })
      : Promise.resolve(1),
    input.process
      ? configurationPrisma.catalog.count({
          where: {
            active: true,
            deletedAt: null,
            name: input.process,
            type: "proceso_auditado",
          },
        })
      : Promise.resolve(1),
    input.observationType
      ? configurationPrisma.catalog.count({
          where: {
            active: true,
            deletedAt: null,
            name: input.observationType,
            type: "tipo_observacion",
          },
        })
      : Promise.resolve(1),
    input.source
      ? configurationPrisma.catalog.count({
          where: {
            active: true,
            deletedAt: null,
            name: input.source,
            type: "fuente_hallazgo",
          },
        })
      : Promise.resolve(1),
    input.category
      ? configurationPrisma.catalog.count({
          where: {
            active: true,
            deletedAt: null,
            name: input.category,
            type: "categoria_hallazgo",
          },
        })
      : Promise.resolve(1),
  ]);

  if (riskLevelCount !== 1) {
    throw new AppError("The selected risk level is invalid.", 400);
  }

  if (statusCount !== 1) {
    throw new AppError("The selected observation status is invalid.", 400);
  }

  if (areaCount !== areaIds.length) {
    throw new AppError("One or more selected areas are invalid.", 400);
  }

  if (responsibleUserCount !== 1) {
    throw new AppError("The selected responsible user is invalid.", 400);
  }

  if (processCatalogCount !== 1) {
    throw new AppError("The selected audited process is invalid.", 400);
  }

  if (typeCatalogCount !== 1) {
    throw new AppError("The selected observation type is invalid.", 400);
  }

  if (sourceCatalogCount !== 1) {
    throw new AppError("The selected finding source is invalid.", 400);
  }

  if (categoryCatalogCount !== 1) {
    throw new AppError("The selected finding category is invalid.", 400);
  }
};

const findObservationDetailById = async (
  observationId: string,
  access: AuthorizationSummary,
): Promise<ObservationDetailRecord> => {
  const visibilityCondition = buildVisibilityCondition(access);
  const observation = await prisma.observation.findFirst({
    select: observationDetailSelect,
    where: {
      AND: [
        {
          deletedAt: null,
          id: observationId,
        },
        ...(visibilityCondition ? [visibilityCondition] : []),
      ],
    },
  });

  if (!observation) {
    throw new AppError("Observation not found.", 404);
  }

  return observation;
};

const findObservationForMutation = async (
  observationId: string,
): Promise<ObservationMutationRecord> => {
  const observation = await prisma.observation.findFirst({
    select: observationMutationSelect,
    where: {
      deletedAt: null,
      id: observationId,
    },
  });

  if (!observation) {
    throw new AppError("Observation not found.", 404);
  }

  return observation;
};

export const observationsService = {
  async createObservation(
    input: CreateObservationInput,
    access: AuthorizationSummary,
  ): Promise<ObservationDetail> {
    if (!access.userId) {
      throw new AppError("Authentication required.", 401);
    }

    const progressPercent = input.progressPercent ?? 0;
    const additionalAreaIds = sanitizeAdditionalAreaIds(
      input.areaId,
      input.additionalAreaIds,
    );

    await assertCodeAvailable(input.code);
    await assertReferencesExist({
      additionalAreaIds,
      areaId: input.areaId,
      category: input.category ?? null,
      observationType: input.observationType ?? null,
      process: input.process ?? null,
      responsibleUserId: input.responsibleUserId ?? null,
      riskLevelId: input.riskLevelId,
      source: input.source ?? null,
      statusId: input.statusId,
    });

    const createData = {
      area: {
        connect: {
          id: input.areaId,
        },
      },
      auditRecommendation: input.auditRecommendation,
      auditorUser: {
        connect: {
          id: access.userId,
        },
      },
      category: input.category,
      code: input.code,
      currentStage: input.currentStage,
      description: input.description,
      detectedAt: input.detectedAt,
      dueDate: input.dueDate,
      observationType: input.observationType,
      process: input.process,
      progressPercent,
      riskLevel: {
        connect: {
          id: input.riskLevelId,
        },
      },
      source: input.source,
      status: {
        connect: {
          id: input.statusId,
        },
      },
      title: input.title,
      ...(additionalAreaIds.length > 0
        ? {
            areaAssignments: {
              create: additionalAreaIds.map((areaId) =>
                buildAssignmentCreateInput(areaId, input.responsibleUserId),
              ),
            },
          }
        : {}),
      ...(input.responsibleUserId
        ? {
            responsibleUser: {
              connect: {
                id: input.responsibleUserId,
              },
            },
          }
        : {}),
    };

    const observation = await prisma.observation.create({
      data: createData,
      select: {
        id: true,
      },
    });

    const detail = await prisma.observation.findFirst({
      select: observationDetailSelect,
      where: {
        deletedAt: null,
        id: observation.id,
      },
    });

    if (!detail) {
      throw new AppError("Observation not found after creation.", 500);
    }

    return mapObservationDetail(detail);
  },

  async deleteObservation(observationId: string): Promise<ObservationDetail> {
    const previousObservation = await prisma.observation.findFirst({
      select: observationDetailSelect,
      where: {
        deletedAt: null,
        id: observationId,
      },
    });

    if (!previousObservation) {
      throw new AppError("Observation not found.", 404);
    }

    await prisma.observation.update({
      data: {
        deletedAt: new Date(),
      },
      where: {
        id: observationId,
      },
    });

    return mapObservationDetail(previousObservation);
  },

  async getObservationById(
    observationId: string,
    access: AuthorizationSummary,
  ): Promise<ObservationDetail> {
    const observation = await findObservationDetailById(observationId, access);
    return mapObservationDetail(observation);
  },

  async getObservationFormOptions(
    access: AuthorizationSummary,
  ): Promise<ObservationFormOptions> {
    return configurationService.getBootstrap(access);
  },

  async listObservations(
    query: ListObservationsQuery,
    access: AuthorizationSummary,
  ): Promise<{
    data: ObservationListItem[];
    pagination: {
      page: number;
      perPage: number;
      total: number;
    };
  }> {
    const where = buildWhereClause(query, access);
    const [total, observations] = await prisma.$transaction([
      prisma.observation.count({
        where,
      }),
      prisma.observation.findMany({
        orderBy: buildOrderBy(query.sortBy, query.sortDirection),
        select: observationListSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: observations.map((observation) => mapObservationListItem(observation)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async updateObservation(
    observationId: string,
    input: UpdateObservationInput,
  ): Promise<{
    current: ObservationDetail;
    previous: ObservationDetail;
  }> {
    const existingObservation = await findObservationForMutation(observationId);
    const previousObservation = await prisma.observation.findFirst({
      select: observationDetailSelect,
      where: {
        deletedAt: null,
        id: observationId,
      },
    });

    if (!previousObservation) {
      throw new AppError("Observation not found.", 404);
    }

    const nextValues = {
      additionalAreaIds:
        input.additionalAreaIds ??
        existingObservation.areaAssignments.map((assignment) => assignment.areaId),
      areaId: input.areaId ?? existingObservation.areaId,
      auditRecommendation:
        input.auditRecommendation ?? existingObservation.auditRecommendation,
      category: input.category ?? existingObservation.category,
      code: input.code ?? existingObservation.code,
      currentStage: input.currentStage ?? existingObservation.currentStage,
      description: input.description ?? existingObservation.description,
      detectedAt: input.detectedAt ?? existingObservation.detectedAt,
      dueDate: input.dueDate ?? existingObservation.dueDate,
      observationType:
        input.observationType === undefined
          ? existingObservation.observationType
          : input.observationType,
      process: input.process ?? existingObservation.process,
      progressPercent: input.progressPercent ?? existingObservation.progressPercent,
      responsibleUserId:
        input.responsibleUserId === undefined
          ? existingObservation.responsibleUserId
          : input.responsibleUserId,
      riskLevelId: input.riskLevelId ?? existingObservation.riskLevelId,
      source: input.source ?? existingObservation.source,
      statusId: input.statusId ?? existingObservation.statusId,
      title: input.title ?? existingObservation.title,
    };

    const additionalAreaIds = sanitizeAdditionalAreaIds(
      nextValues.areaId,
      nextValues.additionalAreaIds,
    );

    await assertCodeAvailable(nextValues.code, observationId);
    await assertReferencesExist({
      additionalAreaIds,
      areaId: nextValues.areaId,
      category: nextValues.category,
      observationType: nextValues.observationType,
      process: nextValues.process,
      responsibleUserId: nextValues.responsibleUserId,
      riskLevelId: nextValues.riskLevelId,
      source: nextValues.source,
      statusId: nextValues.statusId,
    });

    const shouldSyncAreaAssignments =
      input.additionalAreaIds !== undefined ||
      input.areaId !== undefined ||
      input.responsibleUserId !== undefined;

    const updateData = {
      area: {
        connect: {
          id: nextValues.areaId,
        },
      },
      auditRecommendation: nextValues.auditRecommendation,
      category: nextValues.category,
      code: nextValues.code,
      currentStage: nextValues.currentStage,
      description: nextValues.description,
      detectedAt: nextValues.detectedAt,
      dueDate: nextValues.dueDate,
      observationType: nextValues.observationType,
      process: nextValues.process,
      progressPercent: nextValues.progressPercent,
      responsibleUser: nextValues.responsibleUserId
        ? {
            connect: {
              id: nextValues.responsibleUserId,
            },
          }
        : {
            disconnect: true,
          },
      riskLevel: {
        connect: {
          id: nextValues.riskLevelId,
        },
      },
      source: nextValues.source,
      status: {
        connect: {
          id: nextValues.statusId,
        },
      },
      title: nextValues.title,
      ...(shouldSyncAreaAssignments
        ? {
            areaAssignments: {
              deleteMany: {},
              ...(additionalAreaIds.length > 0
                ? {
                    create: additionalAreaIds.map((areaId) =>
                      buildAssignmentCreateInput(
                        areaId,
                        nextValues.responsibleUserId,
                      ),
                    ),
                  }
                : {}),
            },
          }
        : {}),
    };

    await prisma.observation.update({
      data: updateData,
      where: {
        id: observationId,
      },
    });

    const currentObservation = await prisma.observation.findFirst({
      select: observationDetailSelect,
      where: {
        deletedAt: null,
        id: observationId,
      },
    });

    if (!currentObservation) {
      throw new AppError("Observation not found after update.", 500);
    }

    return {
      current: mapObservationDetail(currentObservation),
      previous: mapObservationDetail(previousObservation),
    };
  },
};
