import { AppError } from "../../utils/app-error.js";
import { sendSuccess } from "../../utils/response.js";
import { dashboardService } from "./dashboard.service.js";
const getRequiredAuthorizationSummary = (request) => {
    if (!request.authorizationSummary) {
        throw new AppError("Authorization required.", 401);
    }
    return request.authorizationSummary;
};
export const dashboardController = {
    async getAreaDashboard(request, response) {
        const result = await dashboardService.getAreaDashboard(getRequiredAuthorizationSummary(request));
        sendSuccess(response, result);
    },
    async getAuditDashboard(request, response) {
        const result = await dashboardService.getAuditDashboard(getRequiredAuthorizationSummary(request));
        sendSuccess(response, result);
    },
    async getMySummary(request, response) {
        const result = await dashboardService.getMySummary(getRequiredAuthorizationSummary(request));
        sendSuccess(response, result);
    },
};
//# sourceMappingURL=dashboard.controller.js.map