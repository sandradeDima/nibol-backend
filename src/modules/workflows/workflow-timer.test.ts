import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowNodeConfiguration } from "./workflows.validators.js";
import { calculateWorkflowTimerSchedule } from "./workflow-timer.service.js";

const approvalWithSla = (
  overrides: Record<string, unknown> = {},
): WorkflowNodeConfiguration => {
  const baseSla = {
    alternateTargetNodeKey: null,
    duration: 48,
    escalationAreaId: null,
    escalationEnabled: true,
    escalationMode: "NOTIFY_ONLY",
    escalationRoleId: null,
    escalationStrategy: "AREA_MANAGER",
    escalationThreshold: 60,
    escalationUserId: null,
    reminderEnabled: true,
    reminderThreshold: 24,
    unit: "HOURS",
  };
  const slaOverride = overrides.sla;
  return {
    allowedActions: ["APPROVE", "REJECT", "OBSERVE", "REQUEST_CORRECTION"],
    areaId: null,
    assignmentStrategy: "FIXED_USER",
    commentRequired: false,
    electronicSignature: false,
    evidenceRequired: false,
    fallbackRoleId: null,
    fallbackStrategy: "STOP",
    fallbackUserId: null,
    fieldReference: null,
    name: "Auditoría",
    nodeType: "APPROVAL",
    roleId: null,
    routeLabelOnApproval: null,
    routeLabelOnRejection: null,
    schemaVersion: 1,
    sla:
      slaOverride === null
        ? null
        : {
            ...baseSla,
            ...(slaOverride as Record<string, unknown> | undefined),
          },
    stateAfterApproval: null,
    stateAfterRejection: null,
    userId: "user-1",
  } as WorkflowNodeConfiguration;
};

test("calcula el calendario de timers de una tarea con SLA", () => {
  const startedAt = new Date("2026-08-10T10:00:00.000Z");
  const schedule = calculateWorkflowTimerSchedule({
    configuration: approvalWithSla(),
    entrySequence: 2,
    sourceNodeId: "node-audit",
    startedAt,
  });

  assert.equal(schedule.dueAt?.toISOString(), "2026-08-12T10:00:00.000Z");
  assert.deepEqual(
    schedule.timers.map((timer) => [
      timer.timerType,
      timer.executeAt.toISOString(),
    ]),
    [
      ["REMINDER", "2026-08-11T10:00:00.000Z"],
      ["DUE", "2026-08-12T10:00:00.000Z"],
      ["ESCALATION", "2026-08-12T22:00:00.000Z"],
    ],
  );
  assert.equal(schedule.timers[0]?.configuration.entrySequence, 2);
  assert.equal(schedule.timers[0]?.configuration.sourceNodeId, undefined);
});

test("una tarea sin SLA no crea timers y los días hábiles conservan la política UTC", () => {
  const noSla = approvalWithSla({ sla: null });
  assert.deepEqual(
    calculateWorkflowTimerSchedule({
      configuration: noSla,
      entrySequence: 1,
      sourceNodeId: "node-audit",
      startedAt: new Date("2026-08-07T10:00:00.000Z"),
    }),
    { dueAt: null, timers: [] },
  );

  const businessDay = approvalWithSla({
    sla: {
      alternateTargetNodeKey: null,
      duration: 1,
      escalationAreaId: null,
      escalationEnabled: false,
      escalationMode: "NOTIFY_ONLY",
      escalationRoleId: null,
      escalationStrategy: "AREA_MANAGER",
      escalationThreshold: null,
      escalationUserId: null,
      reminderEnabled: false,
      reminderThreshold: null,
      unit: "BUSINESS_DAYS",
    },
  });
  assert.equal(
    calculateWorkflowTimerSchedule({
      configuration: businessDay,
      entrySequence: 1,
      sourceNodeId: "node-audit",
      startedAt: new Date("2026-08-07T10:00:00.000Z"),
    }).dueAt?.toISOString(),
    "2026-08-10T10:00:00.000Z",
  );
});
