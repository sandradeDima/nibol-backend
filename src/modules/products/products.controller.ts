import type { Request, Response } from "express";

import { activityLogService } from "../../services/activity-log-service.js";
import { auditLogService } from "../../services/audit-log-service.js";
import { AppError } from "../../utils/app-error.js";
import { getRequestLogActorContext } from "../../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../../utils/response.js";
import { productsService } from "./products.service.js";
import { PRODUCTS_ENTITY_TYPE } from "./products.constants.js";
import { PRODUCTS_PERMISSIONS } from "./products.permissions.js";
import {
  createProductSchema,
  productIdParamSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "./products.validators.js";

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

const getRequiredProductId = (
  value: string | string[] | undefined,
): string => {
  const productId = Array.isArray(value) ? value[0] : value;

  if (!productId) {
    throw new AppError("Product id is required.", 400);
  }

  return productIdParamSchema.parse({
    id: productId,
  }).id;
};

export const productsController = {
  async list(request: Request, response: Response) {
    const query = listProductsQuerySchema.parse({
      isActive: getQueryValue(request.query["filter.isActive"]),
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
    });

    const result = await productsService.listProducts(query);

    sendPaginated(response, result.data, result.pagination);
  },

  async getById(request: Request, response: Response) {
    const record = await productsService.getProductById(
      getRequiredProductId(request.params.id),
    );

    sendSuccess(response, record);
  },

  async create(request: Request, response: Response) {
    const payload = createProductSchema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const record = await productsService.createProduct(payload);

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: PRODUCTS_PERMISSIONS.create,
        entityId: record.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        metadata: {
          name: record.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: record.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        newValues: record,
        oldValues: null,
      }),
    ]);

    sendSuccess(response, record, 201);
  },

  async update(request: Request, response: Response) {
    const payload = updateProductSchema.parse(request.body);
    const actorContext = getRequestLogActorContext(request);
    const result = await productsService.updateProduct(
      getRequiredProductId(request.params.id),
      payload,
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: PRODUCTS_PERMISSIONS.edit,
        entityId: result.current.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        metadata: {
          name: result.current.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: result.current.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        newValues: result.current,
        oldValues: result.previous,
      }),
    ]);

    sendSuccess(response, result.current);
  },

  async remove(request: Request, response: Response) {
    const actorContext = getRequestLogActorContext(request);
    const record = await productsService.deleteProduct(
      getRequiredProductId(request.params.id),
    );

    await Promise.all([
      activityLogService.logUserAction({
        ...actorContext,
        action: PRODUCTS_PERMISSIONS.delete,
        entityId: record.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        metadata: {
          name: record.name,
        },
      }),
      auditLogService.create({
        ...actorContext,
        entityId: record.id,
        entityType: PRODUCTS_ENTITY_TYPE,
        newValues: null,
        oldValues: record,
      }),
    ]);

    sendSuccess(response, {
      deleted: true,
      id: record.id,
    });
  },
};
