import { Router } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import { generatedModuleRouters } from "../modules/generated-module-registry.js";
import { activityLogsRouter } from "./activity-logs-routes.js";
import { auditLogsRouter } from "./audit-logs-routes.js";
import { invitationsRouter } from "./invitations-routes.js";
import { notificationsRouter } from "./notifications-routes.js";
import { permissionsRouter } from "./permissions-routes.js";
import { rolesRouter } from "./roles-routes.js";
import { settingsRouter } from "./settings-routes.js";
import { usersRouter } from "./users-routes.js";
import { sendSuccess } from "../utils/response.js";

export const apiRouter = Router();

apiRouter.use(activityLogsRouter);
apiRouter.use(auditLogsRouter);
apiRouter.use(permissionsRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(rolesRouter);
apiRouter.use(usersRouter);
apiRouter.use(invitationsRouter);
apiRouter.use(settingsRouter);

for (const router of generatedModuleRouters) {
  apiRouter.use(router);
}

apiRouter.get(
  "/health",
  asyncHandler(async (_request, response) => {
    sendSuccess(response, {
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }),
);
