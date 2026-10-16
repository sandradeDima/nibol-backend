import { prisma } from "../src/utils/prisma.js";

try {
  await prisma.$queryRaw`SELECT 1`;
  console.info("SQL Server connection successful.");
} catch (error) {
  console.error("SQL Server connection failed.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
