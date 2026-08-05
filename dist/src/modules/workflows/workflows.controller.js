import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { workflowService } from "./workflows.service.js";
import { archiveWorkflowSchema, createDraftVersionSchema, createWorkflowSchema, duplicateWorkflowSchema, listWorkflowsQuerySchema, workflowActivityQuerySchema, workflowDesignerSaveSchema, workflowDesignerValidateSchema, updateWorkflowMetadataSchema, workflowIdParamSchema, workflowVersionIdParamSchema, workflowVersionListQuerySchema, workflowPublishSchema, workflowSimulationSchema, } from "./workflows.validators.js";
const getQueryValue = (value) => {
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
const getRequiredId = (value, field) => {
    const id = Array.isArray(value) ? value[0] : value;
    if (!id) {
        throw new AppError(field === "versionId"
            ? "El id de la versión es obligatorio."
            : "El id del workflow es obligatorio.", 400);
    }
    return field === "versionId"
        ? workflowVersionIdParamSchema.parse({ versionId: id }).versionId
        : workflowIdParamSchema.parse({ id }).id;
};
const getWorkflowAccess = (request) => {
    const authorization = request.authorizationSummary;
    if (!authorization) {
        throw new AppError("Se requiere autorización.", 401);
    }
    return {
        ...authorization,
        ipAddress: getRequestLogActorContext(request).ipAddress ?? null,
    };
};
export const workflowsController = {
    async archive(request, response) {
        archiveWorkflowSchema.parse(request.body ?? {});
        const result = await workflowService.archiveWorkflow(getRequiredId(request.params.id, "id"), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async create(request, response) {
        const result = await workflowService.createWorkflow(createWorkflowSchema.parse(request.body), getWorkflowAccess(request));
        sendSuccess(response, result, 201);
    },
    async createVersion(request, response) {
        const result = await workflowService.createDraftVersion(getRequiredId(request.params.id, "id"), createDraftVersionSchema.parse(request.body ?? {}), getWorkflowAccess(request));
        sendSuccess(response, result, 201);
    },
    async duplicate(request, response) {
        const result = await workflowService.duplicateWorkflow(getRequiredId(request.params.id, "id"), duplicateWorkflowSchema.parse(request.body ?? {}), getWorkflowAccess(request));
        sendSuccess(response, result, 201);
    },
    async getById(request, response) {
        const result = await workflowService.getWorkflowDefinition(getRequiredId(request.params.id, "id"), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async activity(request, response) {
        const result = await workflowService.listWorkflowActivity(getRequiredId(request.params.id, "id"), workflowActivityQuerySchema.parse({
            page: getQueryValue(request.query.page),
            perPage: getQueryValue(request.query.perPage),
        }), getWorkflowAccess(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async options(request, response) {
        sendSuccess(response, await workflowService.getWorkflowOptions(getWorkflowAccess(request)));
    },
    async designerOptions(request, response) {
        sendSuccess(response, await workflowService.getWorkflowDesignerOptions(getWorkflowAccess(request)));
    },
    async getDesigner(request, response) {
        sendSuccess(response, await workflowService.getWorkflowDesigner(getRequiredId(request.params.versionId, "versionId"), getWorkflowAccess(request)));
    },
    async saveDesigner(request, response) {
        const result = await workflowService.saveWorkflowDesigner(getRequiredId(request.params.versionId, "versionId"), workflowDesignerSaveSchema.parse(request.body), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async validateDesigner(request, response) {
        const input = workflowDesignerValidateSchema.parse(request.body ?? {});
        const result = await workflowService.validateWorkflowDesigner(getRequiredId(request.params.versionId, "versionId"), input, getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async simulate(request, response) {
        const result = await workflowService.simulateWorkflowVersion(getRequiredId(request.params.versionId, "versionId"), workflowSimulationSchema.parse(request.body), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async publish(request, response) {
        const result = await workflowService.publishWorkflowVersion(getRequiredId(request.params.versionId, "versionId"), workflowPublishSchema.parse(request.body), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async summary(request, response) {
        sendSuccess(response, await workflowService.getWorkflowSummary(getWorkflowAccess(request)));
    },
    async getVersion(request, response) {
        const result = await workflowService.getWorkflowVersion(getRequiredId(request.params.versionId, "versionId"), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
    async list(request, response) {
        const result = await workflowService.listWorkflowDefinitions(listWorkflowsQuerySchema.parse({
            createdById: getQueryValue(request.query["filter.createdById"]),
            page: getQueryValue(request.query.page),
            perPage: getQueryValue(request.query.perPage),
            processType: getQueryValue(request.query["filter.processType"]),
            search: getQueryValue(request.query.search),
            sortBy: getQueryValue(request.query.sortBy),
            sortDirection: getQueryValue(request.query.sortDirection),
            status: getQueryValue(request.query["filter.status"]),
        }), getWorkflowAccess(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async listVersions(request, response) {
        const result = await workflowService.listWorkflowVersions(getRequiredId(request.params.id, "id"), workflowVersionListQuerySchema.parse({
            page: getQueryValue(request.query.page),
            perPage: getQueryValue(request.query.perPage),
            status: getQueryValue(request.query["filter.status"]),
        }), getWorkflowAccess(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async update(request, response) {
        const result = await workflowService.updateWorkflowMetadata(getRequiredId(request.params.id, "id"), updateWorkflowMetadataSchema.parse(request.body), getWorkflowAccess(request));
        sendSuccess(response, result);
    },
};
//# sourceMappingURL=workflows.controller.js.map