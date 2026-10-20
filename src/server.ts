import { createServer } from "node:http";

import { app } from "./app.js";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
import { workflowTimerScheduler } from "./jobs/workflow-timer-scheduler.js";
import { deadlineReminderScheduler } from "./jobs/deadline-monitor/deadline-reminder-scheduler.js";
import { prisma } from "./utils/prisma.js";

const server = createServer(app);

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info(`Se recibió la señal ${signal}. Se cerrará el servidor.`);

  server.close((error) => {
    void prisma.$disconnect().finally(() => {
      if (error) {
        logger.error("Falló el cierre del servidor.", { message: error.message });
        process.exitCode = 1;
        return;
      }

      process.exitCode = 0;
    });
  });
};

server.listen(env.PORT, () => {
  logger.info(`Servidor de la API disponible en http://localhost:${env.PORT}`);
  workflowTimerScheduler.start();
  deadlineReminderScheduler.start();
});

process.on("SIGINT", () => {
  workflowTimerScheduler.stop();
  deadlineReminderScheduler.stop();
  shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  workflowTimerScheduler.stop();
  deadlineReminderScheduler.stop();
  shutdown("SIGTERM");
});
