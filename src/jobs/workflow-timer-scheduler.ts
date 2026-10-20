import { workflowTimerService } from "../modules/workflows/workflow-timer.service.js";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";

let timerHandle: NodeJS.Timeout | null = null;

const runOnce = (): void => {
  void workflowTimerService
    .run({
      batchLimit: env.WORKFLOW_TIMER_BATCH_SIZE,
      triggeredBy: "SYSTEM",
    })
    .then((summary) => {
      if (summary.lockSkipped) return;
      logger.debug("Finalizó el procesador de temporizadores de flujos de trabajo.", {
        completedCount: summary.completedCount,
        failedCount: summary.failedCount,
        skippedCount: summary.skippedCount,
      });
    })
    .catch((error: unknown) => {
      logger.error("Falló el procesador de temporizadores de flujos de trabajo.", {
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    });
};

export const workflowTimerScheduler = {
  start(): void {
    if (timerHandle || env.NODE_ENV === "test") return;
    timerHandle = setInterval(runOnce, env.WORKFLOW_TIMER_INTERVAL_MS);
    timerHandle.unref();
    runOnce();
  },

  stop(): void {
    if (!timerHandle) return;
    clearInterval(timerHandle);
    timerHandle = null;
  },
};
