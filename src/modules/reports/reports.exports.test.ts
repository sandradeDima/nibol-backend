import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";

import {
  buildExcelWorkbook,
  buildObservationDetailWorkbook,
  buildReportPdf,
  observationDetailHeaders,
} from "./reports.exports.js";

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
  const readEntry = (name: string) => {
    let offset = 0;
    while (workbook.readUInt32LE(offset) === 0x04034b50) {
      const size = workbook.readUInt32LE(offset + 18);
      const start = offset + 30 + workbook.readUInt16LE(offset + 26);
      if (workbook.toString("utf8", offset + 30, start) === name)
        return inflateRawSync(
          workbook.subarray(start, start + size),
        ).toString();
      offset = start + size;
    }
    throw new Error(`Missing ${name}`);
  };
  const summarySheet = readEntry("xl/worksheets/sheet1.xml");
  assert.match(summarySheet, /Estado del plan de acción/);
  assert.match(summarySheet, /No iniciado/);
  assert.doesNotMatch(summarySheet, /<drawing/);
  assert.equal(workbook.includes(Buffer.from("xl/drawings/")), false);

  const pdf = buildReportPdf(input);
  assert.match(pdf.toString("latin1"), /^%PDF-1\.4/);
  assert.match(pdf.toString("latin1"), /Reporte NIBOL/);
  assert.match(pdf.toString("latin1"), /Fecha de corte/);
  assert.match(pdf.toString("latin1"), /17\/09\/2026/);
  assert.match(pdf.toString("latin1"), /Riesgo/);
  assert.match(pdf.toString("latin1"), /0\.843 0\.098 0\.125 rg/);
});

test("el detalle conserva los 24 encabezados agrupados y registra los filtros", () => {
  const values = Array(24).fill("");
  values[0] = "AI-01-2022";
  values[2] = "2026-10-12T00:00:00.000Z";
  values[14] = "Acción filtrada";
  const workbook = buildObservationDetailWorkbook({
    filters: { Área: "Importaciones" },
    generatedAt: "2026-10-12T12:00:00.000Z",
    reportName: "Observaciones",
    rows: [values],
  });
  const read = (name: string) => {
    let offset = 0;
    while (workbook.readUInt32LE(offset) === 0x04034b50) {
      const size = workbook.readUInt32LE(offset + 18);
      const start = offset + 30 + workbook.readUInt16LE(offset + 26);
      if (workbook.toString("utf8", offset + 30, start) === name)
        return inflateRawSync(
          workbook.subarray(start, start + size),
        ).toString();
      offset = start + size;
    }
    throw new Error(`Missing ${name}`);
  };
  const data = read("xl/worksheets/sheet1.xml");
  assert.match(read("xl/workbook.xml"), /name="OBSERVACIONES"/);
  assert.match(data, /mergeCell ref="D1:N1"/);
  assert.match(data, /autoFilter ref="A2:X3"/);
  assert.match(data, /ySplit="2"/);
  assert.match(data, /zoomScale="70"/);
  assert.match(data, /<col min="6" max="6" width="63\.6640625"/);
  assert.match(data, /<c r="A1" s="1"/);
  assert.match(data, /<c r="D1" s="2"/);
  assert.match(data, /<c r="O1" s="3"/);
  assert.match(data, /<c r="V1" s="5"/);
  assert.match(data, /<c r="C3" s="4"><v>/);
  assert.match(data, /<c r="O3" s="6"/);
  const styles = read("xl/styles.xml");
  for (const color of ["FF2F5597", "FFC00000", "FF7030A0", "FF44546A"])
    assert.ok(styles.includes(color), color);
  for (const header of observationDetailHeaders)
    assert.ok(data.includes(header.replaceAll("&", "&amp;")), header);
  assert.match(data, /Acción filtrada/);
  assert.match(read("xl/worksheets/sheet2.xml"), /Importaciones/);
});
