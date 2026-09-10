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

const end = (
  id: string,
  nodeKey: string,
  finalResult: "APPROVED" | "REJECTED" | "RETURNED",
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

const run = (riskLevel: string) =>
  simulateWorkflowGraph({
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
  assert.equal(
    result.route[1]?.evaluationDetails?.[0]?.results[0]?.matched,
    true,
  );
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
        severity: "ERROR" as const,
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
  assert.ok(
    result.errors.some(
      (issue) => issue.code === "SIMULATION_BLOCKED_BY_VALIDATION",
    ),
  );
});

test("simula una devolución controlada sin reejecutar la misma decisión en bucle", () => {
  const correctionGraph = workflowDesignerSaveSchema.parse({
    nodes: [
      start,
      {
        assignmentStrategy: "REQUESTER",
        configurationJson: {
          allowedActions: ["APPROVE", "REQUEST_CORRECTION"],
          areaId: null,
          assignmentStrategy: "REQUESTER",
          commentRequired: false,
          description: null,
          electronicSignature: false,
          evidenceRequired: false,
          fallbackRoleId: null,
          fallbackStrategy: "ADMINISTRATOR",
          fallbackUserId: null,
          fieldReference: null,
          name: "Revisar",
          nodeType: "APPROVAL",
          roleId: null,
          routeLabelOnApproval: "APROBADO",
          routeLabelOnRejection: "DEVUELTO",
          schemaVersion: 1,
          stateAfterApproval: "APPROVED",
          stateAfterRejection: "RETURNED",
          userId: null,
        },
        description: null,
        id: "review",
        name: "Revisar",
        nodeKey: "review",
        positionX: 160,
        positionY: 0,
        type: "APPROVAL",
      },
      {
        assignmentStrategy: "REQUESTER",
        configurationJson: {
          channel: "EMAIL",
          description: null,
          includeRelatedRecordLink: true,
          includeWorkflowContext: true,
          name: "Notificar devolución",
          nodeType: "NOTIFICATION",
          recipientAreaId: null,
          recipientRoleId: null,
          recipientStrategy: "REQUESTER",
          recipientUserId: null,
          schemaVersion: 1,
          subjectOverride: null,
          template: "genericNotification",
        },
        description: null,
        id: "notify",
        name: "Notificar devolución",
        nodeKey: "notify",
        positionX: 320,
        positionY: 0,
        type: "NOTIFICATION",
      },
      {
        assignmentStrategy: "REQUESTER",
        configurationJson: {
          behavior: "RETURN_TO_STAGE",
          description: null,
          finalResult: "CORRECTION_REQUESTED",
          name: "Corrección",
          nodeType: "REJECTION",
          notifyRequester: true,
          preserveOriginalDeadline: true,
          requireComment: false,
          returnTargetNodeKey: "review",
          resultingState: "RETURNED",
          schemaVersion: 1,
        },
        description: null,
        id: "return",
        name: "Corrección",
        nodeKey: "return",
        positionX: 480,
        positionY: 0,
        type: "REJECTION",
      },
      end("approved", "approved", "APPROVED"),
    ],
    transitions: [
      {
        id: "start-review",
        label: null,
        priority: 0,
        sourceNodeId: "start",
        targetNodeId: "review",
        transitionType: "DEFAULT",
      },
      {
        id: "review-approved",
        label: "APROBADO",
        priority: 0,
        sourceNodeId: "review",
        targetNodeId: "approved",
        transitionType: "APPROVE",
      },
      {
        id: "review-return",
        label: "DEVUELTO",
        priority: 1,
        sourceNodeId: "review",
        targetNodeId: "notify",
        transitionType: "REQUEST_CORRECTION",
      },
      {
        id: "notify-return",
        label: "Notificar",
        priority: 0,
        sourceNodeId: "notify",
        targetNodeId: "return",
        transitionType: "DEFAULT",
      },
      {
        id: "return-review",
        label: "Corregir y reenviar",
        priority: 0,
        sourceNodeId: "return",
        targetNodeId: "review",
        transitionType: "RETURN",
      },
    ],
  });
  const correctionValidation = validateWorkflowGraph(correctionGraph, {
    definitionId: "workflow-correction",
    forPublication: false,
    processType: "SPECIAL_REQUEST",
    versionNumber: 1,
    versionStatus: "DRAFT",
    workflowDefinitionStatus: "DRAFT",
  });
  const result = simulateWorkflowGraph({
    graph: correctionGraph,
    request: {
      context: { processType: "SPECIAL_REQUEST" },
      nodeDecisions: { review: "REQUEST_CORRECTION" },
      now: new Date("2026-08-04T12:00:00.000Z"),
      startedAt: new Date("2026-08-04T12:00:00.000Z"),
    },
    validation: correctionValidation,
    versionId: "version-correction",
  });

  assert.equal(
    correctionValidation.isValid,
    true,
    JSON.stringify(correctionValidation.errors),
  );
  assert.equal(result.success, true);
  assert.equal(result.finalResult, "APPROVED");
  assert.equal(result.errors.length, 0);
  assert.ok(
    result.warnings.some((warning) =>
      warning.message.includes("retorno controlado"),
    ),
  );
  assert.ok(result.summary.visitedNodes < 10);
});

test("simula las rutas A-E del orquestador de observaciones", () => {
  const node = (
    nodeKey: string,
    type: string,
    configurationJson: Record<string, unknown>,
    positionX: number,
  ) => ({
    configurationJson,
    description: null,
    id: nodeKey,
    name: configurationJson.name,
    nodeKey,
    positionX,
    positionY: 0,
    type,
  });
  const base = (name: string, nodeType: string) => ({
    description: null,
    name,
    nodeType,
    schemaVersion: 1,
  });
  const condition = (
    nodeKey: string,
    field: string,
    operator: string,
    value: boolean | number | string,
  ) =>
    node(
      nodeKey,
      "CONDITION",
      {
        ...base(nodeKey, "CONDITION"),
        defaultRouteLabel: "NO",
        logicalOperator: "AND",
        rules: [{ field, operator, resultLabel: null, value }],
      },
      0,
    );
  const route = (
    id: string,
    sourceNodeId: string,
    targetNodeId: string,
    transitionType: string,
    conditionField?: string,
    conditionValue?: boolean | number | string,
    priority = 0,
  ) => ({
    conditionGroup: conditionField
      ? {
          conditions: [
            {
              description: null,
              field: conditionField,
              operator:
                typeof conditionValue === "number" ? "GREATER_THAN" : "EQUALS",
              resultLabel: null,
              sequence: 0,
              value: conditionValue,
            },
          ],
          description: null,
          id: `${id}-condition`,
          logicOperator: "AND",
        }
      : null,
    id,
    label: null,
    priority,
    sourceNodeId,
    targetNodeId,
    transitionType,
  });
  const stage = (nodeKey: string) =>
    node(
      nodeKey,
      "STAGE",
      {
        ...base(nodeKey, "STAGE"),
        allowedActions: ["COMPLETE"],
        areaId: null,
        assignmentStrategy: "REQUESTER",
        fallbackRoleId: null,
        fallbackStrategy: "ADMINISTRATOR",
        fallbackUserId: null,
        fieldReference: null,
        requiredComment: false,
        requiredEvidence: false,
        resultingState: null,
        roleId: null,
        sla: null,
        userId: null,
      },
      0,
    );
  const graph = workflowDesignerSaveSchema.parse({
    nodes: [
      node(
        "start",
        "START",
        {
          ...base("Inicio", "START"),
          activationNote: null,
          initialWorkflowState: "DRAFT",
          processType: "OBSERVATION_LIFECYCLE",
          triggerProcess: "OBSERVATION_LIFECYCLE",
        },
        0,
      ),
      condition("area", "areaPlanRequired", "EQUALS", true),
      stage("create-area-plan"),
      stage("execute"),
      condition("extension", "requestedExtensionDays", "GREATER_THAN", 0),
      node(
        "deadline-extension",
        "SUBFLOW",
        {
          ...base("Ampliación", "SUBFLOW"),
          referencedProcessType: "DEADLINE_EXTENSION",
        },
        0,
      ),
      condition("extension-result", "previousDecision", "EQUALS", "REJECTED"),
      node(
        "extension-rejected",
        "NOTIFICATION",
        {
          ...base("Ampliación rechazada", "NOTIFICATION"),
          channel: "EMAIL",
          includeRelatedRecordLink: true,
          includeWorkflowContext: true,
          recipientAreaId: null,
          recipientRoleId: null,
          recipientStrategy: "REQUESTER",
          recipientUserId: null,
          subjectOverride: null,
          template: "genericNotification",
        },
        0,
      ),
      node(
        "audit",
        "APPROVAL",
        {
          ...base("Evaluar", "APPROVAL"),
          allowedActions: ["APPROVE", "REQUEST_CORRECTION"],
          areaId: null,
          assignmentStrategy: "REQUESTER",
          commentRequired: false,
          electronicSignature: false,
          evidenceRequired: false,
          fallbackRoleId: null,
          fallbackStrategy: "ADMINISTRATOR",
          fallbackUserId: null,
          fieldReference: null,
          roleId: null,
          routeLabelOnApproval: "APROBADO",
          routeLabelOnRejection: "DEVUELTO",
          sla: null,
          stateAfterApproval: "APPROVED",
          stateAfterRejection: "RETURNED",
          userId: null,
        },
        0,
      ),
      node(
        "correction",
        "REJECTION",
        {
          ...base("Corrección", "REJECTION"),
          behavior: "RETURN_TO_STAGE",
          finalResult: "CORRECTION_REQUESTED",
          notifyRequester: true,
          preserveOriginalDeadline: true,
          requireComment: false,
          resultingState: "RETURNED",
          returnTargetNodeKey: "audit",
        },
        0,
      ),
      condition("all-plans", "allPlansValidated", "EQUALS", true),
      node(
        "closure",
        "SUBFLOW",
        {
          ...base("Cierre", "SUBFLOW"),
          referencedProcessType: "OBSERVATION_CLOSURE",
        },
        0,
      ),
      end("finish", "finish", "APPROVED"),
      end("blocked", "blocked", "RETURNED"),
    ],
    transitions: [
      route("start-area", "start", "area", "DEFAULT"),
      route(
        "area-yes",
        "area",
        "create-area-plan",
        "CONDITION",
        "areaPlanRequired",
        true,
      ),
      route("area-no", "area", "execute", "DEFAULT", undefined, undefined, 1),
      route("create-execute", "create-area-plan", "execute", "DEFAULT"),
      route("execute-extension", "execute", "extension", "DEFAULT"),
      route(
        "extension-yes",
        "extension",
        "deadline-extension",
        "CONDITION",
        "requestedExtensionDays",
        0,
      ),
      route(
        "extension-no",
        "extension",
        "audit",
        "DEFAULT",
        undefined,
        undefined,
        1,
      ),
      route(
        "extension-result",
        "deadline-extension",
        "extension-result",
        "DEFAULT",
      ),
      route(
        "extension-rejected",
        "extension-result",
        "extension-rejected",
        "CONDITION",
        "previousDecision",
        "REJECTED",
      ),
      route(
        "extension-approved",
        "extension-result",
        "audit",
        "DEFAULT",
        undefined,
        undefined,
        1,
      ),
      route("rejected-audit", "extension-rejected", "audit", "DEFAULT"),
      route("audit-approved", "audit", "all-plans", "APPROVE"),
      route(
        "audit-correction",
        "audit",
        "correction",
        "REQUEST_CORRECTION",
        undefined,
        undefined,
        1,
      ),
      route("correction-audit", "correction", "audit", "RETURN"),
      route(
        "all-yes",
        "all-plans",
        "closure",
        "CONDITION",
        "allPlansValidated",
        true,
      ),
      route(
        "all-no",
        "all-plans",
        "blocked",
        "DEFAULT",
        undefined,
        undefined,
        1,
      ),
      route("closure-finish", "closure", "finish", "DEFAULT"),
    ],
  });
  const validation = validateWorkflowGraph(graph, {
    definitionId: "workflow-observation-lifecycle",
    forPublication: false,
    processType: "OBSERVATION_LIFECYCLE",
    versionNumber: 1,
    versionStatus: "DRAFT",
    workflowDefinitionStatus: "DRAFT",
  });
  const cases = [
    {
      allPlansValidated: true,
      areaPlanRequired: false,
      expected: "finish",
      name: "A",
      previousDecision: "APPROVED",
      requestedExtensionDays: 0,
    },
    {
      allPlansValidated: true,
      areaPlanRequired: true,
      expected: "finish",
      name: "B",
      previousDecision: "APPROVED",
      requestedExtensionDays: 5,
    },
    {
      allPlansValidated: true,
      areaPlanRequired: true,
      expected: "finish",
      name: "C",
      previousDecision: "REJECTED",
      requestedExtensionDays: 5,
    },
    {
      allPlansValidated: true,
      areaPlanRequired: true,
      expected: "finish",
      name: "D",
      nodeDecisions: { audit: "REQUEST_CORRECTION" },
      previousDecision: "APPROVED",
      requestedExtensionDays: 0,
    },
    {
      allPlansValidated: false,
      areaPlanRequired: false,
      expected: "blocked",
      name: "E",
      previousDecision: "APPROVED",
      requestedExtensionDays: 0,
    },
  ];

  assert.equal(validation.isValid, true, JSON.stringify(validation.errors));
  for (const scenario of cases) {
    const result = simulateWorkflowGraph({
      graph,
      request: {
        context: {
          allPlansValidated: scenario.allPlansValidated,
          areaPlanRequired: scenario.areaPlanRequired,
          previousDecision: scenario.previousDecision,
          processType: "OBSERVATION_LIFECYCLE",
          requestedExtensionDays: scenario.requestedExtensionDays,
        },
        nodeDecisions: scenario.nodeDecisions ?? {},
        now: new Date("2026-09-09T12:00:00.000Z"),
        scenarioName: `PATH ${scenario.name}`,
        startedAt: new Date("2026-09-09T12:00:00.000Z"),
      },
      validation,
      versionId: "observation-lifecycle-v1",
    });
    assert.equal(result.success, true, scenario.name);
    assert.equal(
      result.route.at(-1)?.nodeKey,
      scenario.expected,
      scenario.name,
    );
    assert.equal(
      result.finalResult,
      scenario.expected === "finish" ? "APPROVED" : "RETURNED",
    );
  }
});
