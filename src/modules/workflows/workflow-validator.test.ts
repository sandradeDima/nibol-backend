import assert from "node:assert/strict";
import test from "node:test";

import { validateWorkflowGraph } from "./workflow-validator.js";
import { workflowDesignerSaveSchema } from "./workflows.validators.js";

const options = {
  definitionId: "workflow-1",
  forPublication: true,
  processType: "SPECIAL_REQUEST",
  versionNumber: 1,
  versionStatus: "DRAFT",
  workflowDefinitionStatus: "DRAFT",
};

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

const end = (
  id: string,
  nodeKey: string,
  finalResult: "APPROVED" | "REJECTED",
) => ({
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

const transition = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  transitionType: "DEFAULT" | "CONDITION",
  priority: number,
) => ({
  id,
  label: null,
  priority,
  sourceNodeId,
  targetNodeId,
  transitionType,
});

const parse = (graph: { nodes: unknown[]; transitions: unknown[] }) =>
  workflowDesignerSaveSchema.parse(graph);

test("aprueba un grafo con ruta condicionada, fallback y hash determinista", () => {
  const graph = parse({
    nodes: [
      start,
      condition,
      end("approved", "approved", "APPROVED"),
      end("rejected", "rejected", "REJECTED"),
    ],
    transitions: [
      transition("start-condition", "start", "condition", "DEFAULT", 0),
      transition("condition-approved", "condition", "approved", "CONDITION", 0),
      transition("condition-rejected", "condition", "rejected", "DEFAULT", 1),
    ],
  });

  const result = validateWorkflowGraph(graph, options);

  assert.equal(result.isValid, true);
  assert.equal(result.publicationReady, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.reachableNodeCount, 4);
  assert.equal(result.summary.routeCountEstimate, 2);
  assert.match(result.graphHash ?? "", /^[a-f0-9]{64}$/);
});

test("detecta nodos inalcanzables, callejones sin salida y ciclos no controlados", () => {
  const graph = parse({
    nodes: [
      start,
      end("end", "end", "APPROVED"),
      {
        ...end("orphan", "orphan", "REJECTED"),
        type: "END",
      },
      {
        ...start,
        id: "loop",
        name: "Loop",
        nodeKey: "loop",
        type: "STAGE",
        configurationJson: {
          allowedActions: ["COMPLETE"],
          areaId: null,
          assignmentStrategy: null,
          description: null,
          fallbackRoleId: null,
          fallbackStrategy: "STOP",
          fallbackUserId: null,
          fieldReference: null,
          name: "Loop",
          nodeType: "STAGE",
          requiredComment: false,
          requiredEvidence: false,
          resultingState: null,
          roleId: null,
          schemaVersion: 1,
          sla: null,
          userId: null,
        },
      },
    ],
    transitions: [
      transition("start-end", "start", "end", "DEFAULT", 0),
      transition("loop-loop", "loop", "loop", "DEFAULT", 0),
    ],
  });

  const result = validateWorkflowGraph(graph, options);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((issue) => issue.code === "UNREACHABLE_NODE"));
  assert.ok(result.errors.some((issue) => issue.code === "SELF_LOOP"));
  assert.ok(result.errors.some((issue) => issue.code === "INFINITE_CYCLE"));
});

test("requiere la ruta fallback cuando se declaran reglas de condición", () => {
  const graph = parse({
    nodes: [start, condition, end("approved", "approved", "APPROVED")],
    transitions: [
      transition("start-condition", "start", "condition", "DEFAULT", 0),
      transition("condition-approved", "condition", "approved", "CONDITION", 0),
    ],
  });

  const result = validateWorkflowGraph(graph, options);

  assert.ok(
    result.errors.some((issue) => issue.code === "CONDITION_FALLBACK_REQUIRED"),
  );
});
