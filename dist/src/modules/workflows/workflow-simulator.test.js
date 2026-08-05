import assert from "node:assert/strict";
import test from "node:test";
import { simulateWorkflowGraph } from "./workflow-simulator.js";
import { validateWorkflowGraph } from "./workflow-validator.js";
import { workflowDesignerSaveSchema } from "./workflows.validators.js";
const start = {
    configurationJson: {
        activationNote: null,
        description: null,
        initialWorkflowState: "DRAFT",
        name: "Inicio",
        nodeType: "START",
        processType: "SPECIAL_REQUEST",
        schemaVersion: 1,
        triggerProcess: "SPECIAL_REQUEST",
    },
    description: null,
    id: "start",
    name: "Inicio",
    nodeKey: "start",
    positionX: 0,
    positionY: 0,
    type: "START",
};
const end = (id, nodeKey, finalResult) => ({
    configurationJson: {
        completionMessage: null,
        description: null,
        finalResult,
        finalWorkflowStatus: "COMPLETED",
        name: nodeKey,
        nodeType: "END",
        notifyParticipants: true,
        relatedRecordTargetState: null,
        schemaVersion: 1,
    },
    description: null,
    id,
    name: nodeKey,
    nodeKey,
    positionX: 320,
    positionY: 0,
    type: "END",
});
const condition = {
    configurationJson: {
        defaultRouteLabel: "Por defecto",
        description: null,
        logicalOperator: "AND",
        name: "Evaluar riesgo",
        nodeType: "CONDITION",
        rules: [
            {
                field: "riskLevel",
                operator: "EQUALS",
                resultLabel: null,
                value: "ALTO",
            },
        ],
        schemaVersion: 1,
    },
    description: null,
    id: "condition",
    name: "Evaluar riesgo",
    nodeKey: "condition",
    positionX: 160,
    positionY: 0,
    type: "CONDITION",
};
const graph = workflowDesignerSaveSchema.parse({
    nodes: [
        start,
        condition,
        end("approved", "approved", "APPROVED"),
        end("rejected", "rejected", "REJECTED"),
    ],
    transitions: [
        {
            id: "start-condition",
            label: null,
            priority: 0,
            sourceNodeId: "start",
            targetNodeId: "condition",
            transitionType: "DEFAULT",
        },
        {
            id: "condition-approved",
            label: "Alto",
            priority: 0,
            sourceNodeId: "condition",
            targetNodeId: "approved",
            transitionType: "CONDITION",
        },
        {
            id: "condition-rejected",
            label: "Por defecto",
            priority: 1,
            sourceNodeId: "condition",
            targetNodeId: "rejected",
            transitionType: "DEFAULT",
        },
    ],
});
const validation = validateWorkflowGraph(graph, {
    definitionId: "workflow-1",
    forPublication: false,
    processType: "SPECIAL_REQUEST",
    versionNumber: 1,
    versionStatus: "DRAFT",
    workflowDefinitionStatus: "DRAFT",
});
const run = (riskLevel) => simulateWorkflowGraph({
    graph,
    request: {
        context: {
            processType: "SPECIAL_REQUEST",
            riskLevel,
        },
        nodeDecisions: {},
        now: new Date("2026-08-04T12:00:00.000Z"),
        startedAt: new Date("2026-08-04T12:00:00.000Z"),
    },
    validation,
    versionId: "version-1",
});
test("simula la ruta condicionada y produce trazabilidad evaluable", () => {
    const result = run("HIGH");
    assert.equal(validation.isValid, true);
    assert.equal(result.success, true);
    assert.equal(result.finalResult, "APPROVED");
    assert.equal(result.summary.visitedNodes, 3);
    assert.equal(result.summary.evaluatedConditions, 1);
    assert.equal(result.route[1]?.selectedTransition?.targetNodeKey, "approved");
    assert.equal(result.route[1]?.evaluationDetails?.[0]?.results[0]?.matched, true);
});
test("simula el fallback cuando ninguna condición coincide", () => {
    const result = run("LOW");
    assert.equal(result.success, true);
    assert.equal(result.finalResult, "REJECTED");
    assert.equal(result.route[1]?.selectedTransition?.targetNodeKey, "rejected");
    assert.equal(result.route[1]?.warnings.length, 0);
});
test("bloquea la simulación cuando el grafo tiene errores estructurales", () => {
    const invalidValidation = {
        ...validation,
        errors: [
            {
                code: "START_COUNT",
                message: "Falta Inicio.",
                severity: "ERROR",
            },
        ],
        isValid: false,
    };
    const result = simulateWorkflowGraph({
        graph,
        request: {
            context: { processType: "SPECIAL_REQUEST" },
            nodeDecisions: {},
            now: new Date("2026-08-04T12:00:00.000Z"),
            startedAt: new Date("2026-08-04T12:00:00.000Z"),
        },
        validation: invalidValidation,
        versionId: "version-1",
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((issue) => issue.code === "SIMULATION_BLOCKED_BY_VALIDATION"));
});
//# sourceMappingURL=workflow-simulator.test.js.map