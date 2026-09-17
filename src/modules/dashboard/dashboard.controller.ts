import type { Request, Response } from "express";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { sendSuccess } from "../../utils/response.js";
import { dashboardService } from "./dashboard.service.js";
import { roleDashboardQuerySchema } from "./dashboard.validators.js";

const queryValue = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;

const getRequiredAuthorizationSummary = (
  request: Request,
): AuthorizationSummary => {
  if (!request.authorizationSummary) {
    throw new AppError("Authorization required.", 401);
  }

  return request.authorizationSummary;
};

export const dashboardController = {
  async getAreaDashboard(request: Request, response: Response) {
    const result = await dashboardService.getAreaDashboard(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async getAuditDashboard(request: Request, response: Response) {
    const result = await dashboardService.getAuditDashboard(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async getMySummary(request: Request, response: Response) {
    const result = await dashboardService.getMySummary(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async getOperationalDashboard(request: Request, response: Response) {
    const result = await dashboardService.getOperationalDashboard(
      getRequiredAuthorizationSummary(request),
    );

    sendSuccess(response, result);
  },

  async getRoleDashboard(request: Request, response: Response) {
    const result = await dashboardService.getRoleDashboard(
      getRequiredAuthorizationSummary(request),
      roleDashboardQuerySchema.parse({
        areaId: queryValue(request.query.areaId),
        areaResponsibleUserId: queryValue(request.query.areaResponsibleUserId),
        executorId: queryValue(request.query.executorId),
        observationState: queryValue(request.query.observationState),
        search: queryValue(request.query.search),
      }),
    );

    sendSuccess(response, result);
  },
};
