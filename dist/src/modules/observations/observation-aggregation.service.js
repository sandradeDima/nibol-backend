export const observationAggregationService = {
    calculateProgress(actionPlans) {
        if (actionPlans.length === 0)
            return 0;
        const total = actionPlans.reduce((sum, actionPlan) => sum + actionPlan.progressPercent, 0);
        return Math.round(total / actionPlans.length);
    },
    calculateStatus(actionPlans, closureApproved = false) {
        if (actionPlans.length === 0 ||
            actionPlans.every((actionPlan) => actionPlan.status === "NOT_STARTED")) {
            return "NO_INICIADO";
        }
        if (closureApproved &&
            actionPlans.every((actionPlan) => actionPlan.status === "CONCLUDED")) {
            return "CONCLUIDO";
        }
        if (actionPlans.some((actionPlan) => actionPlan.progressPercent > 0 ||
            actionPlan.status === "WITH_PROGRESS" ||
            actionPlan.status === "CONCLUDED")) {
            return "CON_AVANCE";
        }
        return "INICIADO";
    },
};
//# sourceMappingURL=observation-aggregation.service.js.map