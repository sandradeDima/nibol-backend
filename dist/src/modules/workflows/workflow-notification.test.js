import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkflowNotificationDedupeKey, } from "./workflow-notification.service.js";
const event = (overrides = {}) => ({
    eventType: "workflow.timer.reminder_processed",
    instanceId: "instance-1",
    message: "Recordatorio",
    recipients: [],
    title: "Recordatorio",
    taskId: "task-1",
    visitSequence: 2,
    ...overrides,
});
test("las claves de notificación son estables y separan canal y visita", () => {
    const base = buildWorkflowNotificationDedupeKey(event(), "user-1", "EMAIL");
    assert.equal(base, buildWorkflowNotificationDedupeKey(event(), "user-1", "EMAIL"));
    assert.notEqual(base, buildWorkflowNotificationDedupeKey(event(), "user-1", "IN_APP"));
    assert.notEqual(base, buildWorkflowNotificationDedupeKey(event({ visitSequence: 3 }), "user-1", "EMAIL"));
    assert.notEqual(base, buildWorkflowNotificationDedupeKey(event({ taskId: "task-1:timer-2" }), "user-1", "EMAIL"));
});
//# sourceMappingURL=workflow-notification.test.js.map