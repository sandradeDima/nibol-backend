import assert from "node:assert/strict";
import test from "node:test";
import { buildDeadlineExtensionOutcomeNotification, buildWorkflowNotificationDedupeKey, } from "./workflow-notification.service.js";
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
test("la notificación de ampliación aprobada coincide con el formato de la bandeja", () => {
    assert.deepEqual(buildDeadlineExtensionOutcomeNotification({
        actionPlanTitle: "Prueba 17",
        approved: true,
        entityId: "extension-1",
        observationReference: "AI-02-2027 / OBS-022",
    }), {
        eventType: "EXTENSION_APPROVED",
        message: "La solicitud de ampliación de plazo del plan de acción “Prueba 17” (AI-02-2027 / OBS-022) fue aprobada.",
        priority: "NORMAL",
        targetUrl: "/ampliaciones-plazo?extensionId=extension-1",
        title: "Ampliación de plazo aprobada",
        type: "success",
    });
});
test("la notificación de ampliación rechazada usa alerta y el enlace a la solicitud", () => {
    assert.deepEqual(buildDeadlineExtensionOutcomeNotification({
        actionPlanTitle: "Prueba 17",
        approved: false,
        entityId: "extension-1",
        observationReference: "AI-02-2027 / OBS-022",
    }), {
        eventType: "EXTENSION_REJECTED",
        message: "La solicitud de ampliación de plazo del plan de acción “Prueba 17” (AI-02-2027 / OBS-022) fue rechazada.",
        priority: "HIGH",
        targetUrl: "/ampliaciones-plazo?extensionId=extension-1",
        title: "Ampliación de plazo rechazada",
        type: "warning",
    });
});
//# sourceMappingURL=workflow-notification.test.js.map