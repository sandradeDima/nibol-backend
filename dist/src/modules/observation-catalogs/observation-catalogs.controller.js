import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { observationCatalogsService } from "./observation-catalogs.service.js";
import { createObservationCatalogSchema, listObservationCatalogSchema, observationCatalogIdSchema, updateObservationCatalogSchema, } from "./observation-catalogs.validators.js";
const value = (input) => typeof input === "string" ? input : undefined;
const id = (request) => observationCatalogIdSchema.parse({ id: value(request.params.id) }).id;
const listQuery = (request) => listObservationCatalogSchema.parse({
    active: value(request.query["filter.active"]),
    page: value(request.query.page),
    perPage: value(request.query.perPage),
    search: value(request.query.search),
});
export const observationCatalogsController = {
    async createDictionary(request, response) {
        sendSuccess(response, await observationCatalogsService.createDictionary(createObservationCatalogSchema.parse(request.body)), 201);
    },
    async createRisk(request, response) {
        sendSuccess(response, await observationCatalogsService.createRisk(createObservationCatalogSchema.parse(request.body)), 201);
    },
    async listDictionary(request, response) {
        const result = await observationCatalogsService.listDictionary(listQuery(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async listRisks(request, response) {
        const result = await observationCatalogsService.listRisks(listQuery(request));
        sendPaginated(response, result.data, result.pagination);
    },
    async removeDictionary(request, response) {
        sendSuccess(response, await observationCatalogsService.updateDictionary(id(request), {
            isActive: false,
        }));
    },
    async removeRisk(request, response) {
        sendSuccess(response, await observationCatalogsService.updateRisk(id(request), {
            isActive: false,
        }));
    },
    async updateDictionary(request, response) {
        sendSuccess(response, await observationCatalogsService.updateDictionary(id(request), updateObservationCatalogSchema.parse(request.body)));
    },
    async updateRisk(request, response) {
        sendSuccess(response, await observationCatalogsService.updateRisk(id(request), updateObservationCatalogSchema.parse(request.body)));
    },
};
//# sourceMappingURL=observation-catalogs.controller.js.map