import type { ActionPlanStatus } from "../../../generated/prisma/client.js";

export type ActionPlanAggregationInput = {
  progressPercent: number;
  status: ActionPlanStatus;
};

export type ObservationBusinessStatus =
  | "NO_INICIADO"
  | "INICIADO"
  | "CON_AVANCE"
  | "CONCLUIDO";

export const observationAggregationService = {
  calculateProgress(actionPlans: ActionPlanAggregationInput[]): number {
    if (actionPlans.length === 0) return 0;
    const total = actionPlans.reduce(
      (sum, actionPlan) => sum + actionPlan.progressPercent,
      0,
    );
    return Math.round(total / actionPlans.length);
  },

  calculateStatus(
    actionPlans: ActionPlanAggregationInput[],
    closureApproved = false,
  ): ObservationBusinessStatus {
    if (
      actionPlans.length === 0 ||
      actionPlans.every((actionPlan) => actionPlan.status === "NOT_STARTED")
    ) {
      return "NO_INICIADO";
    }
    if (
      closureApproved &&
      actionPlans.every((actionPlan) => actionPlan.status === "CONCLUDED")
    ) {
      return "CONCLUIDO";
    }
    if (
      actionPlans.some(
        (actionPlan) =>
          actionPlan.progressPercent > 0 ||
          actionPlan.status === "WITH_PROGRESS" ||
          actionPlan.status === "CONCLUDED",
      )
    ) {
      return "CON_AVANCE";
    }
    return "INICIADO";
  },
};
