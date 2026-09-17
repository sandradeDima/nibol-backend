import { AppError } from "../../utils/app-error.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { buildExcelWorkbook, buildReportPdf, buildSimplePdf, } from "./reports.exports.js";
import { reportsService } from "./reports.service.js";
import { auditReportExportQuerySchema, auditReportQuerySchema, reportExportQuerySchema, reportFiltersSchema, reportPreviewQuerySchema, reportQuerySchema, } from "./reports.validators.js";
const getQueryValue = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const getAccess = (request) => {
    if (!request.authorizationSummary) {
        throw new AppError("Authorization required.", 401);
    }
    return request.authorizationSummary;
};
const reportQueryInput = (request) => ({
    activeOnly: getQueryValue(request.query["filter.activeOnly"]),
    areaId: getQueryValue(request.query["filter.areaId"]),
    areaResponsibleId: getQueryValue(request.query["filter.areaResponsibleId"]),
    auditReportId: getQueryValue(request.query["filter.auditReportId"]),
    dateFrom: getQueryValue(request.query["filter.dateFrom"]),
    dateTo: getQueryValue(request.query["filter.dateTo"]),
    cutoffDate: getQueryValue(request.query.fechaCorte) ??
        getQueryValue(request.query["filter.cutoffDate"]) ??
        getQueryValue(request.query["filter.fechaCorte"]),
    deadlineStatus: getQueryValue(request.query["filter.deadlineStatus"]),
    dueSoon: getQueryValue(request.query["filter.dueSoon"]),
    dueSoonDays: getQueryValue(request.query["filter.dueSoonDays"]),
    executorId: getQueryValue(request.query["filter.executorId"]),
    hasEvidence: getQueryValue(request.query["filter.hasEvidence"]),
    hasExtension: getQueryValue(request.query["filter.hasExtension"]),
    hasPlan: getQueryValue(request.query["filter.hasPlan"]),
    overdue: getQueryValue(request.query["filter.overdue"]),
    page: getQueryValue(request.query.page),
    perPage: getQueryValue(request.query.perPage),
    periodField: getQueryValue(request.query.periodField),
    progressMax: getQueryValue(request.query["filter.progressMax"]),
    progressMin: getQueryValue(request.query["filter.progressMin"]),
    progressStatus: getQueryValue(request.query["filter.progressStatus"]),
    processOwnerId: getQueryValue(request.query["filter.processOwnerId"]),
    reprogrammed: getQueryValue(request.query["filter.reprogrammed"]),
    reportName: getQueryValue(request.query.reportName),
    responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
    riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
    search: getQueryValue(request.query["filter.search"]) ??
        getQueryValue(request.query.search),
    statusId: getQueryValue(request.query["filter.statusId"]),
    type: getQueryValue(request.query.type),
});
const auditQueryInput = (request) => ({
    areaId: getQueryValue(request.query["filter.areaId"]),
    dateFrom: getQueryValue(request.query["filter.dateFrom"]),
    dateTo: getQueryValue(request.query["filter.dateTo"]),
    eventType: getQueryValue(request.query["filter.eventType"]),
    observationId: getQueryValue(request.query.observationId) ??
        getQueryValue(request.query["filter.observationId"]),
    page: getQueryValue(request.query.page),
    perPage: getQueryValue(request.query.perPage),
    process: getQueryValue(request.query["filter.process"]),
    result: getQueryValue(request.query["filter.result"]),
    riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
    search: getQueryValue(request.query.search),
    status: getQueryValue(request.query["filter.status"]),
    template: getQueryValue(request.query.template),
    userId: getQueryValue(request.query["filter.userId"]),
});
const sendFile = (response, body, contentType, fileName) => {
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.send(body);
};
export const reportsController = {
    async dashboard(request, response) {
        const filters = reportFiltersSchema.parse(reportQueryInput(request));
        sendSuccess(response, await reportsService.getDashboard(filters, getAccess(request)));
    },
    async options(request, response) {
        sendSuccess(response, await reportsService.getOptions(getAccess(request)));
    },
    async listActionPlans(request, response) {
        const query = reportQuerySchema.parse(reportQueryInput(request));
        const result = await reportsService.listActionPlans(query, getAccess(request));
        sendPaginated(response, result.data, {
            page: query.page,
            perPage: query.perPage,
            total: result.total,
        });
    },
    async listObservations(request, response) {
        const query = reportQuerySchema.parse(reportQueryInput(request));
        const result = await reportsService.listObservations(query, getAccess(request));
        sendPaginated(response, result.data, {
            page: query.page,
            perPage: query.perPage,
            total: result.total,
        });
    },
    async preview(request, response) {
        const query = reportPreviewQuerySchema.parse(reportQueryInput(request));
        sendSuccess(response, await reportsService.getPreview(query, getAccess(request)));
    },
    async audit(request, response) {
        const query = auditReportQuerySchema.parse(auditQueryInput(request));
        const result = await reportsService.getAuditReport(query, getAccess(request));
        sendSuccess(response, result);
    },
    async auditHistoryForObservation(request, response) {
        const query = auditReportQuerySchema.parse({
            ...auditQueryInput(request),
            observationId: request.params.observationId,
            template: "HISTORY",
        });
        sendSuccess(response, await reportsService.getAuditReport(query, getAccess(request)));
    },
    async auditOptions(request, response) {
        sendSuccess(response, await reportsService.getAuditOptions(getAccess(request)));
    },
    async exportReport(request, response) {
        const query = reportExportQuerySchema.parse(reportQueryInput(request));
        const report = await reportsService.getPreview(query, getAccess(request));
        const format = getQueryValue(request.query.format) ?? "excel";
        const filters = report.filters;
        if (format === "pdf") {
            sendFile(response, buildReportPdf({
                charts: report.charts,
                columns: report.columns,
                filters,
                generatedAt: report.generatedAt,
                reportName: report.reportName,
                rows: report.rows,
                summary: report.summary,
            }), "application/pdf", "reporte-nibol.pdf");
            return;
        }
        sendFile(response, buildExcelWorkbook({
            charts: report.charts,
            columns: report.columns,
            filters,
            generatedAt: report.generatedAt,
            reportName: report.reportName,
            rows: report.rows,
            summary: report.summary,
        }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "reporte-nibol.xlsx");
    },
    async exportAudit(request, response) {
        const query = auditReportExportQuerySchema.parse(auditQueryInput(request));
        const report = await reportsService.getAuditReport(query, getAccess(request));
        const format = getQueryValue(request.query.format) ?? "excel";
        const reportName = `Reporte de Auditoría — ${query.template}`;
        const filters = {
            Área: query.areaId ?? "Todas",
            Observación: query.observationId ?? "Todas",
            Período: query.dateFrom || query.dateTo
                ? `${query.dateFrom ?? "Inicio"} – ${query.dateTo ?? "Hoy"}`
                : "Período actual",
            Usuario: query.userId ?? "Todos",
        };
        if (format === "pdf") {
            sendFile(response, buildSimplePdf({
                columns: report.columns,
                filters,
                generatedAt: report.generatedAt,
                reportName,
                rows: report.rows,
            }), "application/pdf", "reporte-auditoria-nibol.pdf");
            return;
        }
        sendFile(response, buildExcelWorkbook({
            columns: report.columns,
            filters,
            generatedAt: report.generatedAt,
            reportName,
            rows: report.rows,
        }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "reporte-auditoria-nibol.xlsx");
    },
};
//# sourceMappingURL=reports.controller.js.map