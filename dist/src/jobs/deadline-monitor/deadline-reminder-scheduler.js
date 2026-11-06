import { deadlineReminderService } from "./deadline-reminder.service.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
let timerHandle = null;
const laPazTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/La_Paz",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
});
// shortcut: assumes 24-hour La Paz days; recalculate by date if that timezone adopts DST.
const millisecondsUntilNextRun = () => {
    const now = new Date();
    const [hour, minute, second] = laPazTime
        .format(now)
        .split(":")
        .map(Number);
    const secondsUntilRun = (8 * 60 * 60 - (hour * 60 * 60 + minute * 60 + second) + 86_400) %
        86_400 || 86_400;
    return secondsUntilRun * 1_000 - now.getMilliseconds();
};
const runOnce = () => {
    void deadlineReminderService
        .run({
        mode: "SCHEDULED",
        triggeredBy: "SYSTEM",
    })
        .then((summary) => {
        if (summary.lockSkipped)
            return;
        logger.debug("Finalizó la programación de recordatorios de plazos.", {
            emailsSent: summary.emailsSent,
            failuresCount: summary.failuresCount,
            plansIncluded: summary.plansIncluded,
            recipientsNotified: summary.recipientsNotified,
        });
    })
        .catch((error) => {
        logger.error("Falló la programación de recordatorios de plazos.", {
            message: error instanceof Error ? error.message : "Error desconocido",
        });
    });
};
const scheduleNextRun = () => {
    timerHandle = setTimeout(() => {
        timerHandle = null;
        runOnce();
        scheduleNextRun();
    }, millisecondsUntilNextRun());
    timerHandle.unref();
};
export const deadlineReminderScheduler = {
    start() {
        if (timerHandle || env.NODE_ENV === "test")
            return;
        scheduleNextRun();
    },
    stop() {
        if (!timerHandle)
            return;
        clearTimeout(timerHandle);
        timerHandle = null;
    },
};
//# sourceMappingURL=deadline-reminder-scheduler.js.map