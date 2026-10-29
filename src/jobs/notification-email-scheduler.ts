import { notificationService } from "../services/notification-service.js";
import { env } from "../utils/env.js";
import { logger } from "../utils/logger.js";

const intervalMs = 30_000;
let timerHandle: NodeJS.Timeout | null = null;

const runOnce = (): void => {
  void notificationService
    .deliverPendingEmailNotifications()
    .then((sentCount) => {
      if (sentCount > 0)
        logger.debug("Se entregaron correos de notificación pendientes.", {
          sentCount,
        });
    })
    .catch((error: unknown) => {
      logger.error("Falló el envío de correos de notificación pendientes.", {
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    });
};

export const notificationEmailScheduler = {
  start(): void {
    if (timerHandle || env.NODE_ENV === "test") return;
    timerHandle = setInterval(runOnce, intervalMs);
    timerHandle.unref();
    runOnce();
  },

  stop(): void {
    if (!timerHandle) return;
    clearInterval(timerHandle);
    timerHandle = null;
  },
};
