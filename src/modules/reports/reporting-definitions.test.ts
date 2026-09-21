import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationSummary } from "../../services/authorization-service.js";
import {
  getActionPlanDeadlineStatus,
  getEffectiveActionPlanDueDate,
  getOfficialActionPlanProgress,
  getObservationStatusGroup,
  getRiskGroupLabel,
  isApprovedDeadlineExtension,
  isObservationDueSoon,
  isObservationOverdue,
  reportDeadlineStatusOptions,
} from "./reporting-definitions.js";
import { buildActionPlanWhere } from "./reports.service.js";
import { reportFiltersSchema } from "./reports.validators.js";

const scopedExecutor: AuthorizationSummary = {
  dataScope: "ASSIGNED",
  isAdmin: false,
  permissions: ["reports.view"],
  roleCode: "EXECUTOR",
  roleName: "Ejecutor",
  roles: ["EXECUTOR"],
  userId: "user-1",
};

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

test("el corte incluye altas del día y excluye altas posteriores", () => {
  const where = buildActionPlanWhere(
    { cutoffDate: "2026-09-17" } as never,
    scopedExecutor,
    new Date("2030-01-01T12:00:00.000Z"),
    "America/La_Paz",
  );
  const serialized = JSON.stringify(where);
  assert.equal(serialized.match(/2026-09-18T04:00:00.000Z/g)?.length, 2);
  assert.doesNotMatch(serialized, /2030-01-01/);
});

test("el estado de vencimiento usa la fecha de corte y no la fecha actual", () => {
  const where = buildActionPlanWhere(
    { cutoffDate: "2026-08-12", deadlineStatus: "VENCIDO" } as never,
    scopedExecutor,
    new Date("2030-01-01T12:00:00.000Z"),
    "UTC",
  );
  const serialized = JSON.stringify(where);
  assert.match(serialized, /2026-08-12T00:00:00.000Z/);
  assert.doesNotMatch(serialized, /2030-01-01/);
});

test("solo pendientes filtra por estado de observación y no por estado del plan", () => {
  const serialized = JSON.stringify(
    buildActionPlanWhere(
      { activeOnly: true } as never,
      scopedExecutor,
      now,
      "UTC",
    ),
  );
  assert.match(serialized, /"isFinal":false/);
  assert.doesNotMatch(serialized, /"status":\{"not":"CONCLUDED"\}/);
});

test("estado global separa observaciones pendientes y cerradas", () => {
  const pending = JSON.stringify(
    buildActionPlanWhere(
      { globalStatus: "PENDING" } as never,
      scopedExecutor,
      now,
      "UTC",
    ),
  );
  const closed = JSON.stringify(
    buildActionPlanWhere(
      { globalStatus: "CLOSED" } as never,
      scopedExecutor,
      now,
      "UTC",
    ),
  );

  assert.match(pending, /"isFinal":false/);
  assert.doesNotMatch(pending, /"isFinal":true/);
  assert.match(closed, /"isFinal":true/);
  assert.doesNotMatch(closed, /"isFinal":false/);
  assert.equal(
    reportFiltersSchema.parse({ globalStatus: "CLOSED" }).globalStatus,
    "CLOSED",
  );
});

test("combina estados de observación y plazo con OR dentro de cada dimensión", () => {
  const serialized = JSON.stringify(
    buildActionPlanWhere(
      {
        cutoffDate: "2026-08-12",
        deadlineStatuses: ["VENCIDO"],
        observationStatusIds: ["status-1", "status-2"],
      } as never,
      scopedExecutor,
      now,
      "UTC",
    ),
  );
  assert.match(serialized, /"statusId":\{"in":\["status-1","status-2"\]\}/);
  assert.match(serialized, /"status":\{"not":"CONCLUDED"\}/);
  assert.match(serialized, /"currentDueDate":\{"lt":"2026-08-12/);
});

test("seleccionar ambos estados de plazo no restringe el resultado", () => {
  const serialized = JSON.stringify(
    buildActionPlanWhere(
      {
        deadlineStatuses: ["VIGENTE", "VENCIDO"],
      } as never,
      scopedExecutor,
      now,
      "UTC",
    ),
  );
  assert.doesNotMatch(serialized, /"status":\{"not":"CONCLUDED"\}/);
  assert.deepEqual(reportDeadlineStatusOptions, [
    { key: "VIGENTE", label: "Vigente" },
    { key: "VENCIDO", label: "Vencido" },
  ]);
});

test("los filtros multiselección aceptan CSV y conservan el estado Todos vacío", () => {
  const parsed = reportFiltersSchema.parse({
    deadlineStatuses: "VIGENTE,VENCIDO",
    observationStatusIds:
      "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222",
  });
  assert.deepEqual(parsed.deadlineStatuses, ["VIGENTE", "VENCIDO"]);
  assert.deepEqual(parsed.observationStatusIds, [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
  assert.equal(reportFiltersSchema.parse({}).deadlineStatuses, undefined);
  assert.equal(reportFiltersSchema.parse({}).observationStatusIds, undefined);
});
