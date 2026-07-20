import type { Request, Response } from "express";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import { AppError } from "../../utils/app-error.js";
import { sendSuccess } from "../../utils/response.js";
import { dashboardService } from "./dashboard.service.js";

const getRequiredAuthorizationSummary = (request: Request): AuthorizationSummary => {
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
};
