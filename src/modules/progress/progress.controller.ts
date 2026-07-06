import { createReadStream } from "node:fs";

import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import {
  PROGRESS_ACTIVITY_ACTIONS,
  PROGRESS_ENTITY_TYPES,
} from "./progress.constants.js";
import { progressService } from "./progress.service.js";
import {
  commentIdParamSchema,
  createCommentSchema,
  createProgressUpdateSchema,
  evidenceIdParamSchema,
  listProgressUpdatesQuerySchema,
  observationIdParamSchema,
  progressUpdateIdParamSchema,
  reviewProgressUpdateSchema,
  updateCommentSchema,
  updateProgressUpdateSchema,
  uploadObservationEvidenceSchema,
} from "./progress.validators.js";

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return undefined;
};

const getRequiredObservationId = (
  value: string | string[] | undefined,
): string => {
  const observationId = Array.isArray(value) ? value[0] : value;

  if (!observationId) {
    throw new AppError("Observation id is required.", 400);
  }

  return observationIdParamSchema.parse({
    id: observationId,
  }).id;
};

const getRequiredProgressUpdateId = (
  value: string | string[] | undefined,
): string => {
  const progressUpdateId = Array.isArray(value) ? value[0] : value;

  if (!progressUpdateId) {
    throw new AppError("Progress update id is required.", 400);
  }

  return progressUpdateIdParamSchema.parse({
    id: progressUpdateId,
  }).id;
};

const getRequiredEvidenceId = (
  value: string | string[] | undefined,
): string => {
  const evidenceId = Array.isArray(value) ? value[0] : value;

  if (!evidenceId) {
    throw new AppError("Evidence id is required.", 400);
  }

  return evidenceIdParamSchema.parse({
    id: evidenceId,
  }).id;
};

const getRequiredCommentId = (
  value: string | string[] | undefined,
): string => {
  const commentId = Array.isArray(value) ? value[0] : value;

  if (!commentId) {
    throw new AppError("Comment id is required.", 400);
  }

  return commentIdParamSchema.parse({
    id: commentId,
  }).id;
};

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

const logAction = async ({
  action,
  entityId,
  entityType,
  newValues,
  oldValues,
  request,
  summary,
}: {
  action: string;
  entityId: string;
  entityType: string;
  newValues: unknown;
  oldValues: unknown;
  request: Request;
  summary: string;
}) => {
  const actorContext = getRequestLogActorContext(request);

  await Promise.all([
    activityLogService.logUserAction({
      ...actorContext,
      action,
      entityId,
      entityType,
      metadata: {
        summary,
      },
    }),
    auditLogService.create({
      ...actorContext,
      entityId,
      entityType,
      newValues,
      oldValues,
    }),
  ]);
};

const getMultipartFiles = (request: Request) => {
  const files = request.files;

  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new AppError("At least one file is required.", 400);
  }

  return files.map((file) => ({
    buffer: file.buffer,
    mimetype: file.mimetype,
    originalName: file.originalname,
    size: file.size,
  }));
};

export const progressController = {
  async approveProgressUpdate(request: Request, response: Response) {
    const progressUpdate = await progressService.reviewProgressUpdate(
      getRequiredProgressUpdateId(request.params.id),
      "approve",
      reviewProgressUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.approveProgressUpdate,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: {
        id: progressUpdate.id,
        status: "SENT_TO_AUDIT",
      },
      request,
      summary: `El avance ${progressUpdate.id} fue aprobado por Auditoria.`,
    });

    sendSuccess(response, progressUpdate);
  },

  async createComment(request: Request, response: Response) {
    const observationId = getRequiredObservationId(request.params.id);
    const comment = await progressService.createObservationComment(
      observationId,
      createCommentSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.createComment,
      entityId: comment.id,
      entityType: PROGRESS_ENTITY_TYPES.comment,
      newValues: comment,
      oldValues: null,
      request,
      summary: `Se registro un comentario sobre la observacion ${observationId}.`,
    });

    sendSuccess(response, comment, 201);
  },

  async createObservationEvidence(request: Request, response: Response) {
    const observationId = getRequiredObservationId(request.params.id);
    const evidences = await progressService.uploadObservationEvidence(
      observationId,
      getMultipartFiles(request),
      uploadObservationEvidenceSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await Promise.all(
      evidences.map((evidence) =>
        logAction({
          action: PROGRESS_ACTIVITY_ACTIONS.createEvidence,
          entityId: evidence.id,
          entityType: PROGRESS_ENTITY_TYPES.evidence,
          newValues: evidence,
          oldValues: null,
          request,
          summary: `Se cargo la evidencia ${evidence.originalName} para la observacion ${observationId}.`,
        }),
      ),
    );

    sendSuccess(response, evidences, 201);
  },

  async createProgressUpdate(request: Request, response: Response) {
    const observationId = getRequiredObservationId(request.params.id);
    const progressUpdate = await progressService.createProgressUpdate(
      observationId,
      createProgressUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.createProgressUpdate,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: null,
      request,
      summary: `Se registro un nuevo avance para la observacion ${observationId}.`,
    });

    sendSuccess(response, progressUpdate, 201);
  },

  async createProgressUpdateEvidence(request: Request, response: Response) {
    const progressUpdateId = getRequiredProgressUpdateId(request.params.id);
    const evidences = await progressService.createProgressUpdateEvidence(
      progressUpdateId,
      getMultipartFiles(request),
      uploadObservationEvidenceSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await Promise.all(
      evidences.map((evidence) =>
        logAction({
          action: PROGRESS_ACTIVITY_ACTIONS.createEvidence,
          entityId: evidence.id,
          entityType: PROGRESS_ENTITY_TYPES.evidence,
          newValues: evidence,
          oldValues: null,
          request,
          summary: `Se adjunto la evidencia ${evidence.originalName} al avance ${progressUpdateId}.`,
        }),
      ),
    );

    sendSuccess(response, evidences, 201);
  },

  async deleteComment(request: Request, response: Response) {
    const comment = await progressService.deleteComment(
      getRequiredCommentId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.deleteComment,
      entityId: comment.id,
      entityType: PROGRESS_ENTITY_TYPES.comment,
      newValues: null,
      oldValues: comment,
      request,
      summary: `Se elimino logicamente el comentario ${comment.id}.`,
    });

    sendSuccess(response, {
      deleted: true,
      id: comment.id,
    });
  },

  async deleteEvidence(request: Request, response: Response) {
    const evidence = await progressService.deleteEvidence(
      getRequiredEvidenceId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.deleteEvidence,
      entityId: evidence.id,
      entityType: PROGRESS_ENTITY_TYPES.evidence,
      newValues: null,
      oldValues: evidence,
      request,
      summary: `Se elimino logicamente la evidencia ${evidence.originalName}.`,
    });

    sendSuccess(response, {
      deleted: true,
      id: evidence.id,
    });
  },

  async downloadEvidence(request: Request, response: Response) {
    const evidence = await progressService.downloadEvidence(
      getRequiredEvidenceId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.downloadEvidence,
      entityId: getRequiredEvidenceId(request.params.id),
      entityType: PROGRESS_ENTITY_TYPES.evidence,
      newValues: {
        downloadedAt: new Date().toISOString(),
        fileName: evidence.fileName,
      },
      oldValues: null,
      request,
      summary: `Se descargo la evidencia ${evidence.fileName}.`,
    });

    response.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(evidence.fileName)}"`);
    response.setHeader("Content-Type", evidence.mimeType);

    const stream = createReadStream(evidence.absolutePath);
    stream.pipe(response);
  },

  async getObservationComments(request: Request, response: Response) {
    const comments = await progressService.getObservationComments(
      getRequiredObservationId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, comments);
  },

  async getObservationEvidence(request: Request, response: Response) {
    const evidences = await progressService.getObservationEvidence(
      getRequiredObservationId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, evidences);
  },

  async getObservationProgressWorkspace(request: Request, response: Response) {
    const workspace = await progressService.getObservationProgressWorkspace(
      getRequiredObservationId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, workspace);
  },

  async listProgressUpdates(request: Request, response: Response) {
    const result = await progressService.listProgressUpdates(
      listProgressUpdatesQuerySchema.parse({
        areaId: getQueryValue(request.query["filter.areaId"]),
        dateFrom: getQueryValue(request.query["filter.dateFrom"]),
        dateTo: getQueryValue(request.query["filter.dateTo"]),
        evidencePending: getQueryValue(request.query["filter.evidencePending"]),
        page: getQueryValue(request.query.page),
        perPage: getQueryValue(request.query.perPage),
        responsibleUserId: getQueryValue(request.query["filter.responsibleUserId"]),
        riskLevelId: getQueryValue(request.query["filter.riskLevelId"]),
        search: getQueryValue(request.query.search),
        sortBy: getQueryValue(request.query.sortBy),
        sortDirection: getQueryValue(request.query.sortDirection),
        status: getQueryValue(request.query["filter.status"]),
        type: getQueryValue(request.query["filter.type"]),
      }),
      getRequiredAuthorizationSummary(request),
    );

    sendPaginated(response, result.data, result.pagination);
  },

  async rejectProgressUpdate(request: Request, response: Response) {
    const progressUpdate = await progressService.reviewProgressUpdate(
      getRequiredProgressUpdateId(request.params.id),
      "reject",
      reviewProgressUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.rejectProgressUpdate,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: {
        id: progressUpdate.id,
        status: "SENT_TO_AUDIT",
      },
      request,
      summary: `El avance ${progressUpdate.id} fue rechazado por Auditoria.`,
    });

    sendSuccess(response, progressUpdate);
  },

  async returnProgressUpdate(request: Request, response: Response) {
    const progressUpdate = await progressService.reviewProgressUpdate(
      getRequiredProgressUpdateId(request.params.id),
      "return",
      reviewProgressUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.returnProgressUpdate,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: {
        id: progressUpdate.id,
        status: "SENT_TO_AUDIT",
      },
      request,
      summary: `El avance ${progressUpdate.id} fue devuelto con observaciones.`,
    });

    sendSuccess(response, progressUpdate);
  },

  async sendProgressUpdateToAudit(request: Request, response: Response) {
    const progressUpdate = await progressService.sendProgressUpdateToAudit(
      getRequiredProgressUpdateId(request.params.id),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.sendProgressUpdateToAudit,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: {
        id: progressUpdate.id,
        status: "DRAFT",
      },
      request,
      summary: `El avance ${progressUpdate.id} fue enviado a Auditoria.`,
    });

    sendSuccess(response, progressUpdate);
  },

  async updateComment(request: Request, response: Response) {
    const comment = await progressService.updateObservationComment(
      getRequiredCommentId(request.params.id),
      updateCommentSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.updateComment,
      entityId: comment.id,
      entityType: PROGRESS_ENTITY_TYPES.comment,
      newValues: comment,
      oldValues: {
        id: comment.id,
      },
      request,
      summary: `Se actualizo el comentario ${comment.id}.`,
    });

    sendSuccess(response, comment);
  },

  async updateProgressUpdate(request: Request, response: Response) {
    const progressUpdate = await progressService.updateProgressUpdate(
      getRequiredProgressUpdateId(request.params.id),
      updateProgressUpdateSchema.parse(request.body),
      getRequiredAuthorizationSummary(request),
    );

    await logAction({
      action: PROGRESS_ACTIVITY_ACTIONS.updateProgressUpdate,
      entityId: progressUpdate.id,
      entityType: PROGRESS_ENTITY_TYPES.progressUpdate,
      newValues: progressUpdate,
      oldValues: {
        id: progressUpdate.id,
      },
      request,
      summary: `Se actualizo el avance ${progressUpdate.id}.`,
    });

    sendSuccess(response, progressUpdate);
  },
};
