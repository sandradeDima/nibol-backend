import type { Prisma } from "../../../generated/prisma/client.js";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { CONFIGURATION_CATALOG_TYPES } from "./configuration.constants.js";
import type {
  AreaRecord,
  CatalogRecord,
  ConfigurationBootstrap,
  ConfigurationCatalogGroups,
  ConfigurationUserSummary,
  ObservationStatusRecord,
  PaginatedResult,
  RiskLevelRecord,
  SystemParameterRecord,
} from "./configuration.types.js";
import type {
  AreaMutationInput,
  CatalogMutationInput,
  CatalogType,
  ListAreasQuery,
  ListCatalogsQuery,
  ListObservationStatusesQuery,
  ListRiskLevelsQuery,
  ListSystemParametersQuery,
  ObservationStatusMutationInput,
  RiskLevelMutationInput,
  SystemParameterMutationInput,
  SystemParameterValueType,
} from "./configuration.validators.js";

const SYSTEM_WIDE_ROLE_NAMES = new Set([
  "admin",
  "sistema",
  "sistemas",
  "system",
  "systems",
]);

const configurationPrisma = prisma as typeof prisma & {
  catalog: any;
  systemParameter: any;
};

const userSummarySelect = {
  email: true,
  id: true,
  name: true,
} as const;

const areaRecordSelect = {
  active: true,
  code: true,
  createdAt: true,
  description: true,
  id: true,
  managerUser: {
    select: userSummarySelect,
  },
  name: true,
  updatedAt: true,
} as const;

const areaOptionSelect = {
  code: true,
  id: true,
  managerUser: {
    select: userSummarySelect,
  },
  name: true,
} as const;

const riskLevelRecordSelect = {
  active: true,
  colorToken: true,
  createdAt: true,
  defaultDeadlineDays: true,
  description: true,
  id: true,
  key: true,
  name: true,
  severityOrder: true,
  updatedAt: true,
} as const;

const observationStatusRecordSelect = {
  active: true,
  countsAsOverdue: true,
  createdAt: true,
  description: true,
  id: true,
  isFinal: true,
  isInitial: true,
  key: true,
  name: true,
  sortOrder: true,
  updatedAt: true,
} as const;

const systemParameterRecordSelect = {
  active: true,
  createdAt: true,
  description: true,
  editable: true,
  group: true,
  id: true,
  key: true,
  name: true,
  updatedAt: true,
  value: true,
  valueType: true,
} as const;

const catalogRecordSelect = {
  active: true,
  createdAt: true,
  description: true,
  id: true,
  key: true,
  name: true,
  sortOrder: true,
  type: true,
  updatedAt: true,
} as const;

const accessibleObservationSelect = {
  area: {
    select: areaOptionSelect,
  },
  areaAssignments: {
    select: {
      area: {
        select: areaOptionSelect,
      },
      responsibleUser: {
        select: userSummarySelect,
      },
    },
  },
  responsibleUser: {
    select: userSummarySelect,
  },
} as const;

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
    access.permissions.includes("observations.create") ||
    access.permissions.includes("observations.edit") ||
    access.permissions.includes("observations.delete")
  ) {
    return true;
  }

  return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};

const buildObservationVisibilityCondition = (
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

type AreaRecordRow = {
  active: boolean;
  code: string | null;
  createdAt: Date;
  description: string | null;
  id: string;
  managerUser: ConfigurationUserSummary | null;
  name: string;
  updatedAt: Date;
};

type AreaOptionRow = {
  code: string | null;
  id: string;
  managerUser: ConfigurationUserSummary | null;
  name: string;
};

type RiskLevelRecordRow = {
  active: boolean;
  colorToken: string | null;
  createdAt: Date;
  defaultDeadlineDays: number | null;
  description: string | null;
  id: string;
  key: string;
  name: string;
  severityOrder: number;
  updatedAt: Date;
};

type ObservationStatusRecordRow = {
  active: boolean;
  countsAsOverdue: boolean;
  createdAt: Date;
  description: string | null;
  id: string;
  isFinal: boolean;
  isInitial: boolean;
  key: string;
  name: string;
  sortOrder: number;
  updatedAt: Date;
};

type SystemParameterRecordRow = {
  active: boolean;
  createdAt: Date;
  description: string | null;
  editable: boolean;
  group: string;
  id: string;
  key: string;
  name: string;
  updatedAt: Date;
  value: string;
  valueType: string;
};

type CatalogRecordRow = {
  active: boolean;
  createdAt: Date;
  description: string | null;
  id: string;
  key: string | null;
  name: string;
  sortOrder: number;
  type: string;
  updatedAt: Date;
};

type AccessibleObservationRow = {
  area: AreaOptionRow;
  areaAssignments: Array<{
    area: AreaOptionRow;
    responsibleUser: ConfigurationUserSummary | null;
  }>;
  responsibleUser: ConfigurationUserSummary | null;
};

const mapUserSummary = (
  user: ConfigurationUserSummary | null,
): ConfigurationUserSummary | null => {
  if (!user) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
    name: user.name,
  };
};

const mapArea = (record: AreaRecordRow): AreaRecord => {
  return {
    active: record.active,
    code: record.code,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    managerUser: mapUserSummary(record.managerUser),
    name: record.name,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const mapRiskLevel = (record: RiskLevelRecordRow): RiskLevelRecord => {
  return {
    active: record.active,
    colorToken: record.colorToken,
    createdAt: record.createdAt.toISOString(),
    defaultDeadlineDays: record.defaultDeadlineDays,
    description: record.description,
    id: record.id,
    key: record.key,
    name: record.name,
    severityOrder: record.severityOrder,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const mapObservationStatus = (
  record: ObservationStatusRecordRow,
): ObservationStatusRecord => {
  return {
    active: record.active,
    countsAsOverdue: record.countsAsOverdue,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    isFinal: record.isFinal,
    isInitial: record.isInitial,
    key: record.key,
    name: record.name,
    sortOrder: record.sortOrder,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const mapSystemParameter = (
  record: SystemParameterRecordRow,
): SystemParameterRecord => {
  return {
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    editable: record.editable,
    group: record.group,
    id: record.id,
    key: record.key,
    name: record.name,
    updatedAt: record.updatedAt.toISOString(),
    value: record.value,
    valueType: record.valueType as SystemParameterValueType,
  };
};

const mapCatalog = (record: CatalogRecordRow): CatalogRecord => {
  return {
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    key: record.key,
    name: record.name,
    sortOrder: record.sortOrder,
    type: record.type as CatalogType,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const createEmptyCatalogGroups = (): ConfigurationCatalogGroups => {
  return {
    categoria_hallazgo: [],
    fuente_hallazgo: [],
    proceso_auditado: [],
    tipo_observacion: [],
  };
};

const ensureSystemParameterValueIsValid = (
  valueType: SystemParameterValueType,
  value: string,
): void => {
  switch (valueType) {
    case "string":
      return;
    case "number":
      if (!Number.isFinite(Number(value))) {
        throw new AppError("El valor debe ser numérico.", 400);
      }
      return;
    case "boolean":
      if (!["true", "false"].includes(value)) {
        throw new AppError("El valor booleano debe ser true o false.", 400);
      }
      return;
    case "json":
      try {
        JSON.parse(value);
      } catch {
        throw new AppError("El valor JSON no es válido.", 400);
      }
      return;
    case "date":
      if (Number.isNaN(Date.parse(value))) {
        throw new AppError("El valor de fecha no es válido.", 400);
      }
      return;
  }
};

const assertActiveUserExists = async (userId: string): Promise<void> => {
  const total = await prisma.user.count({
    where: {
      deletedAt: null,
      id: userId,
      isActive: true,
    },
  });

  if (total !== 1) {
    throw new AppError("El usuario seleccionado no es válido.", 400);
  }
};

const assertAreaNameAvailable = async (
  name: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await prisma.area.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      name,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un área o gerencia con este nombre.", 400);
  }
};

const assertAreaCodeAvailable = async (
  code: string | null,
  excludedId?: string,
): Promise<void> => {
  if (!code) {
    return;
  }

  const existing = await prisma.area.findFirst({
    select: {
      id: true,
    },
    where: {
      code,
      deletedAt: null,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un área o gerencia con este código.", 400);
  }
};

const assertRiskLevelNameAvailable = async (
  name: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await prisma.riskLevel.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      name,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un nivel de riesgo con este nombre.", 400);
  }
};

const assertRiskLevelKeyAvailable = async (
  key: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await prisma.riskLevel.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      key,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un nivel de riesgo con esta clave.", 400);
  }
};

const assertObservationStatusNameAvailable = async (
  name: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await prisma.observationStatus.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      name,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un estado de observación con este nombre.", 400);
  }
};

const assertObservationStatusKeyAvailable = async (
  key: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await prisma.observationStatus.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      key,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un estado de observación con esta clave.", 400);
  }
};

const assertSingleInitialStatus = async (
  isInitial: boolean,
  active: boolean,
  excludedId?: string,
): Promise<void> => {
  if (!isInitial || !active) {
    return;
  }

  const total = await prisma.observationStatus.count({
    where: {
      active: true,
      deletedAt: null,
      isInitial: true,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (total > 0) {
    throw new AppError("Solo puede existir un estado inicial activo.", 400);
  }
};

const assertSystemParameterKeyAvailable = async (
  key: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await configurationPrisma.systemParameter.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      key,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un parámetro con esta clave.", 400);
  }
};

const assertCatalogNameAvailable = async (
  type: CatalogType,
  name: string,
  excludedId?: string,
): Promise<void> => {
  const existing = await configurationPrisma.catalog.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      name,
      type,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un catálogo activo con este nombre.", 400);
  }
};

const assertCatalogKeyAvailable = async (
  type: CatalogType,
  key: string | null,
  excludedId?: string,
): Promise<void> => {
  if (!key) {
    return;
  }

  const existing = await configurationPrisma.catalog.findFirst({
    select: {
      id: true,
    },
    where: {
      deletedAt: null,
      key,
      type,
      ...(excludedId
        ? {
            id: {
              not: excludedId,
            },
          }
        : {}),
    },
  });

  if (existing) {
    throw new AppError("Ya existe un catálogo activo con esta clave.", 400);
  }
};

const findAreaRecordOrThrow = async (id: string): Promise<AreaRecordRow> => {
  const record = await prisma.area.findFirst({
    select: areaRecordSelect,
    where: {
      deletedAt: null,
      id,
    },
  });

  if (!record) {
    throw new AppError("Área o gerencia no encontrada.", 404);
  }

  return record;
};

const findRiskLevelRecordOrThrow = async (
  id: string,
): Promise<RiskLevelRecordRow> => {
  const record = await prisma.riskLevel.findFirst({
    select: riskLevelRecordSelect,
    where: {
      deletedAt: null,
      id,
    },
  });

  if (!record) {
    throw new AppError("Nivel de riesgo no encontrado.", 404);
  }

  return record;
};

const findObservationStatusRecordOrThrow = async (
  id: string,
): Promise<ObservationStatusRecordRow> => {
  const record = await prisma.observationStatus.findFirst({
    select: observationStatusRecordSelect,
    where: {
      deletedAt: null,
      id,
    },
  });

  if (!record) {
    throw new AppError("Estado de observación no encontrado.", 404);
  }

  return record;
};

const findSystemParameterRecordOrThrow = async (
  id: string,
): Promise<SystemParameterRecordRow> => {
  const record = await configurationPrisma.systemParameter.findFirst({
    select: systemParameterRecordSelect,
    where: {
      deletedAt: null,
      id,
    },
  });

  if (!record) {
    throw new AppError("Parámetro no encontrado.", 404);
  }

  return record;
};

const findCatalogRecordOrThrow = async (id: string): Promise<CatalogRecordRow> => {
  const record = await configurationPrisma.catalog.findFirst({
    select: catalogRecordSelect,
    where: {
      deletedAt: null,
      id,
    },
  });

  if (!record) {
    throw new AppError("Catálogo no encontrado.", 404);
  }

  return record;
};

const buildAreasWhere = (query: ListAreasQuery) => {
  return {
    deletedAt: null,
    ...(query.active !== undefined
      ? {
          active: query.active,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              code: {
                contains: query.search,
              },
            },
            {
              description: {
                contains: query.search,
              },
            },
            {
              managerUser: {
                email: {
                  contains: query.search,
                },
              },
            },
            {
              managerUser: {
                name: {
                  contains: query.search,
                },
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const buildAreasOrderBy = (
  sortBy: ListAreasQuery["sortBy"],
  sortDirection: ListAreasQuery["sortDirection"],
) => {
  switch (sortBy) {
    case "code":
      return { code: sortDirection };
    case "createdAt":
      return { createdAt: sortDirection };
    case "name":
      return { name: sortDirection };
    case "updatedAt":
      return { updatedAt: sortDirection };
  }
};

const buildRiskLevelsWhere = (
  query: ListRiskLevelsQuery,
) => {
  return {
    deletedAt: null,
    ...(query.active !== undefined
      ? {
          active: query.active,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              description: {
                contains: query.search,
              },
            },
            {
              key: {
                contains: query.search,
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const buildRiskLevelsOrderBy = (
  sortBy: ListRiskLevelsQuery["sortBy"],
  sortDirection: ListRiskLevelsQuery["sortDirection"],
) => {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortDirection };
    case "defaultDeadlineDays":
      return { defaultDeadlineDays: sortDirection };
    case "key":
      return { key: sortDirection };
    case "name":
      return { name: sortDirection };
    case "severityOrder":
      return { severityOrder: sortDirection };
    case "updatedAt":
      return { updatedAt: sortDirection };
  }
};

const buildObservationStatusesWhere = (
  query: ListObservationStatusesQuery,
) => {
  return {
    deletedAt: null,
    ...(query.active !== undefined
      ? {
          active: query.active,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              description: {
                contains: query.search,
              },
            },
            {
              key: {
                contains: query.search,
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const buildObservationStatusesOrderBy = (
  sortBy: ListObservationStatusesQuery["sortBy"],
  sortDirection: ListObservationStatusesQuery["sortDirection"],
) => {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortDirection };
    case "key":
      return { key: sortDirection };
    case "name":
      return { name: sortDirection };
    case "sortOrder":
      return { sortOrder: sortDirection };
    case "updatedAt":
      return { updatedAt: sortDirection };
  }
};

const buildSystemParametersWhere = (
  query: ListSystemParametersQuery,
) => {
  return {
    deletedAt: null,
    ...(query.active !== undefined
      ? {
          active: query.active,
        }
      : {}),
    ...(query.group
      ? {
          group: query.group,
        }
      : {}),
    ...(query.valueType
      ? {
          valueType: query.valueType,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              description: {
                contains: query.search,
              },
            },
            {
              key: {
                contains: query.search,
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
            {
              value: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const buildSystemParametersOrderBy = (
  sortBy: ListSystemParametersQuery["sortBy"],
  sortDirection: ListSystemParametersQuery["sortDirection"],
) => {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortDirection };
    case "group":
      return { group: sortDirection };
    case "key":
      return { key: sortDirection };
    case "name":
      return { name: sortDirection };
    case "updatedAt":
      return { updatedAt: sortDirection };
    case "valueType":
      return { valueType: sortDirection };
  }
};

const buildCatalogsWhere = (
  query: ListCatalogsQuery,
) => {
  return {
    deletedAt: null,
    ...(query.active !== undefined
      ? {
          active: query.active,
        }
      : {}),
    ...(query.type
      ? {
          type: query.type,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              description: {
                contains: query.search,
              },
            },
            {
              key: {
                contains: query.search,
              },
            },
            {
              name: {
                contains: query.search,
              },
            },
            {
              type: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const buildCatalogsOrderBy = (
  sortBy: ListCatalogsQuery["sortBy"],
  sortDirection: ListCatalogsQuery["sortDirection"],
) => {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortDirection };
    case "key":
      return { key: sortDirection };
    case "name":
      return { name: sortDirection };
    case "sortOrder":
      return { sortOrder: sortDirection };
    case "type":
      return { type: sortDirection };
    case "updatedAt":
      return { updatedAt: sortDirection };
  }
};

export const configurationService = {
  async createArea(input: AreaMutationInput): Promise<AreaRecord> {
    await Promise.all([
      assertAreaNameAvailable(input.name),
      assertAreaCodeAvailable(input.code),
      input.managerUserId ? assertActiveUserExists(input.managerUserId) : Promise.resolve(),
    ]);

    const record = await prisma.area.create({
      data: {
        active: input.active,
        code: input.code,
        description: input.description,
        name: input.name,
        ...(input.managerUserId
          ? {
              managerUser: {
                connect: {
                  id: input.managerUserId,
                },
              },
            }
          : {}),
      },
      select: areaRecordSelect,
    });

    return mapArea(record);
  },

  async createCatalog(input: CatalogMutationInput): Promise<CatalogRecord> {
    await Promise.all([
      assertCatalogNameAvailable(input.type, input.name),
      assertCatalogKeyAvailable(input.type, input.key),
    ]);

    const record = await configurationPrisma.catalog.create({
      data: {
        active: input.active,
        description: input.description,
        key: input.key,
        name: input.name,
        sortOrder: input.sortOrder,
        type: input.type,
      },
      select: catalogRecordSelect,
    });

    return mapCatalog(record);
  },

  async createObservationStatus(
    input: ObservationStatusMutationInput,
  ): Promise<ObservationStatusRecord> {
    await Promise.all([
      assertObservationStatusNameAvailable(input.name),
      assertObservationStatusKeyAvailable(input.key),
      assertSingleInitialStatus(input.isInitial, input.active),
    ]);

    const record = await prisma.observationStatus.create({
      data: {
        active: input.active,
        countsAsOverdue: input.countsAsOverdue,
        description: input.description,
        isFinal: input.isFinal,
        isInitial: input.isInitial,
        key: input.key,
        name: input.name,
        sortOrder: input.sortOrder,
      },
      select: observationStatusRecordSelect,
    });

    return mapObservationStatus(record);
  },

  async createRiskLevel(input: RiskLevelMutationInput): Promise<RiskLevelRecord> {
    await Promise.all([
      assertRiskLevelNameAvailable(input.name),
      assertRiskLevelKeyAvailable(input.key),
    ]);

    const record = await prisma.riskLevel.create({
      data: {
        active: input.active,
        colorToken: input.colorToken,
        defaultDeadlineDays: input.defaultDeadlineDays,
        description: input.description,
        key: input.key,
        name: input.name,
        severityOrder: input.severityOrder,
      },
      select: riskLevelRecordSelect,
    });

    return mapRiskLevel(record);
  },

  async createSystemParameter(
    input: SystemParameterMutationInput,
  ): Promise<SystemParameterRecord> {
    ensureSystemParameterValueIsValid(input.valueType, input.value);
    await assertSystemParameterKeyAvailable(input.key);

    const record = await configurationPrisma.systemParameter.create({
      data: {
        active: input.active,
        description: input.description,
        editable: input.editable,
        group: input.group,
        key: input.key,
        name: input.name,
        value: input.value,
        valueType: input.valueType,
      },
      select: systemParameterRecordSelect,
    });

    return mapSystemParameter(record);
  },

  async deleteArea(id: string): Promise<AreaRecord> {
    const previous = await findAreaRecordOrThrow(id);

    await prisma.area.update({
      data: {
        active: false,
        deletedAt: new Date(),
      },
      where: {
        id,
      },
    });

    return mapArea(previous);
  },

  async deleteCatalog(id: string): Promise<CatalogRecord> {
    const previous = await findCatalogRecordOrThrow(id);

    await configurationPrisma.catalog.update({
      data: {
        active: false,
        deletedAt: new Date(),
      },
      where: {
        id,
      },
    });

    return mapCatalog(previous);
  },

  async deleteObservationStatus(id: string): Promise<ObservationStatusRecord> {
    const previous = await findObservationStatusRecordOrThrow(id);

    await prisma.observationStatus.update({
      data: {
        active: false,
        deletedAt: new Date(),
      },
      where: {
        id,
      },
    });

    return mapObservationStatus(previous);
  },

  async deleteRiskLevel(id: string): Promise<RiskLevelRecord> {
    const previous = await findRiskLevelRecordOrThrow(id);

    await prisma.riskLevel.update({
      data: {
        active: false,
        deletedAt: new Date(),
      },
      where: {
        id,
      },
    });

    return mapRiskLevel(previous);
  },

  async deleteSystemParameter(id: string): Promise<SystemParameterRecord> {
    const previous = await findSystemParameterRecordOrThrow(id);

    await configurationPrisma.systemParameter.update({
      data: {
        active: false,
        deletedAt: new Date(),
      },
      where: {
        id,
      },
    });

    return mapSystemParameter(previous);
  },

  async getAreaById(id: string): Promise<AreaRecord> {
    return mapArea(await findAreaRecordOrThrow(id));
  },

  async getBootstrap(access: AuthorizationSummary): Promise<ConfigurationBootstrap> {
    const [riskLevels, statuses, catalogRecords] = await prisma.$transaction([
      prisma.riskLevel.findMany({
        orderBy: {
          severityOrder: "asc",
        },
        select: riskLevelRecordSelect,
        where: {
          active: true,
          deletedAt: null,
        },
      }),
      prisma.observationStatus.findMany({
        orderBy: {
          sortOrder: "asc",
        },
        select: observationStatusRecordSelect,
        where: {
          active: true,
          deletedAt: null,
        },
      }),
      configurationPrisma.catalog.findMany({
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        select: catalogRecordSelect,
        where: {
          active: true,
          deletedAt: null,
          type: {
            in: [...CONFIGURATION_CATALOG_TYPES],
          },
        },
      }),
    ]);

    const catalogs = createEmptyCatalogGroups();

    catalogRecords.forEach((record: CatalogRecordRow) => {
      catalogs[record.type as CatalogType].push(mapCatalog(record));
    });

    if (hasGlobalObservationAccess(access)) {
      const [areas, users] = await prisma.$transaction([
        prisma.area.findMany({
          orderBy: {
            name: "asc",
          },
          select: areaOptionSelect,
          where: {
            active: true,
            deletedAt: null,
          },
        }),
        prisma.user.findMany({
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: userSummarySelect,
          where: {
            deletedAt: null,
            isActive: true,
          },
        }),
      ]);

      return {
        areas: areas.map((area) => ({
          code: area.code,
          id: area.id,
          managerUser: mapUserSummary(area.managerUser),
          name: area.name,
        })),
        catalogs,
        riskLevels: riskLevels.map((record) => ({
          colorToken: record.colorToken,
          defaultDeadlineDays: record.defaultDeadlineDays,
          id: record.id,
          key: record.key,
          name: record.name,
          severityOrder: record.severityOrder,
        })),
        statuses: statuses.map((record) => ({
          countsAsOverdue: record.countsAsOverdue,
          id: record.id,
          isFinal: record.isFinal,
          isInitial: record.isInitial,
          key: record.key,
          name: record.name,
          sortOrder: record.sortOrder,
        })),
        users: users.map((user) => ({
          email: user.email,
          id: user.id,
          name: user.name,
        })),
      };
    }

    const accessibleObservations = await prisma.observation.findMany({
      select: accessibleObservationSelect,
      where: {
        AND: [
          {
            deletedAt: null,
          },
          buildObservationVisibilityCondition(access) ?? {},
        ],
      },
    });

    const areaMap = new Map<string, AreaOptionRow>();
    const userMap = new Map<string, ConfigurationUserSummary>();

    accessibleObservations.forEach((observation: AccessibleObservationRow) => {
      areaMap.set(observation.area.id, observation.area);

      if (observation.responsibleUser) {
        userMap.set(observation.responsibleUser.id, observation.responsibleUser);
      }

      observation.areaAssignments.forEach((assignment) => {
        areaMap.set(assignment.area.id, assignment.area);

        if (assignment.responsibleUser) {
          userMap.set(assignment.responsibleUser.id, assignment.responsibleUser);
        }
      });
    });

    return {
      areas: [...areaMap.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((area) => ({
          code: area.code,
          id: area.id,
          managerUser: mapUserSummary(area.managerUser),
          name: area.name,
        })),
      catalogs,
      riskLevels: riskLevels.map((record) => ({
        colorToken: record.colorToken,
        defaultDeadlineDays: record.defaultDeadlineDays,
        id: record.id,
        key: record.key,
        name: record.name,
        severityOrder: record.severityOrder,
      })),
      statuses: statuses.map((record) => ({
        countsAsOverdue: record.countsAsOverdue,
        id: record.id,
        isFinal: record.isFinal,
        isInitial: record.isInitial,
        key: record.key,
        name: record.name,
        sortOrder: record.sortOrder,
      })),
      users: [...userMap.values()].sort((left, right) => left.name.localeCompare(right.name)),
    };
  },

  async getCatalogById(id: string): Promise<CatalogRecord> {
    return mapCatalog(await findCatalogRecordOrThrow(id));
  },

  async getObservationStatusById(id: string): Promise<ObservationStatusRecord> {
    return mapObservationStatus(await findObservationStatusRecordOrThrow(id));
  },

  async getRiskLevelById(id: string): Promise<RiskLevelRecord> {
    return mapRiskLevel(await findRiskLevelRecordOrThrow(id));
  },

  async getSystemParameterById(id: string): Promise<SystemParameterRecord> {
    return mapSystemParameter(await findSystemParameterRecordOrThrow(id));
  },

  async listAreas(query: ListAreasQuery): Promise<PaginatedResult<AreaRecord>> {
    const where = buildAreasWhere(query);
    const [total, records] = await prisma.$transaction([
      prisma.area.count({
        where,
      }),
      prisma.area.findMany({
        orderBy: buildAreasOrderBy(query.sortBy, query.sortDirection),
        select: areaRecordSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: records.map((record) => mapArea(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listCatalogs(query: ListCatalogsQuery): Promise<PaginatedResult<CatalogRecord>> {
    const where = buildCatalogsWhere(query);
    const [total, records] = await prisma.$transaction([
      configurationPrisma.catalog.count({
        where,
      }),
      configurationPrisma.catalog.findMany({
        orderBy: buildCatalogsOrderBy(query.sortBy, query.sortDirection),
        select: catalogRecordSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: (records as CatalogRecordRow[]).map((record) => mapCatalog(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listObservationStatuses(
    query: ListObservationStatusesQuery,
  ): Promise<PaginatedResult<ObservationStatusRecord>> {
    const where = buildObservationStatusesWhere(query);
    const [total, records] = await prisma.$transaction([
      prisma.observationStatus.count({
        where,
      }),
      prisma.observationStatus.findMany({
        orderBy: buildObservationStatusesOrderBy(query.sortBy, query.sortDirection),
        select: observationStatusRecordSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: records.map((record) => mapObservationStatus(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listRiskLevels(
    query: ListRiskLevelsQuery,
  ): Promise<PaginatedResult<RiskLevelRecord>> {
    const where = buildRiskLevelsWhere(query);
    const [total, records] = await prisma.$transaction([
      prisma.riskLevel.count({
        where,
      }),
      prisma.riskLevel.findMany({
        orderBy: buildRiskLevelsOrderBy(query.sortBy, query.sortDirection),
        select: riskLevelRecordSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: records.map((record) => mapRiskLevel(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async listSystemParameters(
    query: ListSystemParametersQuery,
  ): Promise<PaginatedResult<SystemParameterRecord>> {
    const where = buildSystemParametersWhere(query);
    const [total, records] = await prisma.$transaction([
      configurationPrisma.systemParameter.count({
        where,
      }),
      configurationPrisma.systemParameter.findMany({
        orderBy: buildSystemParametersOrderBy(query.sortBy, query.sortDirection),
        select: systemParameterRecordSelect,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: (records as SystemParameterRecordRow[]).map((record) =>
        mapSystemParameter(record),
      ),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async updateArea(
    id: string,
    input: AreaMutationInput,
  ): Promise<{
    current: AreaRecord;
    previous: AreaRecord;
  }> {
    const previous = await findAreaRecordOrThrow(id);

    await Promise.all([
      assertAreaNameAvailable(input.name, id),
      assertAreaCodeAvailable(input.code, id),
      input.managerUserId ? assertActiveUserExists(input.managerUserId) : Promise.resolve(),
    ]);

    const record = await prisma.area.update({
      data: {
        active: input.active,
        code: input.code,
        deletedAt: null,
        description: input.description,
        managerUser: input.managerUserId
          ? {
              connect: {
                id: input.managerUserId,
              },
            }
          : {
              disconnect: true,
            },
        name: input.name,
      },
      select: areaRecordSelect,
      where: {
        id,
      },
    });

    return {
      current: mapArea(record),
      previous: mapArea(previous),
    };
  },

  async updateCatalog(
    id: string,
    input: CatalogMutationInput,
  ): Promise<{
    current: CatalogRecord;
    previous: CatalogRecord;
  }> {
    const previous = await findCatalogRecordOrThrow(id);

    await Promise.all([
      assertCatalogNameAvailable(input.type, input.name, id),
      assertCatalogKeyAvailable(input.type, input.key, id),
    ]);

    const record = await configurationPrisma.catalog.update({
      data: {
        active: input.active,
        deletedAt: null,
        description: input.description,
        key: input.key,
        name: input.name,
        sortOrder: input.sortOrder,
        type: input.type,
      },
      select: catalogRecordSelect,
      where: {
        id,
      },
    });

    return {
      current: mapCatalog(record),
      previous: mapCatalog(previous),
    };
  },

  async updateObservationStatus(
    id: string,
    input: ObservationStatusMutationInput,
  ): Promise<{
    current: ObservationStatusRecord;
    previous: ObservationStatusRecord;
  }> {
    const previous = await findObservationStatusRecordOrThrow(id);

    await Promise.all([
      assertObservationStatusNameAvailable(input.name, id),
      assertObservationStatusKeyAvailable(input.key, id),
      assertSingleInitialStatus(input.isInitial, input.active, id),
    ]);

    const record = await prisma.observationStatus.update({
      data: {
        active: input.active,
        countsAsOverdue: input.countsAsOverdue,
        deletedAt: null,
        description: input.description,
        isFinal: input.isFinal,
        isInitial: input.isInitial,
        key: input.key,
        name: input.name,
        sortOrder: input.sortOrder,
      },
      select: observationStatusRecordSelect,
      where: {
        id,
      },
    });

    return {
      current: mapObservationStatus(record),
      previous: mapObservationStatus(previous),
    };
  },

  async updateRiskLevel(
    id: string,
    input: RiskLevelMutationInput,
  ): Promise<{
    current: RiskLevelRecord;
    previous: RiskLevelRecord;
  }> {
    const previous = await findRiskLevelRecordOrThrow(id);

    await Promise.all([
      assertRiskLevelNameAvailable(input.name, id),
      assertRiskLevelKeyAvailable(input.key, id),
    ]);

    const record = await prisma.riskLevel.update({
      data: {
        active: input.active,
        colorToken: input.colorToken,
        defaultDeadlineDays: input.defaultDeadlineDays,
        deletedAt: null,
        description: input.description,
        key: input.key,
        name: input.name,
        severityOrder: input.severityOrder,
      },
      select: riskLevelRecordSelect,
      where: {
        id,
      },
    });

    return {
      current: mapRiskLevel(record),
      previous: mapRiskLevel(previous),
    };
  },

  async updateSystemParameter(
    id: string,
    input: SystemParameterMutationInput,
  ): Promise<{
    current: SystemParameterRecord;
    previous: SystemParameterRecord;
  }> {
    const previous = await findSystemParameterRecordOrThrow(id);

    ensureSystemParameterValueIsValid(input.valueType, input.value);
    await assertSystemParameterKeyAvailable(input.key, id);

    const record = await configurationPrisma.systemParameter.update({
      data: {
        active: input.active,
        deletedAt: null,
        description: input.description,
        editable: input.editable,
        group: input.group,
        key: input.key,
        name: input.name,
        value: input.value,
        valueType: input.valueType,
      },
      select: systemParameterRecordSelect,
      where: {
        id,
      },
    });

    return {
      current: mapSystemParameter(record),
      previous: mapSystemParameter(previous),
    };
  },
};
