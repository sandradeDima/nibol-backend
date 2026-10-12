import assert from "node:assert/strict";
import test from "node:test";

import { mapObservationDetailRows } from "./reports.service.js";

test("el detalle muestra solo los planes del área y estado filtrados", () => {
  const area = (id: string, name: string) => ({
    area: { id, name },
    areaResponsible: { id: `responsible-${id}`, name: `Responsable ${name}` },
    processOwner: { id: `owner-${id}`, name: `Dueño ${name}` },
  });
  const plan = (id: string, name: string, status: string) => ({
    comments: [{ body: `Comentario ${name}` }],
    currentDueDate: new Date("2026-09-01T00:00:00.000Z"),
    deadlineExtensionRequests: [],
    description: `Plan ${name}`,
    observationArea: area(id, name),
    responsibleUser: { id: `executor-${id}`, name: `Ejecutor ${name}` },
    status,
  });
  const observation = {
    actionPlans: [
      plan("a", "Compras", "WITH_PROGRESS"),
      plan("b", "Ventas", "CONCLUDED"),
    ],
    areaAssignments: [area("a", "Compras"), area("b", "Ventas")],
    auditRecommendation: "Corregir",
    auditReport: {
      reportDate: new Date("2026-01-01T00:00:00.000Z"),
      reportNumber: "AI-01",
      title: "Informe",
    },
    currentDueDate: new Date("2026-09-01T00:00:00.000Z"),
    description: "Detalle",
    mainObservation: { name: "Principal" },
    observationNumber: 2,
    riskLevel: { name: "Alto" },
    risks: [{ risk: { name: "Riesgo uno" } }],
    status: { name: "Pendiente" },
    title: "Observación",
  };
  const rows = mapObservationDetailRows(
    [observation],
    { areaId: "a", deadlineStatus: "VENCIDO" } as never,
    new Date("2026-10-12T12:00:00.000Z"),
    "America/La_Paz",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.["Plan de acción"], "Plan Compras");
  assert.equal(rows[0]?.["Área"], "Compras");
  assert.equal(rows[0]?.["Estado según plazo"], "Vencido");
  assert.equal(rows[0]?.["Comentario 1"], "Comentario Compras");
  assert.equal(rows[0]?.["Número de observación"], "AI-01-02");
  assert.deepEqual(
    mapObservationDetailRows(
      [observation],
      { areaId: "b", deadlineStatus: "VENCIDO" } as never,
      new Date("2026-10-12T12:00:00.000Z"),
      "America/La_Paz",
    ),
    [],
  );
  assert.equal(
    mapObservationDetailRows(
      [{ ...observation, actionPlans: [] }],
      { areaId: "b" } as never,
      new Date("2026-10-12T12:00:00.000Z"),
      "America/La_Paz",
    )[0]?.["Área"],
    "Ventas",
  );
});
