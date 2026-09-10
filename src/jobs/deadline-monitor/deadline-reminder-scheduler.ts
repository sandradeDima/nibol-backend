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
      logger.debug("Deadline reminder scheduler completed.", {
        emailsSent: summary.emailsSent,
        failuresCount: summary.failuresCount,
        plansIncluded: summary.plansIncluded,
        recipientsNotified: summary.recipientsNotified,
      });
    })
    .catch((error: unknown) => {
      logger.error("Deadline reminder scheduler failed.", {
        message: error instanceof Error ? error.message : "Unknown error",
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
