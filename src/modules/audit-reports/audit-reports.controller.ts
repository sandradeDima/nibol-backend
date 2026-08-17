import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { auditReportsService } from "./audit-reports.service.js";
import {
  auditReportIdParamSchema,
  createAuditReportSchema,
  listAuditReportsQuerySchema,
  updateAuditReportSchema,
} from "./audit-reports.validators.js";

const value = (input: unknown): string | undefined =>
  typeof input === "string" ? input : undefined;
const id = (request: Request) =>
  auditReportIdParamSchema.parse({ id: value(request.params.id) }).id;
const userId = (request: Request) => {
  if (!request.authorizationSummary)
    throw new AppError("Authorization required.", 401);
  return request.authorizationSummary.userId;
};

export const auditReportsController = {
  async create(request: Request, response: Response) {
    const record = await auditReportsService.create(
      createAuditReportSchema.parse(request.body),
      userId(request),
    );
    const actor = getRequestLogActorContext(request);
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: "audit_reports.create",
        entityId: record.id,
        entityType: "AUDIT_REPORT_SOURCE",
        metadata: { summary: `Se creó el informe ${record.reportNumber}.` },
      }),
      auditLogService.create({
        ...actor,
        entityId: record.id,
        entityType: "AUDIT_REPORT_SOURCE",
        newValues: record,
        oldValues: null,
      }),
      entityActivityService.create({
        action: "create",
        activityType: "AUDIT_REPORT_CREATED",
        actorUserId: actor.userId,
        entityId: record.id,
        entityType: "AUDIT_REPORT",
        newData: record,
        targetUrl: "/administracion/informes-auditoria",
        title: "Informe de Auditoría creado",
      }),
    ]);
    sendSuccess(response, record, 201);
  },
  async getById(request: Request, response: Response) {
    sendSuccess(response, await auditReportsService.getById(id(request)));
  },
  async list(request: Request, response: Response) {
    const result = await auditReportsService.list(
      listAuditReportsQuerySchema.parse({
        dateFrom: value(request.query["filter.dateFrom"]),
        dateTo: value(request.query["filter.dateTo"]),
        page: value(request.query.page),
        perPage: value(request.query.perPage),
        search: value(request.query.search),
      }),
    );
    sendPaginated(response, result.data, result.pagination);
  },
  async remove(request: Request, response: Response) {
    const record = await auditReportsService.remove(id(request));
    const actor = getRequestLogActorContext(request);
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: "audit_reports.delete",
        entityId: record.id,
        entityType: "AUDIT_REPORT_SOURCE",
        metadata: { summary: `Se archivó el informe ${record.reportNumber}.` },
      }),
      auditLogService.create({
        ...actor,
        entityId: record.id,
        entityType: "AUDIT_REPORT_SOURCE",
        newValues: null,
        oldValues: record,
      }),
      entityActivityService.create({
        action: "archive",
        activityType: "AUDIT_REPORT_ARCHIVED",
        actorUserId: actor.userId,
        entityId: record.id,
        entityType: "AUDIT_REPORT",
        previousData: record,
        title: "Informe de Auditoría archivado",
      }),
    ]);
    sendSuccess(response, { archived: true, id: record.id });
  },
  async update(request: Request, response: Response) {
    const result = await auditReportsService.update(
      id(request),
      updateAuditReportSchema.parse(request.body),
    );
    const actor = getRequestLogActorContext(request);
    await Promise.all([
      activityLogService.logUserAction({
        ...actor,
        action: "audit_reports.edit",
        entityId: result.current.id,
        entityType: "AUDIT_REPORT_SOURCE",
        metadata: {
          summary: `Se actualizó el informe ${result.current.reportNumber}.`,
        },
      }),
      auditLogService.create({
        ...actor,
        entityId: result.current.id,
        entityType: "AUDIT_REPORT_SOURCE",
        newValues: result.current,
        oldValues: result.previous,
      }),
      entityActivityService.recordEntityChange({
        action: "update",
        activityType: "AUDIT_REPORT_UPDATED",
        actorUserId: actor.userId,
        entityId: result.current.id,
        entityType: "AUDIT_REPORT",
        newData: result.current,
        previousData: result.previous,
        targetUrl: "/administracion/informes-auditoria",
        title: "Informe de Auditoría actualizado",
      }),
    ]);
    sendSuccess(response, result.current);
  },
};
