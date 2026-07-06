import type { Prisma } from "../../../generated/prisma/client.js";

import type {
  CreateProductInput,
  ProductRecord,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.types.js";
import { AppError } from "../../utils/app-error.js";
import { prisma } from "../../utils/prisma.js";
import { PRODUCTS_MODULE_KEY } from "./products.constants.js";

type ModuleRecordEntity = Awaited<ReturnType<typeof prisma.moduleRecord.findFirst>>;

const mapRecord = (record: NonNullable<ModuleRecordEntity>): ProductRecord => {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    isActive: record.isActive,
    name: record.name,
    updatedAt: record.updatedAt.toISOString(),
  };
};

const buildOrderBy = (
  sortBy: ListProductsQuery["sortBy"],
  sortDirection: ListProductsQuery["sortDirection"],
): Prisma.ModuleRecordOrderByWithRelationInput => {
  switch (sortBy) {
    case "createdAt":
      return {
        createdAt: sortDirection,
      };
    case "name":
      return {
        name: sortDirection,
      };
    case "updatedAt":
      return {
        updatedAt: sortDirection,
      };
  }
};

const buildWhereClause = (
  query: ListProductsQuery,
): Prisma.ModuleRecordWhereInput => {
  return {
    deletedAt: null,
    moduleKey: PRODUCTS_MODULE_KEY,
    ...(query.isActive !== undefined
      ? {
          isActive: query.isActive,
        }
      : {}),
    ...(query.search.length > 0
      ? {
          OR: [
            {
              name: {
                contains: query.search,
              },
            },
            {
              description: {
                contains: query.search,
              },
            },
          ],
        }
      : {}),
  };
};

const findRecordOrThrow = async (id: string) => {
  const record = await prisma.moduleRecord.findFirst({
    where: {
      deletedAt: null,
      id,
      moduleKey: PRODUCTS_MODULE_KEY,
    },
  });

  if (!record) {
    throw new AppError("Product not found.", 404);
  }

  return record;
};

export const productsService = {
  async listProducts(query: ListProductsQuery) {
    const where = buildWhereClause(query);
    const [total, records] = await prisma.$transaction([
      prisma.moduleRecord.count({
        where,
      }),
      prisma.moduleRecord.findMany({
        orderBy: buildOrderBy(query.sortBy, query.sortDirection),
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        where,
      }),
    ]);

    return {
      data: records.map((record) => mapRecord(record)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
      },
    };
  },

  async getProductById(id: string): Promise<ProductRecord> {
    const record = await findRecordOrThrow(id);
    return mapRecord(record);
  },

  async createProduct(
    input: CreateProductInput,
  ): Promise<ProductRecord> {
    const record = await prisma.moduleRecord.create({
      data: {
        description: input.description,
        isActive: input.isActive,
        moduleKey: PRODUCTS_MODULE_KEY,
        name: input.name,
      },
    });

    return mapRecord(record);
  },

  async updateProduct(
    id: string,
    input: UpdateProductInput,
  ): Promise<{
    current: ProductRecord;
    previous: ProductRecord;
  }> {
    const existingRecord = await findRecordOrThrow(id);

    const updatedRecord = await prisma.moduleRecord.update({
      data: {
        description: input.description,
        isActive: input.isActive,
        name: input.name,
      },
      where: {
        id: existingRecord.id,
      },
    });

    return {
      current: mapRecord(updatedRecord),
      previous: mapRecord(existingRecord),
    };
  },

  async deleteProduct(id: string): Promise<ProductRecord> {
    const existingRecord = await findRecordOrThrow(id);

    await prisma.moduleRecord.update({
      data: {
        deletedAt: new Date(),
      },
      where: {
        id: existingRecord.id,
      },
    });

    return mapRecord(existingRecord);
  },
};
