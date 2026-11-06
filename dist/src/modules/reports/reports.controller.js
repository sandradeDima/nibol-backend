import { AppError } from "../../utils/app-error.js";
import { env } from "../../utils/env.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { buildExcelWorkbook, buildObservationDetailWorkbook, } from "./reports.exports.js";
import { buildReportPdf } from "./reports.pdf.js";
import { reportsService } from "./reports.service.js";
import { auditReportExportQuerySchema, auditReportQuerySchema, reportExportQuerySchema, reportFiltersSchema, reportPreviewQuerySchema, reportQuerySchema, } from "./reports.validators.js";
const getQueryValue = (value) => {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value) && typeof value[0] === "string")
        return value[0];
    return undefined;
};
const auditTemplateLabels = {
    ACTIVITY_AREA: "Actividad por área",
    ACTIVITY_USER: "Actividad por usuario",
    APPROVALS: "Aprobaciones y rechazos",
    DEADLINES: "Fechas límite",
    EVIDENCE: "Evidencias",
    EXTENSIONS: "Ampliaciones",
    HISTORY: "Historial de observación",
    INCUMPLIMIENTOS: "Incumplimientos",
    WORKFLOW_HISTORY: "Historial de flujos",
};
const getAccess = (request) => {
    if (!request.authorizationSummary) {
        throw new AppError("Se requiere autorización.", 401);
    }
    return request.authorizationSummary;
};
const reportQueryInput = (request) => ({
    activeOnly: getQueryValue(request.query["filter.activeOnly"]),
    areaId: getQueryValue(request.query["filter.areaId"]),
    areaIds: getQueryValue(request.query["filter.areaIds"]),
    areaResponsibleId: getQueryValue(request.query["filter.areaResponsibleId"]),
    auditReportId: getQueryValue(request.query["filter.auditReportId"]),
    dateFrom: getQueryValue(request.query["filter.dateFrom"]),
    dateTo: getQueryValue(request.query["filter.dateTo"]),
    cutoffDate: getQueryValue(request.query.fechaCorte) ??
        getQueryValue(request.query["filter.cutoffDate"]) ??
        getQueryValue(request.query["filter.fechaCorte"]),
    deadlineStatus: getQueryValue(request.query["filter.deadlineStatus"]),
    deadlineStatuses: getQueryValue(request.query["filter.deadlineStatuses"]),
    dueSoon: getQueryValue(request.query["filter.dueSoon"]),
    dueSoonDays: getQueryValue(request.query["filter.dueSoonDays"]),
    executorId: getQueryValue(request.query["filter.executorId"]),
    globalStatus: getQueryValue(request.query["filter.globalStatus"]),
    hasEvidence: getQueryValue(request.query["filter.hasEvidence"]),
    hasExtension: getQueryValue(request.query["filter.hasExtension"]),
    hasPlan: getQueryValue(request.query["filter.hasPlan"]),
    includeActionPlans: getQueryValue(request.query.includeActionPlans),
    overdue: getQueryValue(request.query["filter.overdue"]),
    page: getQueryValue(request.query.page),
    perPage: getQueryValue(request.query.perPage),
    periodField: getQueryValue(request.query.periodField),
    progressMax: getQueryValue(request.query["filter.progressMax"]),
    progressMin: getQueryValue(request.query["filter.progressMin"]),
    progressStatus: getQueryValue(request.query["filter.progressStatus"]),
    progressStatuses: getQueryValue(request.query["filter.progressStatuses"]),
    processOwnerId: getQueryValue(request.query["filter.processOwnerId"]),
    reprogrammed: getQueryValue(request.query["filter.reprogrammed"]),
    reportName: getQueryValue(request.query.reportName),
    pdfView: getQueryValue(request.query.pdfView),
    responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
    riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
    riskLevelIds: getQueryValue(request.query["filter.riskLevelIds"]),
    search: getQueryValue(request.query["filter.search"]) ??
        getQueryValue(request.query.search),
    statusId: getQueryValue(request.query["filter.statusId"]),
    observationStatusIds: getQueryValue(request.query["filter.observationStatusIds"]),
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
        const format = getQueryValue(request.query.format) ?? "excel";
        const report = await reportsService.getPreview(query, getAccess(request), format === "pdf" && query.includeActionPlans);
        const filters = report.filters;
        if (format === "pdf") {
            if (query.pdfView !== "GENERATOR" && query.type !== "ACTION_PLANS")
                throw new AppError("La vista PDF requiere planes de acción.", 400);
            const access = getAccess(request);
            const dashboard = ["REPORTS", "DASHBOARD"].includes(query.pdfView)
                ? await reportsService.getDashboard(query, access)
                : undefined;
            const staticDashboard = query.pdfView === "REPORTS"
                ? await reportsService.getDashboard(reportFiltersSchema.parse({}), access)
                : undefined;
            sendFile(response, await buildReportPdf({
                ...(dashboard ? { dashboard } : {}),
                filters,
                preview: report,
                reportName: report.reportName,
                ...(staticDashboard ? { staticDashboard } : {}),
                ...(report.actionPlanRows
                    ? {
                        actionPlanRows: report.actionPlanRows.map((row) => ({
                            ...row,
                            href: new URL(row.href, env.FRONTEND_URL).toString(),
                        })),
                    }
                    : {}),
                includeActionPlans: query.includeActionPlans,
                view: query.pdfView,
            }), "application/pdf", "reporte-nibol.pdf");
            return;
        }
        if (query.type === "OBSERVATIONS") {
            sendFile(response, buildObservationDetailWorkbook({
                filters,
                generatedAt: report.generatedAt,
                reportName: report.reportName,
                rows: report.rows.map((row) => report.columns.map((column) => row[column])),
            }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "observaciones-detalle.xlsx");
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
        const access = getAccess(request);
        const format = getQueryValue(request.query.format) ?? "excel";
        const report = await reportsService.getAuditReport(format === "pdf" ? { ...query, page: 1 } : query, access);
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
            if (["HISTORY", "ACTIVITY_AREA", "ACTIVITY_USER", "APPROVALS"].includes(query.template)) {
                for (let page = 2; (page - 1) * query.perPage < report.summary.total; page += 1) {
                    const next = await reportsService.getAuditReport({ ...query, page }, access);
                    report.rows.push(...next.rows);
                    report.timeline?.push(...(next.timeline ?? []));
                }
            }
            sendFile(response, await buildReportPdf({
                audit: report,
                filters,
                reportName: auditTemplateLabels[query.template],
                view: "AUDIT",
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