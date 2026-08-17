import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import {
  AUDIT_REPORTS_PERMISSIONS,
  REPORTS_PERMISSIONS,
} from "./reports.permissions.js";
import { reportsController } from "./reports.controller.js";

export const reportsRouter = Router();

reportsRouter.get(
  "/reports/dashboard",
  requirePermission(REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.dashboard),
);

reportsRouter.get(
  "/reports/observations",
  requirePermission(REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.listObservations),
);

reportsRouter.get(
  "/reports/preview",
  requirePermission(REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.preview),
);

reportsRouter.get(
  "/reports/export",
  requirePermission(REPORTS_PERMISSIONS.export),
  asyncHandler(reportsController.exportReport),
);

reportsRouter.get(
  "/reports/audit/options",
  requirePermission(AUDIT_REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.auditOptions),
);

reportsRouter.get(
  "/reports/audit/observations/:observationId",
  requirePermission(AUDIT_REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.auditHistoryForObservation),
);

reportsRouter.get(
  "/reports/audit",
  requirePermission(AUDIT_REPORTS_PERMISSIONS.view),
  asyncHandler(reportsController.audit),
);

reportsRouter.get(
  "/reports/audit/export",
  requirePermission(AUDIT_REPORTS_PERMISSIONS.export),
  asyncHandler(reportsController.exportAudit),
);
