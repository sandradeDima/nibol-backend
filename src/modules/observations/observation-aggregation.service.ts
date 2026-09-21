import type { ActionPlanStatus } from "../../../generated/prisma/client.js";

export type ActionPlanAggregationInput = {
  progressPercent: number;
  status: ActionPlanStatus;
};

export type WorkflowTaskCount = {
  completed: number;
  total: number;
};

export const countWorkflowTasksForObservation = (
  progressEvaluationIds: readonly string[],
  taskCounts: ReadonlyMap<string, WorkflowTaskCount>,
): WorkflowTaskCount =>
  progressEvaluationIds.reduce(
    (counts, evaluationId) => {
      const current = taskCounts.get(evaluationId);
      return {
        completed: counts.completed + (current?.completed ?? 0),
        total: counts.total + (current?.total ?? 0),
      };
    },
    { completed: 0, total: 0 },
  );

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
