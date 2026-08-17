import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { observationDeadlineService } from "../observations/observation-deadline.service.js";
const include = {
    _count: { select: { observations: { where: { deletedAt: null } } } },
    createdByUser: {
        select: { email: true, id: true, jobTitle: true, name: true },
    },
    reportClass: {
        select: { active: true, description: true, id: true, name: true },
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
};
const format = (record) => {
    const plans = record.observations.flatMap((observation) => observation.actionPlans);
    const completionPercent = plans.length
        ? Math.round(plans.reduce((sum, plan) => sum + plan.progressPercent, 0) /
            plans.length)
        : 0;
    const byRiskLevel = record.observations.reduce((counts, observation) => {
        counts[observation.riskLevel.name] =
            (counts[observation.riskLevel.name] ?? 0) + 1;
        return counts;
    }, {});
    return {
        completionPercent,
        createdAt: record.createdAt.toISOString(),
        createdByUser: record.createdByUser,
        id: record.id,
        observationCount: record._count.observations,
        observationsByRiskLevel: byRiskLevel,
        reportDate: record.reportDate.toISOString(),
        reportClass: record.reportClass,
        reportNumber: record.reportNumber,
        title: record.title,
        updatedAt: record.updatedAt.toISOString(),
    };
};
const find = async (id) => {
    const record = await prisma.auditReport.findFirst({
        include,
        where: { deletedAt: null, id },
    });
    if (!record)
        throw new AppError("No se encontró el informe de Auditoría.", 404);
    return record;
};
const validateReportClass = async (reportClassId) => {
    if (!reportClassId)
        return;
    const reportClass = await prisma.auditReportClass.findFirst({
        select: { id: true },
        where: { active: true, deletedAt: null, id: reportClassId },
    });
    if (!reportClass)
        throw new AppError("La clase de informe seleccionada no existe o está inactiva.", 400);
};
export const auditReportsService = {
    async create(input, createdByUserId) {
        await validateReportClass(input.reportClassId);
        try {
            const record = await prisma.auditReport.create({
                data: {
                    createdByUserId,
                    reportDate: input.reportDate,
                    reportNumber: input.reportNumber,
                    title: input.title,
                    ...(input.reportClassId !== undefined
                        ? { reportClassId: input.reportClassId }
                        : {}),
                },
                include,
            });
            return format(record);
        }
        catch (error) {
            if (error.code === "P2002")
                throw new AppError("Ya existe un informe de Auditoría con ese número.", 409);
            throw error;
        }
    },
    async getById(id) {
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
    async list(query) {
        const where = {
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
    async remove(id) {
        const record = await find(id);
        if (record._count.observations > 0) {
            throw new AppError("No se puede archivar un informe de Auditoría que tiene observaciones.", 409);
        }
        const previous = format(record);
        await prisma.auditReport.update({
            data: { deletedAt: new Date() },
            where: { id },
        });
        return previous;
    },
    async update(id, input) {
        const previous = format(await find(id));
        await validateReportClass(input.reportClassId);
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
                        ...(input.reportClassId !== undefined
                            ? { reportClassId: input.reportClassId }
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
                        if (observation._count.actionPlans > 0 ||
                            observation.deadlineExtensionRequests.length > 0)
                            continue;
                        const deadline = observationDeadlineService.calculate(input.reportDate, observation.riskLevel.key);
                        await tx.observation.update({
                            data: { currentDueDate: deadline, originalDueDate: deadline },
                            where: { id: observation.id },
                        });
                    }
                }
            });
            return { current: format(await find(id)), previous };
        }
        catch (error) {
            if (error.code === "P2002")
                throw new AppError("Ya existe un informe de Auditoría con ese número.", 409);
            throw error;
        }
    },
    async createClass(input) {
        try {
            return await prisma.auditReportClass.create({ data: input });
        }
        catch (error) {
            if (error.code === "P2002")
                throw new AppError("Ya existe una clase de informe con ese nombre.", 409);
            throw error;
        }
    },
    async listClasses(query) {
        const where = {
            deletedAt: null,
            ...(query.active !== undefined ? { active: query.active } : {}),
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
            prisma.auditReportClass.findMany({
                orderBy: { name: "asc" },
                skip: (query.page - 1) * query.perPage,
                take: query.perPage,
                where,
            }),
            prisma.auditReportClass.count({ where }),
        ]);
        return {
            data,
            pagination: {
                page: query.page,
                perPage: query.perPage,
                total,
                totalPages: Math.ceil(total / query.perPage),
            },
        };
    },
    async updateClass(id, input) {
        const existing = await prisma.auditReportClass.findFirst({
            select: { id: true },
            where: { deletedAt: null, id },
        });
        if (!existing)
            throw new AppError("No se encontró la clase de informe.", 404);
        try {
            return await prisma.auditReportClass.update({
                data: {
                    ...(input.active !== undefined ? { active: input.active } : {}),
                    ...(input.description !== undefined
                        ? { description: input.description }
                        : {}),
                    ...(input.name !== undefined ? { name: input.name } : {}),
                },
                where: { id },
            });
        }
        catch (error) {
            if (error.code === "P2002")
                throw new AppError("Ya existe una clase de informe con ese nombre.", 409);
            throw error;
        }
    },
    async removeClass(id) {
        const reportCount = await prisma.auditReport.count({
            where: { deletedAt: null, reportClassId: id },
        });
        if (reportCount > 0)
            throw new AppError("No se puede eliminar una clase asignada a informes activos. Desactívela o reasigne los informes.", 409);
        const existing = await prisma.auditReportClass.findFirst({
            where: { deletedAt: null, id },
        });
        if (!existing)
            throw new AppError("No se encontró la clase de informe.", 404);
        await prisma.auditReportClass.update({
            data: { active: false, deletedAt: new Date() },
            where: { id },
        });
        return existing;
    },
};
//# sourceMappingURL=audit-reports.service.js.map