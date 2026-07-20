import assert from "node:assert/strict";
import test from "node:test";
import { buildNotificationDedupeKey, getDeadlineState, } from "./deadline-monitor.policy.js";
const now = new Date("2026-07-20T00:00:00.000Z");
test("detecta una fecha próxima dentro de la ventana configurada", () => {
    assert.equal(getDeadlineState({
        dueDate: new Date("2026-07-25T00:00:00.000Z"),
        finalStatus: false,
        now,
        reminderDaysBeforeDue: 7,
    }), "DUE_SOON");
});
test("detecta vencidos y excluye estados finales", () => {
    assert.equal(getDeadlineState({
        dueDate: new Date("2026-07-19T00:00:00.000Z"),
        finalStatus: false,
        now,
        reminderDaysBeforeDue: 7,
    }), "OVERDUE");
    assert.equal(getDeadlineState({
        dueDate: new Date("2026-07-19T00:00:00.000Z"),
        finalStatus: true,
        now,
        reminderDaysBeforeDue: 7,
    }), "NOT_ACTIONABLE");
});
test("una ampliación aprobada evita un falso vencimiento", () => {
    assert.equal(getDeadlineState({
        approvedExtensionDueDate: new Date("2026-07-25T00:00:00.000Z"),
        dueDate: new Date("2026-07-19T00:00:00.000Z"),
        finalStatus: false,
        now,
        reminderDaysBeforeDue: 7,
    }), "DUE_SOON");
});
test("la clave de deduplicación es estable y cambia por ciclo o canal", () => {
    const base = {
        cycle: "due-0",
        entityId: "observation-1",
        eventType: "OBSERVATION_DUE_SOON",
        recipientUserId: "user-1",
    };
    assert.equal(buildNotificationDedupeKey({ ...base, channel: "IN_APP" }), buildNotificationDedupeKey({ ...base, channel: "IN_APP" }));
    assert.notEqual(buildNotificationDedupeKey({ ...base, channel: "IN_APP" }), buildNotificationDedupeKey({ ...base, channel: "EMAIL" }));
    assert.notEqual(buildNotificationDedupeKey({ ...base, channel: "IN_APP", cycle: "due-1" }), buildNotificationDedupeKey({ ...base, channel: "IN_APP" }));
});
//# sourceMappingURL=deadline-monitor.policy.test.js.map