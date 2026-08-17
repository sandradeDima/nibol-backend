import type { Request, Response } from "express";

import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { observationCatalogsService } from "./observation-catalogs.service.js";
import {
  createObservationCatalogSchema,
  listObservationCatalogSchema,
  observationCatalogIdSchema,
  updateObservationCatalogSchema,
} from "./observation-catalogs.validators.js";

const value = (input: unknown): string | undefined =>
  typeof input === "string" ? input : undefined;
const id = (request: Request) =>
  observationCatalogIdSchema.parse({ id: value(request.params.id) }).id;
const listQuery = (request: Request) =>
  listObservationCatalogSchema.parse({
    active: value(request.query["filter.active"]),
    page: value(request.query.page),
    perPage: value(request.query.perPage),
    search: value(request.query.search),
  });

export const observationCatalogsController = {
  async createDictionary(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.createDictionary(
        createObservationCatalogSchema.parse(request.body),
      ),
      201,
    );
  },
  async createRisk(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.createRisk(
        createObservationCatalogSchema.parse(request.body),
      ),
      201,
    );
  },
  async listDictionary(request: Request, response: Response) {
    const result = await observationCatalogsService.listDictionary(
      listQuery(request),
    );
    sendPaginated(response, result.data, result.pagination);
  },
  async listRisks(request: Request, response: Response) {
    const result = await observationCatalogsService.listRisks(
      listQuery(request),
    );
    sendPaginated(response, result.data, result.pagination);
  },
  async removeDictionary(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.updateDictionary(id(request), {
        isActive: false,
      }),
    );
  },
  async removeRisk(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.updateRisk(id(request), {
        isActive: false,
      }),
    );
  },
  async updateDictionary(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.updateDictionary(
        id(request),
        updateObservationCatalogSchema.parse(request.body),
      ),
    );
  },
  async updateRisk(request: Request, response: Response) {
    sendSuccess(
      response,
      await observationCatalogsService.updateRisk(
        id(request),
        updateObservationCatalogSchema.parse(request.body),
      ),
    );
  },
};
