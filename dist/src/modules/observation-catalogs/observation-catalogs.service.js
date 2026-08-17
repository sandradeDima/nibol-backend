import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
const duplicate = (error) => {
    if (error.code === "P2002")
        throw new AppError("A catalog entry with that name already exists.", 409);
    throw error;
};
export const observationCatalogsService = {
    async createDictionary(input) {
        try {
            return await prisma.observationDictionary.create({
                data: {
                    description: input.description ?? null,
                    isActive: input.isActive,
                    name: input.name,
                },
            });
        }
        catch (error) {
            return duplicate(error);
        }
    },
    async createRisk(input) {
        try {
            return await prisma.risk.create({
                data: {
                    description: input.description ?? null,
                    isActive: input.isActive,
                    name: input.name,
                },
            });
        }
        catch (error) {
            return duplicate(error);
        }
    },
    async listDictionary(query) {
        const where = {
            ...(query.active !== undefined ? { isActive: query.active } : {}),
            ...(query.search
                ? {
                    OR: [
                        { name: { contains: query.search } },
                        { description: { contains: query.search } },
                    ],
                }
                : {}),
        };
        const [data, total] = await Promise.all([
            prisma.observationDictionary.findMany({
                orderBy: { name: "asc" },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
            prisma.observationDictionary.count({ where }),
        ]);
        return {
            data,
            pagination: {
                ...query,
                total,
                totalPages: Math.ceil(total / query.perPage),
            },
        };
    },
    async listRisks(query) {
        const where = {
            ...(query.active !== undefined ? { isActive: query.active } : {}),
            ...(query.search
                ? {
                    OR: [
                        { name: { contains: query.search } },
                        { description: { contains: query.search } },
                    ],
                }
                : {}),
        };
        const [data, total] = await Promise.all([
            prisma.risk.findMany({
                orderBy: { name: "asc" },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
            prisma.risk.count({ where }),
        ]);
        return {
            data,
            pagination: {
                ...query,
                total,
                totalPages: Math.ceil(total / query.perPage),
            },
        };
    },
    async updateDictionary(id, input) {
        const record = await prisma.observationDictionary.findUnique({
            where: { id },
        });
        if (!record)
            throw new AppError("Dictionary entry not found.", 404);
        try {
            return await prisma.observationDictionary.update({
                data: {
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                },
                where: { id },
            });
        }
        catch (error) {
            return duplicate(error);
        }
    },
    async updateRisk(id, input) {
        const record = await prisma.risk.findUnique({ where: { id } });
        if (!record)
            throw new AppError("Risk not found.", 404);
        try {
            return await prisma.risk.update({
                data: {
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                },
                where: { id },
            });
        }
        catch (error) {
            return duplicate(error);
        }
    },
};
//# sourceMappingURL=observation-catalogs.service.js.map