import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { CONFIGURATION_CATALOG_TYPES } from "./configuration.constants.js";
const SYSTEM_WIDE_ROLE_NAMES = new Set([
    "admin",
    "sistema",
    "sistemas",
    "system",
    "systems",
]);
const configurationPrisma = prisma;
const userSummarySelect = {
    email: true,
    id: true,
    name: true,
};
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
};
const areaOptionSelect = {
    code: true,
    id: true,
    managerUser: {
        select: userSummarySelect,
    },
    name: true,
};
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
};
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
};
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
};
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
};
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
};
const normalizeRoleName = (value) => {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
};
const hasGlobalObservationAccess = (access) => {
    if (access.isAdmin) {
        return true;
    }
    if (access.permissions.includes("observations.create") ||
        access.permissions.includes("observations.edit") ||
        access.permissions.includes("observations.delete")) {
        return true;
    }
    return access.roles.some((role) => SYSTEM_WIDE_ROLE_NAMES.has(normalizeRoleName(role)));
};
const buildObservationVisibilityCondition = (access) => {
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
const mapUserSummary = (user) => {
    if (!user) {
        return null;
    }
    return {
        email: user.email,
        id: user.id,
        name: user.name,
    };
};
const mapArea = (record) => {
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
const mapRiskLevel = (record) => {
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
const mapObservationStatus = (record) => {
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
const mapSystemParameter = (record) => {
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
        valueType: record.valueType,
    };
};
const mapCatalog = (record) => {
    return {
        active: record.active,
        createdAt: record.createdAt.toISOString(),
        description: record.description,
        id: record.id,
        key: record.key,
        name: record.name,
        sortOrder: record.sortOrder,
        type: record.type,
        updatedAt: record.updatedAt.toISOString(),
    };
};
const createEmptyCatalogGroups = () => {
    return {
        categoria_hallazgo: [],
        fuente_hallazgo: [],
        proceso_auditado: [],
        tipo_observacion: [],
    };
};
const ensureSystemParameterValueIsValid = (valueType, value) => {
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
            }
            catch {
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
const assertActiveUserExists = async (userId) => {
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
const assertAreaNameAvailable = async (name, excludedId) => {
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
const assertAreaCodeAvailable = async (code, excludedId) => {
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
const assertRiskLevelNameAvailable = async (name, excludedId) => {
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
const assertRiskLevelKeyAvailable = async (key, excludedId) => {
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
const assertObservationStatusNameAvailable = async (name, excludedId) => {
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
const assertObservationStatusKeyAvailable = async (key, excludedId) => {
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
const assertSingleInitialStatus = async (isInitial, active, excludedId) => {
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
const assertSystemParameterKeyAvailable = async (key, excludedId) => {
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
const assertCatalogNameAvailable = async (type, name, excludedId) => {
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
const assertCatalogKeyAvailable = async (type, key, excludedId) => {
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
const findAreaRecordOrThrow = async (id) => {
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
const findRiskLevelRecordOrThrow = async (id) => {
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
const findObservationStatusRecordOrThrow = async (id) => {
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
const findSystemParameterRecordOrThrow = async (id) => {
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
const findCatalogRecordOrThrow = async (id) => {
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
const buildAreasWhere = (query) => {
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
const buildAreasOrderBy = (sortBy, sortDirection) => {
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
const buildRiskLevelsWhere = (query) => {
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
const buildRiskLevelsOrderBy = (sortBy, sortDirection) => {
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
const buildObservationStatusesWhere = (query) => {
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
const buildObservationStatusesOrderBy = (sortBy, sortDirection) => {
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
const buildSystemParametersWhere = (query) => {
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
const buildSystemParametersOrderBy = (sortBy, sortDirection) => {
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
const buildCatalogsWhere = (query) => {
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
const buildCatalogsOrderBy = (sortBy, sortDirection) => {
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
    async createArea(input) {
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
    async createCatalog(input) {
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
    async createObservationStatus(input) {
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
    async createRiskLevel(input) {
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
    async createSystemParameter(input) {
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
    async deleteArea(id) {
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
    async deleteCatalog(id) {
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
    async deleteObservationStatus(id) {
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
    async deleteRiskLevel(id) {
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
    async deleteSystemParameter(id) {
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
    async getAreaById(id) {
        return mapArea(await findAreaRecordOrThrow(id));
    },
    async getBootstrap(access) {
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
        catalogRecords.forEach((record) => {
            catalogs[record.type].push(mapCatalog(record));
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
        const areaMap = new Map();
        const userMap = new Map();
        accessibleObservations.forEach((observation) => {
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
    async getCatalogById(id) {
        return mapCatalog(await findCatalogRecordOrThrow(id));
    },
    async getObservationStatusById(id) {
        return mapObservationStatus(await findObservationStatusRecordOrThrow(id));
    },
    async getRiskLevelById(id) {
        return mapRiskLevel(await findRiskLevelRecordOrThrow(id));
    },
    async getSystemParameterById(id) {
        return mapSystemParameter(await findSystemParameterRecordOrThrow(id));
    },
    async listAreas(query) {
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
    async listCatalogs(query) {
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
            data: records.map((record) => mapCatalog(record)),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async listObservationStatuses(query) {
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
    async listRiskLevels(query) {
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
    async listSystemParameters(query) {
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
            data: records.map((record) => mapSystemParameter(record)),
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
            },
        };
    },
    async updateArea(id, input) {
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
    async updateCatalog(id, input) {
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
    async updateObservationStatus(id, input) {
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
    async updateRiskLevel(id, input) {
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
    async updateSystemParameter(id, input) {
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
//# sourceMappingURL=configuration.service.js.map