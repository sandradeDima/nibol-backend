import { getOutgoingTransitions, getTransitionConditionGroup, getTransitionTarget, isFallbackTransition, normalizeTransitionType, } from "./workflow-graph.js";
import { resolveAssignmentProjection, } from "./workflow-context-builder.js";
import { evaluateConditionGroup, } from "./workflow-rule-engine.js";
import { WORKFLOW_GRAPH_LIMITS } from "./workflows.constants.js";
const issue = (code, message, node, severity) => ({
    code,
    message,
    nodeId: node.id ?? node.nodeKey,
    nodeKey: node.nodeKey,
    severity,
});
const getDecision = (request, node, fallback) => {
    const configured = request.nodeDecisions[node.nodeKey];
    return configured
        ? { decision: configured, wasDefaulted: false }
        : { decision: fallback, wasDefaulted: true };
};
const routeDescriptor = (graph, transition) => {
    const target = getTransitionTarget(graph, transition);
    if (!target)
        return undefined;
    return {
        ...(transition.id ? { id: transition.id } : {}),
        label: transition.label ?? null,
        targetNodeId: target.id ?? target.nodeKey,
        targetNodeKey: target.nodeKey,
        transitionType: normalizeTransitionType(transition.transitionType),
    };
};
const chooseActionTransition = (graph, node, action) => {
    const outgoing = getOutgoingTransitions(graph, node);
    const exact = outgoing.find((transition) => normalizeTransitionType(transition.transitionType) === action);
    if (exact)
        return { transition: exact, usedFallback: false };
    const fallback = outgoing.find((transition) => isFallbackTransition(node, transition));
    if (fallback)
        return { transition: fallback, usedFallback: true };
    return { transition: outgoing[0] ?? null, usedFallback: false };
};
const getAssignmentConfiguration = (configuration) => {
    if (configuration.nodeType !== "STAGE" &&
        configuration.nodeType !== "APPROVAL") {
        return null;
    }
    return configuration;
};
const addProjectionErrors = (node, projection, errors, warnings) => {
    for (const message of projection.errors) {
        errors.push(issue("ASSIGNMENT_SIMULATION_ERROR", message, node, "ERROR"));
    }
    for (const message of projection.warnings) {
        warnings.push(issue("ASSIGNMENT_SIMULATION_WARNING", message, node, "WARNING"));
    }
};
const findConditionTransition = (graph, node, context, now) => {
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
        evaluations.push(evaluation);
        if (evaluation.matched) {
            return { evaluations, selected: transition };
        }
    }
    const fallback = outgoing.find((transition) => isFallbackTransition(node, transition));
    return {
        evaluations,
        selected: fallback ?? null,
        ...(fallback
            ? {}
            : {
                error: "Ninguna regla coincidió y el nodo no tiene una ruta fallback.",
            }),
    };
};
const selectRejectionTransition = (graph, node) => {
    const configuration = node.configurationJson;
    const outgoing = getOutgoingTransitions(graph, node);
    if (configuration.nodeType !== "REJECTION")
        return outgoing[0] ?? null;
    if (configuration.returnTargetNodeKey) {
        const targetTransition = outgoing.find((transition) => getTransitionTarget(graph, transition)?.nodeKey ===
            configuration.returnTargetNodeKey);
        if (targetTransition)
            return targetTransition;
    }
    return (outgoing.find((transition) => {
        const type = normalizeTransitionType(transition.transitionType);
        return type === "RETURN" || type === "CORRECTION" || type === "REJECT";
    }) ??
        outgoing.find((transition) => isFallbackTransition(node, transition)) ??
        outgoing[0] ??
        null);
};
const chooseNextTransition = (graph, node, request, context) => {
    const configuration = node.configurationJson;
    const outgoing = getOutgoingTransitions(graph, node);
    switch (configuration.nodeType) {
        case "END":
            return { evaluations: [], selected: null, warnings: [] };
        case "CONDITION": {
            const condition = findConditionTransition(graph, node, context, request.now);
            return {
                evaluations: condition.evaluations,
                selected: condition.selected,
                warnings: [],
                ...(condition.error ? { error: condition.error } : {}),
            };
        }
        case "APPROVAL": {
            const selectedDecision = getDecision(request, node, "APPROVE");
            const normalized = selectedDecision.decision.toUpperCase();
            if (!configuration.allowedActions.includes(normalized)) {
                return {
                    evaluations: [],
                    selected: null,
                    selectedDecision: normalized,
                    warnings: [],
                    error: `La decisión ${normalized} no está permitida en el nodo.`,
                };
            }
            const choice = chooseActionTransition(graph, node, normalized);
            return {
                evaluations: [],
                selected: choice.transition,
                selectedDecision: normalized,
                warnings: selectedDecision.wasDefaulted
                    ? ["Se aplicó APPROVE como decisión simulada predeterminada."]
                    : choice.usedFallback
                        ? ["Se utilizó la salida DEFAULT para la decisión simulada."]
                        : [],
            };
        }
        case "STAGE": {
            const selectedDecision = getDecision(request, node, "COMPLETE");
            const normalized = selectedDecision.decision.toUpperCase();
            if (!configuration.allowedActions.includes(normalized)) {
                return {
                    evaluations: [],
                    selected: null,
                    selectedDecision: normalized,
                    warnings: [],
                    error: `La acción ${normalized} no está permitida en el nodo.`,
                };
            }
            const choice = chooseActionTransition(graph, node, normalized);
            return {
                evaluations: [],
                selected: choice.transition,
                selectedDecision: normalized,
                warnings: selectedDecision.wasDefaulted
                    ? ["Se aplicó COMPLETE como acción simulada predeterminada."]
                    : choice.usedFallback
                        ? ["Se utilizó la salida DEFAULT para la acción simulada."]
                        : [],
            };
        }
        case "REJECTION":
            return {
                evaluations: [],
                selected: selectRejectionTransition(graph, node),
                warnings: [],
            };
        default:
            return {
                evaluations: [],
                selected: outgoing[0] ?? null,
                warnings: outgoing.length > 1
                    ? [
                        "Se utilizó la primera salida por prioridad para esta simulación.",
                    ]
                    : [],
            };
    }
};
export const simulateWorkflowGraph = ({ graph, request, validation, versionId, }) => {
    const startedAt = request.startedAt;
    const context = { ...request.context };
    const errors = [...validation.errors];
    const warnings = [...validation.warnings];
    const route = [];
    const start = graph.nodes.find((node) => node.type === "START") ?? null;
    let current = start;
    let finalNodeId;
    let finalResult;
    let evaluatedConditions = 0;
    let resolvedAssignments = 0;
    let projectedNotifications = 0;
    let projectedTimers = 0;
    if (validation.errors.length > 0 || !start) {
        errors.push({
            code: "SIMULATION_BLOCKED_BY_VALIDATION",
            message: "La simulación no puede iniciar porque la configuración tiene errores.",
            severity: "ERROR",
        });
    }
    for (let stepIndex = 0; current && stepIndex < WORKFLOW_GRAPH_LIMITS.maxSimulationSteps; stepIndex += 1) {
        const node = current;
        const inputContext = { ...context };
        const stepErrors = [];
        const stepWarnings = [];
        const step = {
            errors: stepErrors,
            inputContext,
            nodeId: node.id ?? node.nodeKey,
            nodeKey: node.nodeKey,
            nodeName: node.name,
            nodeType: node.type,
            resultingContext: { ...context },
            sequence: stepIndex + 1,
            warnings: stepWarnings,
        };
        if (node.configurationJson.nodeType === "START" &&
            node.configurationJson.processType !== context.processType) {
            stepErrors.push(issue("START_PROCESS_MISMATCH", "El proceso del escenario no coincide con el nodo Inicio.", node, "ERROR"));
        }
        const assignmentConfiguration = getAssignmentConfiguration(node.configurationJson);
        if (assignmentConfiguration) {
            const projection = resolveAssignmentProjection(assignmentConfiguration, context, request.assignmentLookup);
            step.projectedAssignment = projection;
            addProjectionErrors(node, projection, stepErrors, stepWarnings);
            if (projection.kind !== "UNRESOLVED")
                resolvedAssignments += 1;
        }
        if (node.configurationJson.nodeType === "SLA") {
            const configuration = node.configurationJson;
            step.projectedSla = {
                duration: configuration.duration,
                escalationThreshold: configuration.escalationThreshold,
                reminderThreshold: configuration.reminderThreshold,
                unit: configuration.unit,
            };
            projectedTimers += 1;
        }
        else if (assignmentConfiguration?.sla) {
            step.projectedSla = {
                duration: assignmentConfiguration.sla.duration,
                escalationThreshold: assignmentConfiguration.sla.escalationThreshold,
                reminderThreshold: assignmentConfiguration.sla.reminderThreshold,
                unit: assignmentConfiguration.sla.unit,
            };
            projectedTimers += 1;
        }
        if (node.configurationJson.nodeType === "NOTIFICATION") {
            const configuration = node.configurationJson;
            step.projectedNotification = {
                channel: configuration.channel,
                recipientStrategy: configuration.recipientStrategy,
                template: configuration.template,
            };
            projectedNotifications += 1;
        }
        const next = chooseNextTransition(graph, node, request, context);
        step.evaluationDetails = next.evaluations;
        evaluatedConditions += next.evaluations.reduce((total, evaluation) => total + evaluation.results.length, 0);
        for (const message of next.warnings) {
            stepWarnings.push(issue("SIMULATION_DEFAULT", message, node, "WARNING"));
        }
        if (next.selectedDecision)
            step.selectedDecision = next.selectedDecision;
        if (next.error) {
            stepErrors.push(issue("SIMULATION_ROUTE_ERROR", next.error, node, "ERROR"));
        }
        if (next.selected) {
            const descriptor = routeDescriptor(graph, next.selected);
            if (descriptor)
                step.selectedTransition = descriptor;
            const target = getTransitionTarget(graph, next.selected);
            if (target) {
                context.currentNodeKey = target.nodeKey;
                step.resultingContext = { ...context };
                current = target;
            }
            else {
                current = null;
            }
        }
        else {
            current = null;
        }
        if (node.type === "END") {
            finalNodeId = node.id ?? node.nodeKey;
            const configuration = node.configurationJson;
            if (configuration.nodeType === "END")
                finalResult = configuration.finalResult;
            current = null;
        }
        route.push(step);
        errors.push(...stepErrors);
        warnings.push(...stepWarnings);
        if (stepErrors.length > 0 && node.type !== "END")
            break;
    }
    if (current) {
        errors.push({
            code: "SIMULATION_STEP_LIMIT",
            message: `La simulación superó el máximo de ${WORKFLOW_GRAPH_LIMITS.maxSimulationSteps} pasos.`,
            severity: "ERROR",
        });
    }
    const completedAt = new Date(request.now.getTime());
    return {
        completedAt: completedAt.toISOString(),
        errors,
        evaluatedConditions,
        ...(finalNodeId ? { finalNodeId } : {}),
        ...(finalResult ? { finalResult } : {}),
        projectedNotifications,
        projectedTimers,
        route,
        ...(request.scenarioName ? { scenarioName: request.scenarioName } : {}),
        startedAt: startedAt.toISOString(),
        success: errors.length === 0 && Boolean(finalNodeId),
        summary: {
            evaluatedConditions,
            projectedNotifications,
            projectedTimers,
            resolvedAssignments,
            visitedNodes: route.length,
        },
        versionId,
        warnings,
    };
};
//# sourceMappingURL=workflow-simulator.js.map