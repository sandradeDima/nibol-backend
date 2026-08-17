import { getOutgoingTransitions, getTransitionConditionGroup, getTransitionTarget, isFallbackTransition, normalizeTransitionType, } from "./workflow-graph.js";
import { evaluateConditionGroup, } from "./workflow-rule-engine.js";
import { WORKFLOW_RUNTIME_ERROR_CODES } from "./workflow-runtime-errors.js";
const selectionError = (errorCode, errorMessage) => ({
    conditionEvaluations: [],
    selected: null,
    usedFallback: false,
    errorCode,
    errorMessage,
});
const selectDefaultTransition = (graph, node) => {
    const outgoing = getOutgoingTransitions(graph, node);
    if (outgoing.length === 1) {
        return {
            conditionEvaluations: [],
            selected: outgoing[0] ?? null,
            usedFallback: false,
        };
    }
    const fallback = outgoing.find((transition) => isFallbackTransition(node, transition));
    if (fallback) {
        return {
            conditionEvaluations: [],
            selected: fallback,
            usedFallback: true,
        };
    }
    return selectionError(WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND, `El nodo ${node.name} no tiene una ruta automática determinista.`);
};
const selectConditionTransition = (graph, node, context, now) => {
    const outgoing = getOutgoingTransitions(graph, node);
    const conditionTransitions = outgoing.filter((transition) => !isFallbackTransition(node, transition) &&
        Boolean(getTransitionConditionGroup(node, transition)));
    const evaluations = [];
    for (const transition of conditionTransitions) {
        const group = getTransitionConditionGroup(node, transition);
        if (!group)
            continue;
        const evaluation = evaluateConditionGroup(group, context, {
            detailed: true,
            now,
            shortCircuit: false,
        });
        evaluations.push({
            evaluation,
            groupId: group.id ?? null,
        });
        if (evaluation.matched) {
            return {
                conditionEvaluations: evaluations,
                selected: transition,
                usedFallback: false,
            };
        }
    }
    const fallback = outgoing.find((transition) => isFallbackTransition(node, transition));
    if (fallback) {
        return {
            conditionEvaluations: evaluations,
            selected: fallback,
            usedFallback: true,
        };
    }
    return {
        ...selectionError(WORKFLOW_RUNTIME_ERROR_CODES.CONDITION_NO_ROUTE, "Ninguna regla coincidió y el nodo no tiene una ruta fallback."),
        conditionEvaluations: evaluations,
    };
};
const selectHumanTransition = (graph, node, decision) => {
    const normalizedDecision = decision.trim().toUpperCase();
    const configuration = node.configurationJson;
    if ((configuration.nodeType !== "STAGE" &&
        configuration.nodeType !== "APPROVAL") ||
        !configuration.allowedActions.includes(normalizedDecision)) {
        return selectionError(WORKFLOW_RUNTIME_ERROR_CODES.ACTION_NOT_ALLOWED, `La acción ${normalizedDecision} no está permitida en el nodo ${node.name}.`);
    }
    const outgoing = getOutgoingTransitions(graph, node);
    const exact = outgoing.find((transition) => normalizeTransitionType(transition.transitionType) === normalizedDecision);
    if (exact) {
        return {
            conditionEvaluations: [],
            selected: exact,
            usedFallback: false,
        };
    }
    const fallback = outgoing.find((transition) => isFallbackTransition(node, transition));
    if (fallback) {
        return {
            conditionEvaluations: [],
            selected: fallback,
            usedFallback: true,
        };
    }
    return selectionError(WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND, `No existe una ruta controlada para la acción ${normalizedDecision}.`);
};
const selectRejectionTransition = (graph, node) => {
    const configuration = node.configurationJson;
    if (configuration.nodeType !== "REJECTION") {
        return selectDefaultTransition(graph, node);
    }
    const outgoing = getOutgoingTransitions(graph, node);
    if (configuration.returnTargetNodeKey) {
        const target = outgoing.find((transition) => getTransitionTarget(graph, transition)?.nodeKey ===
            configuration.returnTargetNodeKey);
        if (target) {
            return {
                conditionEvaluations: [],
                selected: target,
                usedFallback: false,
            };
        }
    }
    const preferredTypes = configuration.behavior === "REQUEST_CORRECTION"
        ? ["CORRECTION", "RETURN"]
        : configuration.behavior === "RETURN_TO_STAGE"
            ? ["RETURN", "CORRECTION"]
            : ["REJECT"];
    const preferred = outgoing.find((transition) => preferredTypes.includes(normalizeTransitionType(transition.transitionType)));
    if (preferred) {
        return {
            conditionEvaluations: [],
            selected: preferred,
            usedFallback: false,
        };
    }
    return selectDefaultTransition(graph, node);
};
export const selectRuntimeTransition = ({ context, decision, graph, node, now, }) => {
    switch (node.configurationJson.nodeType) {
        case "CONDITION":
            return selectConditionTransition(graph, node, context, now);
        case "STAGE":
        case "APPROVAL":
            return decision
                ? selectHumanTransition(graph, node, decision)
                : selectionError(WORKFLOW_RUNTIME_ERROR_CODES.TRANSITION_NOT_FOUND, `El nodo ${node.name} requiere una decisión humana.`);
        case "REJECTION":
            return selectRejectionTransition(graph, node);
        case "END":
            return { conditionEvaluations: [], selected: null, usedFallback: false };
        default:
            return selectDefaultTransition(graph, node);
    }
};
export const summarizeConditionEvaluations = (evaluations) => evaluations.map(({ evaluation, groupId }) => ({
    groupId,
    logicOperator: evaluation.logicOperator,
    matched: evaluation.matched,
    results: evaluation.results.map((result) => ({
        conditionId: result.conditionId,
        field: result.field,
        matched: result.matched,
        operator: result.operator,
    })),
}));
//# sourceMappingURL=workflow-transition-resolver.js.map