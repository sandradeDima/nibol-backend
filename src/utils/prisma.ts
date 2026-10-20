import { PrismaMssql } from "@prisma/adapter-mssql";

import { PrismaClient } from "../../generated/prisma/client.js";

import { env } from "./env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const adapter = new PrismaMssql(env.DATABASE_URL, {
  schema: "dbo",
  onPoolError: (error) => logger.error("Error en el grupo de conexiones de SQL Server.", { error }),
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
