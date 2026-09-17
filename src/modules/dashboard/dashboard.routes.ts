import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import {
  requireAuth,
  requirePermission,
} from "../../middleware/authorization-middleware.js";
import { dashboardController } from "./dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.get(
  "/dashboard/auditoria",
  requireAuth(),
  asyncHandler(dashboardController.getAuditDashboard),
);

dashboardRouter.get(
  "/dashboard/area",
  requireAuth(),
  asyncHandler(dashboardController.getAreaDashboard),
);

dashboardRouter.get(
  "/dashboard/my-summary",
  requireAuth(),
  asyncHandler(dashboardController.getMySummary),
);

dashboardRouter.get(
  "/dashboard/operational",
  requireAuth(),
  asyncHandler(dashboardController.getOperationalDashboard),
);

dashboardRouter.get(
  "/dashboard/role",
  requirePermission("observations.view"),
  asyncHandler(dashboardController.getRoleDashboard),
);
