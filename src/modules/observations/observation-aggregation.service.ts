import type {
  ActionPlanStatus,
  Prisma,
} from "../../../generated/prisma/client.js";

import { AppError } from "../../utils/app-error.js";

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
  ): ObservationBusinessStatus {
    if (
      actionPlans.length === 0 ||
      actionPlans.every((actionPlan) => actionPlan.status === "NOT_STARTED")
    ) {
      return "NO_INICIADO";
    }
    if (actionPlans.every((actionPlan) => actionPlan.status === "CONCLUDED")) {
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

export const lockObservationForActionPlanUpdate = async (
  tx: Prisma.TransactionClient,
  observationId: string,
) => {
  await tx.$queryRaw`SELECT id FROM observations WHERE id = ${observationId} FOR UPDATE`;
};

export const recalculateObservationFromActionPlans = async (
  tx: Prisma.TransactionClient,
  observationId: string,
) => {
  const observation = await tx.observation.findUnique({
    select: { id: true },
    where: { id: observationId },
  });
  if (!observation) return;
  const actionPlans = await tx.$queryRaw<ActionPlanAggregationInput[]>`
    SELECT progress_percent AS progressPercent, status
    FROM action_plans
    WHERE deleted_at IS NULL AND observation_id = ${observationId}
    FOR UPDATE
  `;
  const progressPercent =
    observationAggregationService.calculateProgress(actionPlans);
  const key = observationAggregationService.calculateStatus(actionPlans);
  const status = await tx.observationStatus.findFirst({
    select: { id: true },
    where: {
      active: true,
      deletedAt: null,
      ...(key === "CONCLUIDO"
        ? { isFinal: true }
        : key === "NO_INICIADO"
          ? { isInitial: true }
          : { isFinal: false, isInitial: false }),
    },
    orderBy: { sortOrder: "asc" },
  });
  if (!status)
    throw new AppError(`No está configurado el estado ${key}.`, 500);
  await tx.observation.update({
    data: { progressPercent, statusId: status.id },
    where: { id: observationId },
  });
};
