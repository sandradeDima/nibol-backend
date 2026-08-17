import { workflowTimerService } from "../modules/workflows/workflow-timer.service.js";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";
let timerHandle = null;
const runOnce = () => {
    void workflowTimerService
        .run({
        batchLimit: env.WORKFLOW_TIMER_BATCH_SIZE,
        triggeredBy: "SYSTEM",
    })
        .then((summary) => {
        if (summary.lockSkipped)
            return;
        logger.debug("Workflow timer processor completed.", {
            completedCount: summary.completedCount,
            failedCount: summary.failedCount,
            skippedCount: summary.skippedCount,
        });
    })
        .catch((error) => {
        logger.error("Workflow timer processor failed.", {
            message: error instanceof Error ? error.message : "Unknown error",
        });
    });
};
export const workflowTimerScheduler = {
    start() {
        if (timerHandle || env.NODE_ENV === "test")
            return;
        timerHandle = setInterval(runOnce, env.WORKFLOW_TIMER_INTERVAL_MS);
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
//# sourceMappingURL=workflow-timer-scheduler.js.map