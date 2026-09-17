import assert from "node:assert/strict";
import test from "node:test";

import { buildExcelWorkbook, buildReportPdf } from "./reports.exports.js";

const charts = {
  areaDistribution: [{ key: "area-1", label: "Finanzas", value: 2 }],
  areaPerformance: [
    { compliancePercent: 100, key: "area-1", label: "Finanzas", value: 2 },
  ],
  areaResponsibleDistribution: [
    { key: "user-1", label: "Responsable", value: 2 },
  ],
  currentVsOverdue: [
    { key: "VIGENTE", label: "Vigentes", value: 1 },
    { key: "VENCIDO", label: "Vencidos", value: 1 },
  ],
  deadlineDistribution: [
    { key: "VIGENTE", label: "Vigentes", value: 1 },
    { key: "VENCIDO", label: "Vencidos", value: 1 },
  ],
  executorDistribution: [{ key: "user-2", label: "Ejecutor", value: 2 }],
  processOwnerDistribution: [{ key: "user-3", label: "Dueño", value: 2 }],
  progressDistribution: [
    { key: "NOT_STARTED", label: "No iniciado", value: 1 },
    { key: "CONCLUDED", label: "Concluido", value: 1 },
  ],
  reprogrammedDistribution: [{ key: "NO", label: "No", value: 2 }],
  riskDistribution: [
    { colorToken: "high", key: "HIGH", label: "Alto", value: 1 },
  ],
  statusDistribution: [],
  trend: [],
};

const summary = {
  averageResolutionDays: 4,
  closed: 1,
  closedObservations: 1,
  compliancePercent: 100,
  conAvance: 0,
  concluido: 1,
  dueSoon: 0,
  iniciado: 0,
  inProcess: 0,
  noIniciado: 1,
  open: 1,
  overdue: 1,
  pendingObservations: 1,
  predominantRisk: { count: 1, key: "HIGH", label: "Alto" },
  reprogramados: 0,
  total: 2,
  totalObservations: 2,
  vencidos: 1,
  vigentes: 1,
};

const input = {
  charts,
  columns: ["Observación", "Estado", "Fecha"],
  filters: {
    Área: "Finanzas",
    "Fecha de corte": "17/09/2026",
    Período: "2026-09-01 – 2026-09-17",
  },
  generatedAt: "2026-09-17T12:00:00.000Z",
  reportName: "Reporte NIBOL",
  rows: [
    {
      Estado: "Concluido",
      Fecha: "2026-09-17T00:00:00.000Z",
      Observación: "OBS-001",
    },
  ],
  summary,
};

test("genera un XLSX real y un PDF legible con el resumen del corte", () => {
  const workbook = buildExcelWorkbook(input);
  assert.equal(workbook.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(workbook.length > 1_000);

  const pdf = buildReportPdf(input);
  assert.match(pdf.toString("latin1"), /^%PDF-1\.4/);
  assert.match(pdf.toString("latin1"), /Reporte NIBOL/);
  assert.match(pdf.toString("latin1"), /Fecha de corte/);
  assert.match(pdf.toString("latin1"), /17\/09\/2026/);
  assert.match(pdf.toString("latin1"), /Riesgo/);
});
