import { deadlineReminderService } from "./deadline-reminder.service.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
let timerHandle = null;
const runOnce = () => {
    void deadlineReminderService
        .run({
        mode: "SCHEDULED",
        triggeredBy: "SYSTEM",
    })
        .then((summary) => {
        if (summary.lockSkipped)
            return;
        logger.debug("Deadline reminder scheduler completed.", {
            emailsSent: summary.emailsSent,
            failuresCount: summary.failuresCount,
            plansIncluded: summary.plansIncluded,
            recipientsNotified: summary.recipientsNotified,
        });
    })
        .catch((error) => {
        logger.error("Deadline reminder scheduler failed.", {
            message: error instanceof Error ? error.message : "Unknown error",
        });
    });
};
export const deadlineReminderScheduler = {
    start() {
        if (timerHandle || env.NODE_ENV === "test")
            return;
        timerHandle = setInterval(runOnce, env.DEADLINE_REMINDER_INTERVAL_MS);
        timerHandle.unref();
        runOnce();
    },
    stop() {
        if (!timerHandle)
            return;
        clearInterval(timerHandle);
        timerHandle = null;
    },
};
//# sourceMappingURL=deadline-reminder-scheduler.js.map