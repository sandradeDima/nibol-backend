import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConditionGroup } from "./workflow-rule-engine.js";
import { evaluateWorkflowRule, validateWorkflowRule, } from "./workflow-rule-operators.js";
const now = new Date("2026-08-04T12:00:00.000Z");
const context = {
    areaId: "area-1",
    daysOverdue: 3,
    dueDate: "2026-08-06",
    evidenceCount: 2,
    hasEvidence: true,
    observationStatus: "OPEN",
    previousDecision: "APPROVED",
    processType: "SPECIAL_REQUEST",
    remediationPlanStatus: "PENDING",
    requestType: "EXTENSION",
    requestedExtensionDays: 5,
    responsibleUserId: "user-1",
    riskLevel: "ALTO",
};
const rule = (field, operator, value) => ({
    conditionId: `${field}-${operator}`,
    field,
    operator,
    value,
});
const matches = (field, operator, value) => evaluateWorkflowRule(rule(field, operator, value), context, { now }).matched;
test("evalúa operadores de igualdad, comparación y texto con tipos controlados", () => {
    assert.equal(matches("riskLevel", "EQUALS", "HIGH"), true);
    assert.equal(matches("riskLevel", "NOT_EQUALS", "LOW"), true);
    assert.equal(matches("evidenceCount", "GREATER_THAN", 1), true);
    assert.equal(matches("evidenceCount", "LESS_THAN", 3), true);
    assert.equal(matches("evidenceCount", "GREATER_THAN_OR_EQUAL", 2), true);
    assert.equal(matches("evidenceCount", "LESS_THAN_OR_EQUAL", 2), true);
    assert.equal(matches("requestType", "CONTAINS", "XTEN"), true);
    assert.equal(matches("requestType", "NOT_CONTAINS", "CANCEL"), true);
});
test("evalúa listas, vacíos y booleanos de forma determinista", () => {
    assert.equal(matches("observationStatus", "IN", ["OPEN", "CLOSED"]), true);
    assert.equal(matches("observationStatus", "NOT_IN", ["CLOSED"]), true);
    assert.equal(matches("hasEvidence", "EQUALS", true), true);
    assert.equal(matches("responsibleUserId", "IS_NOT_EMPTY"), true);
    assert.equal(matches("previousDecision", "IS_EMPTY"), false);
});
test("evalúa vencimiento y ventana de fecha usando el reloj recibido", () => {
    assert.equal(matches("dueDate", "DUE_WITHIN", 2), true);
    assert.equal(evaluateWorkflowRule(rule("dueDate", "IS_OVERDUE"), { ...context, dueDate: "2026-08-03" }, { now }).matched, true);
    assert.equal(matches("dueDate", "DUE_WITHIN", 1), false);
});
test("rechaza campos u operadores incompatibles antes de evaluar", () => {
    assert.match(validateWorkflowRule(rule("riskLevel", "GREATER_THAN", "HIGH")) ?? "", /no es compatible/);
    assert.match(evaluateWorkflowRule(rule("unknownField", "EQUALS", "x"), context, { now })
        .message, /no está soportado/);
});
test("evalúa grupos AND y OR completos en secuencia estable", () => {
    const andResult = evaluateConditionGroup({
        conditions: [
            rule("evidenceCount", "GREATER_THAN", 1),
            rule("riskLevel", "EQUALS", "ALTO"),
        ],
        id: "and-group",
        logicOperator: "AND",
    }, context, { detailed: true, now, shortCircuit: false });
    const orResult = evaluateConditionGroup({
        conditions: [
            rule("riskLevel", "EQUALS", "BAJO"),
            rule("requestType", "EQUALS", "EXTENSION"),
        ],
        id: "or-group",
        logicOperator: "OR",
    }, context, { detailed: true, now, shortCircuit: false });
    assert.equal(andResult.matched, true);
    assert.equal(orResult.matched, true);
    assert.deepEqual(andResult.results.map((result) => result.conditionId), ["evidenceCount-GREATER_THAN", "riskLevel-EQUALS"]);
    assert.equal(andResult.results.length, 2);
    assert.equal(orResult.results.length, 2);
});
//# sourceMappingURL=workflow-rule-engine.test.js.map