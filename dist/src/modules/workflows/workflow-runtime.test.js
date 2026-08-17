import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflowRuntimeContext } from "./workflow-runtime-context.js";
import { selectRuntimeTransition } from "./workflow-transition-resolver.js";
import { workflowDesignerSaveSchema } from "./workflows.validators.js";
const node = (input) => input;
const graph = workflowDesignerSaveSchema.parse({
    nodes: [
        node({
            configurationJson: {
                activationNote: null,
                description: null,
                initialWorkflowState: "ACTIVE",
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
        }),
        node({
            configurationJson: {
                allowedActions: ["APPROVE", "REJECT"],
                areaId: null,
                assignmentStrategy: "REQUESTER",
                commentRequired: false,
                description: null,
                electronicSignature: false,
                evidenceRequired: false,
                fallbackRoleId: null,
                fallbackStrategy: "STOP",
                fallbackUserId: null,
                fieldReference: null,
                name: "Aprobación",
                nodeType: "APPROVAL",
                roleId: null,
                routeLabelOnApproval: null,
                routeLabelOnRejection: null,
                schemaVersion: 1,
                sla: null,
                stateAfterApproval: null,
                stateAfterRejection: null,
                userId: null,
            },
            description: null,
            id: "approval",
            name: "Aprobación",
            nodeKey: "approval",
            positionX: 120,
            positionY: 0,
            type: "APPROVAL",
        }),
        node({
            configurationJson: {
                defaultRouteLabel: "Bajo",
                description: null,
                logicalOperator: "AND",
                name: "Condición",
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
            name: "Condición",
            nodeKey: "condition",
            positionX: 240,
            positionY: 0,
            type: "CONDITION",
        }),
        node({
            configurationJson: {
                completionMessage: null,
                description: null,
                finalResult: "APPROVED",
                finalWorkflowStatus: "COMPLETED",
                name: "Fin",
                nodeType: "END",
                notifyParticipants: false,
                relatedRecordTargetState: null,
                schemaVersion: 1,
            },
            description: null,
            id: "end",
            name: "Fin",
            nodeKey: "end",
            positionX: 360,
            positionY: 0,
            type: "END",
        }),
    ],
    transitions: [
        {
            id: "start-condition",
            priority: 0,
            sourceNodeId: "start",
            targetNodeId: "condition",
            transitionType: "DEFAULT",
        },
        {
            id: "condition-approval",
            priority: 0,
            sourceNodeId: "condition",
            targetNodeId: "approval",
            transitionType: "CONDITION",
        },
        {
            id: "condition-end",
            priority: 1,
            sourceNodeId: "condition",
            targetNodeId: "end",
            transitionType: "DEFAULT",
        },
        {
            id: "approval-end",
            priority: 0,
            sourceNodeId: "approval",
            targetNodeId: "end",
            transitionType: "APPROVE",
        },
    ],
});
const pinned = {
    ...graph,
    definitionId: "definition-1",
    definitionName: "Prueba",
    processType: "SPECIAL_REQUEST",
    versionId: "version-1",
    versionNumber: 1,
    versionStatus: "PUBLISHED",
};
const context = (riskLevel) => buildWorkflowRuntimeContext({
    actorUserId: "user-1",
    context: { ...(riskLevel ? { riskLevel } : {}) },
    processType: "SPECIAL_REQUEST",
});
test("runtime keeps registered fields separate from custom context", () => {
    const runtimeContext = buildWorkflowRuntimeContext({
        actorUserId: "user-1",
        context: { custom: { recordOwnerUserId: "user-2", secret: "not-a-rule" } },
        processType: "SPECIAL_REQUEST",
    });
    assert.equal(runtimeContext.requesterUserId, "user-1");
    assert.equal(runtimeContext.custom.recordOwnerUserId, "user-2");
    assert.equal(runtimeContext.custom.secret, "not-a-rule");
    assert.equal(runtimeContext.riskLevel, undefined);
});
test("runtime selects condition routes in priority order and uses fallback", () => {
    const condition = pinned.nodes.find((candidate) => candidate.nodeKey === "condition");
    assert.ok(condition);
    const high = selectRuntimeTransition({
        context: context("HIGH"),
        graph: pinned,
        node: condition,
        now: new Date("2026-08-10T12:00:00.000Z"),
    });
    assert.equal(high.selected?.targetNodeId, "approval");
    assert.equal(high.conditionEvaluations[0]?.evaluation.matched, true);
    const low = selectRuntimeTransition({
        context: context("LOW"),
        graph: pinned,
        node: condition,
        now: new Date("2026-08-10T12:00:00.000Z"),
    });
    assert.equal(low.selected?.targetNodeId, "end");
    assert.equal(low.usedFallback, true);
});
test("runtime requires an explicit human decision and maps the controlled route", () => {
    const approval = pinned.nodes.find((candidate) => candidate.nodeKey === "approval");
    assert.ok(approval);
    const missing = selectRuntimeTransition({
        context: context("HIGH"),
        graph: pinned,
        node: approval,
        now: new Date("2026-08-10T12:00:00.000Z"),
    });
    assert.equal(missing.selected, null);
    assert.equal(missing.errorCode, "WORKFLOW_TRANSITION_NOT_FOUND");
    const approved = selectRuntimeTransition({
        context: context("HIGH"),
        decision: "APPROVE",
        graph: pinned,
        node: approval,
        now: new Date("2026-08-10T12:00:00.000Z"),
    });
    assert.equal(approved.selected?.targetNodeId, "end");
});
//# sourceMappingURL=workflow-runtime.test.js.map