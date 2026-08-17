import { Router } from "express";
import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { auditReportsController } from "./audit-reports.controller.js";
export const auditReportsRouter = Router();
auditReportsRouter.get("/audit-report-classes", requirePermission("audit_reports.view"), asyncHandler(auditReportsController.listClasses));
auditReportsRouter.post("/audit-report-classes", requirePermission("audit_reports.create"), asyncHandler(auditReportsController.createClass));
auditReportsRouter.patch("/audit-report-classes/:id", requirePermission("audit_reports.edit"), asyncHandler(auditReportsController.updateClass));
auditReportsRouter.delete("/audit-report-classes/:id", requirePermission("audit_reports.delete"), asyncHandler(auditReportsController.removeClass));
auditReportsRouter.get("/audit-reports", requirePermission("audit_reports.view"), asyncHandler(auditReportsController.list));
auditReportsRouter.get("/audit-reports/:id", requirePermission("audit_reports.view"), asyncHandler(auditReportsController.getById));
auditReportsRouter.post("/audit-reports", requirePermission("audit_reports.create"), asyncHandler(auditReportsController.create));
auditReportsRouter.patch("/audit-reports/:id", requirePermission("audit_reports.edit"), asyncHandler(auditReportsController.update));
auditReportsRouter.delete("/audit-reports/:id", requirePermission("audit_reports.delete"), asyncHandler(auditReportsController.remove));
//# sourceMappingURL=audit-reports.routes.js.map