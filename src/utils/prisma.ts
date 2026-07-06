import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../generated/prisma/client.js";

import { env } from "./env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);

const getMariaDbConnectionUrl = (databaseUrl: string): string => {
  try {
    const url = new URL(databaseUrl);
    const isSupportedProtocol = url.protocol === "mariadb:" || url.protocol === "mysql:";
    const isLoopbackHost = loopbackHosts.has(url.hostname);
    const hasExplicitRsaConfiguration =
      url.searchParams.has("allowPublicKeyRetrieval") ||
      url.searchParams.has("cachingRsaPublicKey");

    if (
      env.NODE_ENV === "production" ||
      !isSupportedProtocol ||
      !isLoopbackHost ||
      hasExplicitRsaConfiguration
    ) {
      return databaseUrl;
    }

    url.searchParams.set("allowPublicKeyRetrieval", "true");

    logger.warn("Enabled MariaDB public key retrieval for local development.", {
      databaseHost: url.hostname,
    });

    return url.toString();
  } catch {
    return databaseUrl;
  }
};

const adapter = new PrismaMariaDb(getMariaDbConnectionUrl(env.DATABASE_URL));

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
