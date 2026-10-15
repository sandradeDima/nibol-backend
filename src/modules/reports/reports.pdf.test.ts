import assert from "node:assert/strict";
import test from "node:test";

import type {
  ReportDashboardData,
  ReportPreviewData,
} from "./reports.types.js";
import { buildReportPdf, renderReportHtml } from "./reports.pdf.js";

const preview = {
  columns: ["Observación", "Plan", "Estado"],
  filters: { Área: "Todas" },
  generatedAt: "2026-10-14T12:00:00.000Z",
  reportName: "Planes de acción NIBOL",
  reportType: "ACTION_PLANS",
  rows: [
    { Observación: "OBS-001", Plan: "Corregir hallazgo", Estado: "Iniciado" },
  ],
  summary: { compliancePercent: 50 },
  total: 1,
} as unknown as ReportPreviewData;

const item = (key: string, label: string, value: number) => ({
  key,
  label,
  value,
});
const dashboard = {
  charts: {
    areaDistribution: [item("area", "Sistemas", 1)],
    areaResponsibleDistribution: [],
    deadlineDistribution: [item("VIGENTE", "Vigente", 1)],
    executorDistribution: [],
    processOwnerDistribution: [],
    progressDistribution: [item("STARTED", "Iniciado", 1)],
    reprogrammedDistribution: [],
    riskDistribution: [item("HIGH", "Alto", 1)],
  },
  generatedAt: preview.generatedAt,
  insights: ["Un plan requiere seguimiento."],
  summary: {
    closedObservations: 0,
    compliancePercent: 50,
    conAvance: 0,
    concluido: 0,
    iniciado: 1,
    noIniciado: 0,
    pendingObservations: 1,
    reprogramados: 0,
    total: 1,
    totalObservations: 1,
    vencidos: 0,
    vigentes: 1,
  },
} as unknown as ReportDashboardData;

test("el PDF usa donuts, barras y colores del sitio sin perder las filas", async () => {
  const input = {
    dashboard,
    filters: { Área: "Todas" },
    preview,
    reportName: preview.reportName,
    staticDashboard: {
      ...dashboard,
      summary: { ...dashboard.summary, total: 99, totalObservations: 88 },
    },
    view: "REPORTS" as const,
  };
  const html = renderReportHtml(input);
  assert.match(html, /conic-gradient\(#D71920 0% 100%\)/);
  assert.match(html, /background:#1D4ED8/);
  assert.match(html, /Corregir hallazgo/);
  assert.match(html, /Distribución por estado del plan de acción/);
  assert.match(html, /<strong>99<\/strong>/);
  assert.match(html, /<strong>88<\/strong>/);
  const pdf = await buildReportPdf(input);
  assert.match(pdf.toString("latin1", 0, 8), /^%PDF-/);
  assert.ok(pdf.length > 5_000);
});

test("los valores del reporte se escapan antes de llegar al navegador", () => {
  const html = renderReportHtml({
    filters: {},
    preview: {
      ...preview,
      rows: [{ Observación: "<script>alert(1)</script>" }],
    },
    reportName: "<Informe>",
    view: "GENERATOR",
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;Informe&gt;/);
});

test("el generador conserva los encabezados de observaciones y todas las filas", () => {
  const columns = Array.from(
    { length: 24 },
    (_, index) => `Columna ${index + 1}`,
  );
  const rows = Array.from({ length: 27 }, (_, index) =>
    Object.fromEntries(columns.map((column) => [column, `Valor ${index + 1}`])),
  );
  const html = renderReportHtml({
    filters: {},
    preview: {
      ...preview,
      columns,
      reportType: "OBSERVATIONS",
      rows,
      total: rows.length,
    },
    reportName: "Observaciones",
    view: "GENERATOR",
  });
  assert.match(html, /Comentario plan de acción/);
  assert.match(html, /background:#2F5597/);
  assert.match(html, /background:#C00000/);
  assert.match(html, /Valor 27/);
  assert.match(html, /21-27 de 27/);
});

test("auditoría conserva el historial y muestra todas las páginas de datos", () => {
  const html = renderReportHtml({
    audit: {
      columns: ["Fecha", "Observación", "Acción"],
      generatedAt: preview.generatedAt,
      rows: Array.from({ length: 21 }, (_, index) => ({
        Acción: `Cambio ${index + 1}`,
        Fecha: preview.generatedAt,
        Observación: "OBS-001",
      })),
      summary: { total: 21 },
      template: "HISTORY",
      timeline: [
        {
          actor: "Auditoría",
          area: "Sistemas",
          date: preview.generatedAt,
          description: "Cambio aprobado",
          result: "Aprobado",
          title: "Aprobación",
        },
      ],
    },
    filters: {},
    reportName: "Historial de observación",
    view: "AUDIT",
  });
  assert.match(html, /Línea de tiempo/);
  assert.match(html, /Cambio 21/);
  assert.match(html, /21-21 de 21/);
});

test("el tablero conserva donuts, avances, tendencia y operación", () => {
  const html = renderReportHtml({
    dashboard: {
      ...dashboard,
      charts: {
        ...dashboard.charts,
        statusDistribution: [item("OPEN", "Abierta", 1)],
        topOverdueAreas: [item("area", "Sistemas", 1)],
        topResponsibleWorkload: [item("user", "María", 1)],
        trend: [{ closed: 0, created: 1, label: "oct", monthKey: "2026-10" }],
      },
      operational: {
        criticalOrOverdueObservations: [],
        upcomingActionPlans: [],
      },
      rows: [
        {
          area: { id: "area", name: "Sistemas" },
          areaResponsible: null,
          executor: null,
          observationId: "observation",
          processOwner: null,
          riskLevel: { colorToken: "high", key: "HIGH", name: "Alto" },
        },
      ],
    } as unknown as ReportDashboardData,
    filters: {},
    preview,
    reportName: "Tablero - Avance de planes NIBOL",
    view: "DASHBOARD",
  });
  for (const label of [
    "Nivel de riesgo",
    "Estado según plazo",
    "Estado del plan de acción",
    "Tendencia mensual",
    "Observaciones críticas o vencidas",
    "Planes próximos a vencer",
  ])
    assert.ok(html.includes(label), label);
  assert.match(html, /mini-donut/);
  assert.match(html, /conic-gradient/);
});
