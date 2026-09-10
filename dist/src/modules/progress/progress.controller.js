import { createReadStream } from "node:fs";
import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { entityActivityService } from "../../services/entity-activity-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { progressService } from "./progress.service.js";
import { actionPlanIdParamSchema, commentIdParamSchema, createCommentSchema, createProgressEvaluationSchema, evidenceIdParamSchema, listProgressEvaluationsQuerySchema, observationIdParamSchema, progressEvaluationIdParamSchema, reviewProgressEvaluationSchema, reviewEvidenceSchema, updateCommentSchema, updateProgressEvaluationSchema, uploadEvidenceSchema, } from "./progress.validators.js";
const value = (input) => typeof input === "string" ? input : undefined;
const access = (request) => {
    if (!request.authorizationSummary)
        throw new AppError("Authorization required.", 401);
    return request.authorizationSummary;
};
const idWith = (request, schema) => schema.parse({ id: value(request.params.id) }).id;
const files = (request) => {
    if (!Array.isArray(request.files) || request.files.length === 0)
        throw new AppError("At least one file is required.", 400);
    return request.files.map((file) => ({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalName: file.originalname,
        size: file.size,
    }));
};
const log = async (request, action, entityType, current, previous) => {
    const record = current ?? previous;
    if (!record)
        return;
    const actor = getRequestLogActorContext(request);
    await Promise.all([
        activityLogService.logUserAction({
            ...actor,
            action,
            entityId: record.id,
            entityType,
            metadata: { summary: action },
        }),
        auditLogService.create({
            ...actor,
            entityId: record.id,
            entityType,
            newValues: current,
            oldValues: previous,
        }),
        entityActivityService.recordEntityChange({
            action,
            activityType: action
                .toUpperCase()
                .replaceAll(".", "_")
                .replaceAll("-", "_"),
            actorUserId: actor.userId,
            entityId: record.id,
            entityType,
            newData: current,
            observationId: record.observation?.id ?? record.observationId,
            previousData: previous,
            title: action,
        }),
    ]);
};
export const progressController = {
    async approveProgressEvaluation(request, response) {
        const result = await progressService.reviewProgressEvaluation(idWith(request, progressEvaluationIdParamSchema), "approve", reviewProgressEvaluationSchema.parse(request.body), access(request));
        await log(request, "action_plans.approve", "PROGRESS_EVALUATION", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async createComment(request, response) {
        const record = await progressService.createObservationComment(idWith(request, observationIdParamSchema), createCommentSchema.parse(request.body), access(request));
        sendSuccess(response, record, 201);
    },
    async createObservationEvidence(request, response) {
        sendSuccess(response, await progressService.uploadObservationEvidence(idWith(request, observationIdParamSchema), files(request), uploadEvidenceSchema.parse(request.body), access(request)), 201);
    },
    async createActionPlanEvidence(request, response) {
        sendSuccess(response, await progressService.uploadActionPlanEvidence(idWith(request, actionPlanIdParamSchema), files(request), uploadEvidenceSchema.parse(request.body), access(request)), 201);
    },
    async createProgressEvaluation(request, response) {
        const record = await progressService.createProgressEvaluation(idWith(request, actionPlanIdParamSchema), createProgressEvaluationSchema.parse(request.body), access(request));
        await log(request, "action_plans.submit_to_audit", "PROGRESS_EVALUATION", record, null);
        sendSuccess(response, record, 201);
    },
    async createProgressEvaluationEvidence(request, response) {
        sendSuccess(response, await progressService.uploadProgressEvaluationEvidence(idWith(request, progressEvaluationIdParamSchema), files(request), uploadEvidenceSchema.parse(request.body), access(request)), 201);
    },
    async deleteComment(request, response) {
        const record = await progressService.deleteComment(idWith(request, commentIdParamSchema), access(request));
        sendSuccess(response, { deleted: true, id: record.id });
    },
    async deleteEvidence(request, response) {
        const record = await progressService.deleteEvidence(idWith(request, evidenceIdParamSchema), access(request));
        sendSuccess(response, { deleted: true, id: record.id });
    },
    async downloadEvidence(request, response) {
        const file = await progressService.downloadEvidence(idWith(request, evidenceIdParamSchema), access(request));
        response.setHeader("Content-Type", file.mimeType);
        response.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
        createReadStream(file.absolutePath).pipe(response);
    },
    async getObservationComments(request, response) {
        sendSuccess(response, await progressService.getObservationComments(idWith(request, observationIdParamSchema), access(request)));
    },
    async getObservationEvidence(request, response) {
        sendSuccess(response, await progressService.getObservationEvidence(idWith(request, observationIdParamSchema), access(request)));
    },
    async submitEvidenceForReview(request, response) {
        const record = await progressService.submitEvidenceForReview(idWith(request, evidenceIdParamSchema), access(request));
        await log(request, record.workflowInstanceId
            ? "evidence.review.submitted"
            : "evidence.review.fallback.created", "EVIDENCE_FILE", record, null);
        sendSuccess(response, record);
    },
    async approveEvidenceReview(request, response) {
        const result = await progressService.reviewEvidence(idWith(request, evidenceIdParamSchema), "approve", null, access(request));
        await log(request, "evidence.approved", "EVIDENCE_FILE", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async returnEvidenceReview(request, response) {
        const result = await progressService.reviewEvidence(idWith(request, evidenceIdParamSchema), "return", reviewEvidenceSchema.parse(request.body ?? {}).comment, access(request));
        await log(request, "evidence.returned", "EVIDENCE_FILE", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async getProgressEvaluation(request, response) {
        sendSuccess(response, await progressService.getProgressEvaluation(idWith(request, progressEvaluationIdParamSchema), access(request)));
    },
    async listProgressEvaluations(request, response) {
        const result = await progressService.listProgressEvaluations(listProgressEvaluationsQuerySchema.parse({
            actionPlanId: value(request.query["filter.actionPlanId"]),
            areaId: value(request.query["filter.areaId"]),
            dateFrom: value(request.query["filter.dateFrom"]),
            dateTo: value(request.query["filter.dateTo"]),
            observationId: value(request.query["filter.observationId"]),
            page: value(request.query.page),
            perPage: value(request.query.perPage),
            reviewStatus: value(request.query["filter.reviewStatus"]),
            search: value(request.query.search),
        }), access(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async returnProgressEvaluation(request, response) {
        const result = await progressService.reviewProgressEvaluation(idWith(request, progressEvaluationIdParamSchema), "return", reviewProgressEvaluationSchema.parse(request.body), access(request));
        await log(request, "action_plans.return", "PROGRESS_EVALUATION", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async sendProgressEvaluationToAudit(request, response) {
        const result = await progressService.sendProgressEvaluationToAudit(idWith(request, progressEvaluationIdParamSchema), access(request));
        await log(request, "action_plans.submit_to_audit", "PROGRESS_EVALUATION", result.current, result.previous);
        sendSuccess(response, result.current);
    },
    async updateComment(request, response) {
        sendSuccess(response, await progressService.updateComment(idWith(request, commentIdParamSchema), updateCommentSchema.parse(request.body), access(request)));
    },
    async updateProgressEvaluation(request, response) {
        const result = await progressService.updateProgressEvaluation(idWith(request, progressEvaluationIdParamSchema), updateProgressEvaluationSchema.parse(request.body), access(request));
        await log(request, "action_plans.edit", "PROGRESS_EVALUATION", result.current, result.previous);
        sendSuccess(response, result.current);
    },
};
//# sourceMappingURL=progress.controller.js.map