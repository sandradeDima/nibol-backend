import {
  normalizeWorkflowSimulationContext,
  type WorkflowSimulationContext,
} from "./workflow-rule-fields.js";
import type { WorkflowInstanceStartInput } from "./workflow-runtime.validators.js";

export type WorkflowRuntimeContext = WorkflowSimulationContext & {
  custom: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getCustom = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  return { ...value };
};

export const buildWorkflowRuntimeContext = ({
  actorUserId,
  context,
  processType,
}: {
  actorUserId: string;
  context: WorkflowInstanceStartInput["context"];
  processType: string;
}): WorkflowRuntimeContext => {
  const normalized = normalizeWorkflowSimulationContext({
    ...(context ?? {}),
    processType,
    requesterUserId: context?.requesterUserId ?? actorUserId,
  } as WorkflowSimulationContext);

  return {
    ...normalized,
    custom: getCustom(context?.custom),
  };
};

export const restoreWorkflowRuntimeContext = (
  processType: string,
  value: unknown,
): WorkflowRuntimeContext => {
  const raw = isRecord(value) ? value : {};
  const normalized = normalizeWorkflowSimulationContext({
    ...raw,
    processType,
  } as WorkflowSimulationContext);

  return {
    ...normalized,
    custom: getCustom(raw.custom),
  };
};

export const getAllowlistedRuntimeReference = (
  context: WorkflowRuntimeContext,
  reference: string | null | undefined,
): string | null => {
  if (typeof reference !== "string") return null;
  const normalized = reference.trim();
  if (!normalized) return null;

  const directReferences: Record<string, unknown> = {
    areaId: context.areaId,
    requesterUserId: context.requesterUserId,
    responsibleUserId: context.responsibleUserId,
  };
  const directValue = directReferences[normalized];
  if (typeof directValue === "string" && directValue.trim()) {
    return directValue.trim();
  }

  const customKey = normalized.startsWith("custom.")
    ? normalized.slice("custom.".length)
    : normalized;
  if (
    ["recordOwnerUserId", "observationResponsibleUserId"].includes(customKey)
  ) {
    const customValue = context.custom[customKey];
    return typeof customValue === "string" && customValue.trim()
      ? customValue.trim()
      : null;
  }

  return null;
};

export const getSafeRuntimeContextSummary = (
  context: WorkflowRuntimeContext,
): Record<string, unknown> => ({
  areaId: context.areaId ?? null,
  currentNodeKey: context.currentNodeKey ?? null,
  daysOverdue: context.daysOverdue ?? null,
  dueDate: context.dueDate ?? null,
  evidenceCount: context.evidenceCount ?? null,
  hasEvidence: context.hasEvidence ?? null,
  observationStatus: context.observationStatus ?? null,
  previousDecision: context.previousDecision ?? null,
  processType: context.processType,
  remediationPlanStatus: context.remediationPlanStatus ?? null,
  requestType: context.requestType ?? null,
  requestedExtensionDays: context.requestedExtensionDays ?? null,
  requesterUserId: context.requesterUserId ?? null,
  responsibleUserId: context.responsibleUserId ?? null,
  riskLevel: context.riskLevel ?? null,
});
