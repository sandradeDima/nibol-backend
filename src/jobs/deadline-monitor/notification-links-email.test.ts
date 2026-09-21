import assert from "node:assert/strict";
import test from "node:test";

import { deadlineReminderEmailTemplate } from "../../emails/templates/deadline-reminder-email.js";
import { DEADLINE_REMINDER_ROLES } from "./deadline-reminder.constants.js";
import { resolveNotificationTarget } from "../../utils/notification-links.js";

test("resuelve el registro exacto de cada evento notificable", () => {
  assert.equal(
    resolveNotificationTarget({
      entityId: "obs-1",
      entityType: "OBSERVATION",
      eventType: "OBSERVATION_ASSIGNMENT",
    }),
    "/observaciones/obs-1?tab=summary",
  );
  assert.equal(
    resolveNotificationTarget({
      entityId: "plan-1",
      entityType: "actionPlan",
    }),
    "/planes-accion/plan-1",
  );
  assert.equal(
    resolveNotificationTarget({
      actionPlanId: "plan-1",
      advanceId: "advance-1",
      entityId: "advance-1",
      entityType: "PROGRESS_EVALUATION",
      observationId: "obs-1",
    }),
    "/observaciones/obs-1?tab=plans&planId=plan-1&advanceId=advance-1",
  );
  assert.equal(
    resolveNotificationTarget({
      entityId: "extension-1",
      entityType: "DEADLINE_EXTENSION_REQUEST",
    }),
    "/ampliaciones-plazo/extension-1",
  );
  assert.equal(
    resolveNotificationTarget({
      entityId: "task-1",
      entityType: "workflow_task",
    }),
    "/aprobaciones/flujos/task-1",
  );
  assert.equal(
    resolveNotificationTarget({ entityType: "DEADLINE_REMINDER" }),
    "/planes-accion?filter.status=NOT_STARTED,STARTED,WITH_PROGRESS",
  );
});

test("el digest muestra el total, colores canónicos y solo el top 8", () => {
  const sample = deadlineReminderEmailTemplate.sampleVariables;
  const plans = Array.from({ length: 10 }, (_, index) => ({
    ...sample.plans[0]!,
    observation: `OBS-${index}`,
    plan: `Plan ${index}`,
    risk: index % 3 === 0 ? "Alto" : index % 3 === 1 ? "Medio" : "Bajo",
    riskColorToken:
      index % 3 === 0 ? "high" : index % 3 === 1 ? "medium" : "low",
  }));
  const rendered = deadlineReminderEmailTemplate.render({
    brand: {
      appName: "NIBOL Bolivia",
      logoUrl: null,
      primaryColor: "#07142d",
      senderEmail: "no-reply@nibol.test",
      senderName: "NIBOL",
      supportEmail: "support@nibol.test",
    },
    variables: { ...sample, plans },
  });

  assert.match(rendered.html, /Total pendientes: 10/);
  assert.match(rendered.html, /#D92D20/);
  assert.match(rendered.html, /#DC6803/);
  assert.match(rendered.html, /#027A48/);
  assert.match(rendered.html, /OBS-7/);
  assert.doesNotMatch(rendered.html, /OBS-8/);
  assert.match(rendered.html, /Ver pendientes en NIBOL/);
  assert.match(rendered.subject, /^NIBOL ·/);
});

test("el Jefe Auditor conserva visibilidad global sin recibir el digest operativo", () => {
  assert.equal(
    (DEADLINE_REMINDER_ROLES as readonly string[]).includes("AUDIT_CHIEF"),
    false,
  );
});
