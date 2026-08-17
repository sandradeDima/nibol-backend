import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorkflowDeadline, calculateWorkflowThresholdAt, getWorkflowSlaState, } from "./workflow-sla.js";
const startedAt = new Date("2026-08-07T12:00:00.000Z"); // Friday
test("calcula minutos, horas y días calendario en UTC", () => {
    assert.equal(calculateWorkflowDeadline({
        duration: 30,
        startedAt,
        unit: "MINUTES",
    }).toISOString(), "2026-08-07T12:30:00.000Z");
    assert.equal(calculateWorkflowDeadline({
        duration: 2,
        startedAt,
        unit: "HOURS",
    }).toISOString(), "2026-08-07T14:00:00.000Z");
    assert.equal(calculateWorkflowDeadline({
        duration: 1,
        startedAt,
        unit: "CALENDAR_DAYS",
    }).toISOString(), "2026-08-08T12:00:00.000Z");
});
test("los días hábiles saltan sábado y domingo", () => {
    assert.equal(calculateWorkflowDeadline({
        duration: 1,
        startedAt,
        unit: "BUSINESS_DAYS",
    }).toISOString(), "2026-08-10T12:00:00.000Z");
    assert.equal(calculateWorkflowDeadline({
        duration: 1,
        startedAt: new Date("2026-08-08T12:00:00.000Z"),
        unit: "BUSINESS_DAYS",
    }).toISOString(), "2026-08-10T12:00:00.000Z");
});
test("rechaza duraciones no positivas y conserva instantes UTC", () => {
    assert.throws(() => calculateWorkflowDeadline({ duration: 0, startedAt, unit: "HOURS" }), /entero positivo/);
    assert.throws(() => calculateWorkflowDeadline({ duration: -1, startedAt, unit: "MINUTES" }), /entero positivo/);
    assert.equal(calculateWorkflowDeadline({
        duration: 1,
        startedAt: new Date("2026-08-07T23:30:00.000-05:00"),
        unit: "HOURS",
    }).toISOString(), "2026-08-08T05:30:00.000Z");
});
test("los umbrales nulos no crean una fecha y el estado SLA es determinista", () => {
    assert.equal(calculateWorkflowThresholdAt({ startedAt, threshold: null, unit: "HOURS" }), null);
    const dueAt = new Date("2026-08-07T14:00:00.000Z");
    assert.equal(getWorkflowSlaState({
        dueAt,
        dueSoonAt: new Date("2026-08-07T15:00:00.000Z"),
        now: new Date("2026-08-07T13:00:00.000Z"),
    }), "DUE_SOON");
    assert.equal(getWorkflowSlaState({ dueAt, now: new Date("2026-08-07T15:00:00.000Z") }), "OVERDUE");
    assert.equal(getWorkflowSlaState({ dueAt: null }), "NO_SLA");
});
//# sourceMappingURL=workflow-sla.test.js.map