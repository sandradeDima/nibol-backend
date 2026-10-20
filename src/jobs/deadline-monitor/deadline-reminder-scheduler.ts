import { deadlineReminderService } from "./deadline-reminder.service.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";

let timerHandle: NodeJS.Timeout | null = null;

const runOnce = (): void => {
  void deadlineReminderService
    .run({
      mode: "SCHEDULED",
      triggeredBy: "SYSTEM",
    })
    .then((summary) => {
      if (summary.lockSkipped) return;
      logger.debug("Finalizó la programación de recordatorios de plazos.", {
        emailsSent: summary.emailsSent,
        failuresCount: summary.failuresCount,
        plansIncluded: summary.plansIncluded,
        recipientsNotified: summary.recipientsNotified,
      });
    })
    .catch((error: unknown) => {
      logger.error("Falló la programación de recordatorios de plazos.", {
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    });
};

export const deadlineReminderScheduler = {
  start(): void {
    if (timerHandle || env.NODE_ENV === "test") return;
    timerHandle = setInterval(runOnce, env.DEADLINE_REMINDER_INTERVAL_MS);
    timerHandle.unref();
    runOnce();
  },

  stop(): void {
    if (!timerHandle) return;
    clearInterval(timerHandle);
    timerHandle = null;
  },
};
