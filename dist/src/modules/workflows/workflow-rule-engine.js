import { evaluateWorkflowRule, } from "./workflow-rule-operators.js";
import { normalizeWorkflowSimulationContext, } from "./workflow-rule-fields.js";
export const evaluateConditionGroup = (group, rawContext, options) => {
    const context = normalizeWorkflowSimulationContext(rawContext);
    const orderedConditions = [...group.conditions].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
    const results = [];
    for (const [index, condition] of orderedConditions.entries()) {
        const result = evaluateWorkflowRule(condition, context, options, index);
        results.push(result);
        if (options.shortCircuit) {
            if (group.logicOperator === "AND" && !result.matched)
                break;
            if (group.logicOperator === "OR" && result.matched)
                break;
        }
    }
    const matched = orderedConditions.length > 0 &&
        (group.logicOperator === "AND"
            ? results.every((result) => result.matched)
            : results.some((result) => result.matched));
    return {
        logicOperator: group.logicOperator,
        matched,
        results,
    };
};
export const evaluateConditionGroups = (groups, rawContext, options) => {
    return groups.map((group) => evaluateConditionGroup(group, rawContext, options));
};
//# sourceMappingURL=workflow-rule-engine.js.map