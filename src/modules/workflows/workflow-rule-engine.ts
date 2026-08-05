import {
  evaluateWorkflowRule,
  type WorkflowRuleCondition,
  type WorkflowRuleEvaluation,
  type WorkflowRuleEvaluationOptions,
} from "./workflow-rule-operators.js";
import {
  normalizeWorkflowSimulationContext,
  type WorkflowSimulationContext,
} from "./workflow-rule-fields.js";

export type WorkflowConditionGroup = {
  conditions: WorkflowRuleCondition[];
  id?: string | null | undefined;
  logicOperator: "AND" | "OR";
};

export type ConditionGroupEvaluation = {
  logicOperator: "AND" | "OR";
  matched: boolean;
  results: Array<WorkflowRuleEvaluation>;
};

export const evaluateConditionGroup = (
  group: WorkflowConditionGroup,
  rawContext: WorkflowSimulationContext,
  options: WorkflowRuleEvaluationOptions,
): ConditionGroupEvaluation => {
  const context = normalizeWorkflowSimulationContext(rawContext);
  const orderedConditions = [...group.conditions].sort(
    (left, right) => (left.sequence ?? 0) - (right.sequence ?? 0),
  );
  const results: WorkflowRuleEvaluation[] = [];

  for (const [index, condition] of orderedConditions.entries()) {
    const result = evaluateWorkflowRule(condition, context, options, index);
    results.push(result);

    if (options.shortCircuit) {
      if (group.logicOperator === "AND" && !result.matched) break;
      if (group.logicOperator === "OR" && result.matched) break;
    }
  }

  const matched =
    orderedConditions.length > 0 &&
    (group.logicOperator === "AND"
      ? results.every((result) => result.matched)
      : results.some((result) => result.matched));

  return {
    logicOperator: group.logicOperator,
    matched,
    results,
  };
};

export const evaluateConditionGroups = (
  groups: WorkflowConditionGroup[],
  rawContext: WorkflowSimulationContext,
  options: WorkflowRuleEvaluationOptions,
): ConditionGroupEvaluation[] => {
  return groups.map((group) =>
    evaluateConditionGroup(group, rawContext, options),
  );
};
