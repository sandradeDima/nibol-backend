import assert from "node:assert/strict";
import test from "node:test";

import {
  getActionPlanDeadlineStatus,
  getEffectiveActionPlanDueDate,
  getOfficialActionPlanProgress,
  getObservationStatusGroup,
  getRiskGroupLabel,
  isApprovedDeadlineExtension,
  isObservationDueSoon,
  isObservationOverdue,
} from "./reporting-definitions.js";

const now = new Date("2026-08-12T12:00:00.000Z");

test("clasifica vencimientos sin contar estados finales como atrasados", () => {
  assert.equal(
    isObservationOverdue(
      new Date("2026-08-11T12:00:00.000Z"),
      {
        isFinal: false,
        key: "INICIADO",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isObservationOverdue(
      new Date("2026-08-11T12:00:00.000Z"),
      {
        isFinal: true,
        key: "CONCLUIDO",
      },
      now,
    ),
    false,
  );
  assert.equal(
    isObservationDueSoon(
      new Date("2026-08-15T12:00:00.000Z"),
      {
        isFinal: false,
        key: "INICIADO",
      },
      7,
      now,
    ),
    true,
  );
});

test("asigna grupos y etiquetas de negocio deterministas", () => {
  assert.equal(
    getObservationStatusGroup(
      { isFinal: false, key: "CON_AVANCE", name: "Con avance" },
      false,
    ),
    "IN_REVIEW",
  );
  assert.equal(
    getObservationStatusGroup(
      { isFinal: false, key: "INICIADO", name: "Iniciado" },
      true,
    ),
    "OVERDUE",
  );
  assert.equal(getRiskGroupLabel("ALTO", "Alto"), "Alto");
  assert.equal(getRiskGroupLabel("HIGH", "High"), "Alto");
});

test("mantiene el estado oficial separado del avance reportado", () => {
  assert.deepEqual(
    ["NOT_STARTED", "STARTED", "WITH_PROGRESS", "CONCLUDED"].map(
      getOfficialActionPlanProgress,
    ),
    [
      { code: "NI", key: "NOT_STARTED", label: "No iniciado", percent: 0 },
      { code: "I", key: "STARTED", label: "Iniciado", percent: 20 },
      { code: "CA", key: "WITH_PROGRESS", label: "Con avance", percent: 60 },
      { code: "CO", key: "CONCLUDED", label: "Concluido", percent: 100 },
    ],
  );
});

test("aplica la fecha efectiva aprobada y conserva la fecha para hoy como vigente", () => {
  const plan = {
    currentDueDate: new Date("2026-09-01T00:00:00.000Z"),
    status: "WITH_PROGRESS",
    deadlineExtensionRequests: [
      {
        finalApprovedAt: new Date("2026-09-01T00:00:00.000Z"),
        proposedDueDate: new Date("2026-09-09T00:00:00.000Z"),
        status: "MANAGER_APPROVED",
      },
    ],
  };
  assert.equal(
    getEffectiveActionPlanDueDate(plan).toISOString(),
    "2026-09-09T00:00:00.000Z",
  );
  assert.equal(
    getActionPlanDeadlineStatus(
      plan,
      new Date("2026-09-08T12:00:00.000Z"),
      "UTC",
    ),
    "VIGENTE",
  );
  assert.equal(
    getActionPlanDeadlineStatus(
      plan,
      new Date("2026-09-09T23:59:59.000Z"),
      "UTC",
    ),
    "VIGENTE",
  );
  assert.equal(
    getActionPlanDeadlineStatus(
      plan,
      new Date("2026-09-10T12:00:00.000Z"),
      "UTC",
    ),
    "VENCIDO",
  );
  assert.equal(
    isApprovedDeadlineExtension({ status: "MANAGER_APPROVED" }),
    true,
  );
  assert.equal(isApprovedDeadlineExtension({ status: "DRAFT" }), false);
  assert.equal(isApprovedDeadlineExtension({ status: "REJECTED" }), false);
  assert.equal(
    getEffectiveActionPlanDueDate({
      currentDueDate: new Date("2026-09-01T00:00:00.000Z"),
      deadlineExtensionRequests: [
        {
          finalApprovedAt: null,
          proposedDueDate: new Date("2026-09-20T00:00:00.000Z"),
          status: "REJECTED",
        },
      ],
    }).toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    getActionPlanDeadlineStatus(
      {
        ...plan,
        deadlineExtensionRequests: [
          { ...plan.deadlineExtensionRequests[0]!, status: "DRAFT" },
        ],
      },
      new Date("2026-09-09T12:00:00.000Z"),
      "UTC",
    ),
    "VENCIDO",
  );
  assert.equal(
    getActionPlanDeadlineStatus(
      { ...plan, status: "CONCLUDED" },
      new Date("2026-10-01T12:00:00.000Z"),
      "UTC",
    ),
    "VIGENTE",
  );
});
