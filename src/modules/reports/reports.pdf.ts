import { readFileSync } from "node:fs";

import puppeteer from "puppeteer";

import type {
  AuditReportData,
  ReportActionPlanRow,
  ReportChartItem,
  ReportDashboardData,
  ReportPreviewData,
} from "./reports.types.js";

export type PdfView = "REPORTS" | "DASHBOARD" | "GENERATOR" | "ATTENTION";

export type PdfInput = {
  audit?: AuditReportData;
  actionPlanRows?: ReportActionPlanRow[];
  dashboard?: ReportDashboardData;
  filters: Record<string, unknown>;
  includeActionPlans?: boolean;
  preview?: ReportPreviewData;
  reportName: string;
  staticDashboard?: ReportDashboardData;
  view: PdfView | "AUDIT";
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number")
    return new Intl.NumberFormat("es-BO").format(value);
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
    return new Intl.DateTimeFormat("es-BO", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(value));
  return String(value);
};

const observationGroups = [
  { label: "Informe", end: 3, color: "#2F5597" },
  { label: "Observación", end: 14, color: "#C00000" },
  { label: "Plan de acción", end: 17, color: "#7030A0" },
  { label: "Reprogramación", end: 19, color: "#C00000" },
  { label: "Comentario plan de acción", end: 21, color: "#7030A0" },
  { label: "Estados", end: 24, color: "#44546A" },
] as const;

const chartColor = (item: ReportChartItem): string => {
  const key = item.key.trim().toUpperCase();
  const label = item.label.trim().toUpperCase();
  const token = item.colorToken?.trim().toUpperCase();
  if (token?.startsWith("#") && /^#[0-9A-F]{6}$/.test(token)) return token;
  if (token?.includes("CRIT") || key.includes("CRIT") || label.includes("CRIT"))
    return "#991B1B";
  if ([token, key, label].some((value) => value === "HIGH" || value === "ALTO"))
    return "#D71920";
  if (
    [token, key, label].some((value) => value === "MEDIUM" || value === "MEDIO")
  )
    return "#FACC15";
  if ([token, key, label].some((value) => value === "LOW" || value === "BAJO"))
    return "#16A34A";
  if (token === "VENCIDO" || key === "VENCIDO") return "#D71920";
  if (token === "SI" || key === "SI") return "#F59E0B";
  if (token === "NO" || key === "NO") return "#6B7280";
  if (key === "CONCLUDED") return "#1DB65F";
  if (token === "VIGENTE" || key === "VIGENTE") return "#0F766E";
  if (key === "STARTED" || key === "INICIADO") return "#38B6E9";
  if (key === "WITH_PROGRESS" || key === "CON_AVANCE" || key === "SI")
    return "#FFBA00";
  if (key === "NOT_STARTED") return "#EFF000";
  if (key === "NO") return "#6B7280";
  return "#07142D";
};

const panel = (title: string, content: string, description = ""): string =>
  `<section class="panel"><h2>${escapeHtml(title)}</h2>${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}${content}</section>`;

const kpi = (label: string, value: unknown, tone = ""): string =>
  `<article class="kpi ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatCell(value))}</strong></article>`;

const bars = (items: ReportChartItem[]): string => {
  if (!items.length)
    return '<p class="empty">No hay datos para este corte.</p>';
  const max = Math.max(...items.map((item) => item.value), 0);
  return `<div class="bars">${items
    .map((item) => {
      const width = max > 0 ? (Math.max(item.value, 0) / max) * 100 : 0;
      return `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(formatCell(item.value))}</strong></div><div class="bar"><i style="width:${width}%;background:${chartColor(item)}"></i></div></div>`;
    })
    .join("")}</div>`;
};

const donut = (items: ReportChartItem[], compact = false): string => {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return '<p class="empty">No hay datos para este corte.</p>';
  let cursor = 0;
  const segments = items.map((item) => {
    const start = cursor;
    cursor += (item.value / total) * 100;
    return `${chartColor(item)} ${start}% ${cursor}%`;
  });
  return `<div class="donut-layout ${compact ? "compact" : ""}"><div class="donut" style="background:conic-gradient(${segments.join(",")})"><div><small>Total</small><strong>${formatCell(total)}</strong></div></div><div class="legend">${items
    .map(
      (item) =>
        `<div><span class="swatch" style="background:${chartColor(item)}"></span><span>${escapeHtml(item.label)}</span><strong>${formatCell(item.value)}</strong></div>`,
    )
    .join("")}</div></div>`;
};

const trend = (points: ReportDashboardData["charts"]["trend"]): string => {
  if (!points.length)
    return '<p class="empty">No hay actividad suficiente para construir la tendencia.</p>';
  const max = Math.max(
    ...points.flatMap((point) => [point.created, point.closed]),
    1,
  );
  return `<div class="trend"><p><i class="registered"></i> Registradas <i class="closed"></i> Cerradas</p><div class="trend-bars">${points
    .map(
      (point) =>
        `<div><div class="trend-track"><i style="height:${(point.created / max) * 100}%"></i><b style="height:${(point.closed / max) * 100}%"></b></div><strong>${escapeHtml(point.label)}</strong><span>${point.created} / ${point.closed}</span></div>`,
    )
    .join("")}</div></div>`;
};

const filterSummary = (filters: Record<string, unknown>): string =>
  `<div class="filters">${Object.entries(filters)
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    )
    .map(
      ([label, value]) =>
        `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`,
    )
    .join("")}</div>`;

const table = (
  columns: string[],
  rows: Array<Record<string, unknown>>,
  title: string,
  grouped = false,
  renderCell: (row: Record<string, unknown>, label: string) => string = (
    row,
    label,
  ) => escapeHtml(formatCell(row[label])),
): string => {
  if (!rows.length)
    return panel(
      title,
      '<p class="empty">No hay registros para este corte.</p>',
    );
  const chunks: Array<Array<{ index: number; label: string }>> = [];
  if (columns.length <= 9)
    chunks.push(columns.map((label, index) => ({ index, label })));
  else {
    for (let start = 1; start < columns.length; start += 8)
      chunks.push([
        { index: 0, label: columns[0]! },
        ...columns.slice(start, start + 8).map((label, offset) => ({
          index: start + offset,
          label,
        })),
      ]);
  }
  return chunks
    .flatMap((chunk, index) => {
      const sections: string[] = [];
      const groupHeader = grouped
        ? `<tr>${chunk
            .flatMap(({ index }, position) => {
              const group = observationGroups.find((item) => index < item.end)!;
              const previous = chunk[position - 1];
              if (
                previous &&
                observationGroups.find((item) => previous.index < item.end) ===
                  group
              )
                return [];
              let span = 1;
              while (
                chunk[position + span] &&
                observationGroups.find(
                  (item) => chunk[position + span]!.index < item.end,
                ) === group
              )
                span += 1;
              return [
                `<th class="group-header" colspan="${span}" style="background:${group.color}">${escapeHtml(group.label)}</th>`,
              ];
            })
            .join("")}</tr>`
        : "";
      for (let start = 0; start < rows.length; start += 20) {
        const end = Math.min(start + 20, rows.length);
        sections.push(
          panel(
            `${title}${chunks.length > 1 ? ` · columnas ${index + 1}/${chunks.length}` : ""} · ${start + 1}-${end} de ${rows.length}`,
            `<table><thead>${groupHeader}<tr>${chunk.map(({ index, label }) => `<th${grouped ? ` class="group-header" style="background:${observationGroups.find((item) => index < item.end)!.color}"` : ""}>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${rows
              .slice(start, end)
              .map(
                (row) =>
                  `<tr>${chunk.map(({ label }) => `<td>${renderCell(row, label)}</td>`).join("")}</tr>`,
              )
              .join("")}</tbody></table>`,
          ),
        );
      }
      return sections;
    })
    .join("");
};

const actionPlanTable = (
  rows: ReportActionPlanRow[],
  title: string,
): string =>
  table(
    [
      "Número de observación",
      "Observación principal",
      "Área",
      "Nivel de riesgo",
      "Estado del plan de acción",
      "Ver plan",
    ],
    rows.map((row) => ({
      Área: row.area.name,
      "Estado del plan de acción": row.officialProgress.label,
      "Nivel de riesgo": row.riskLevel.name,
      "Número de observación": row.observation.number,
      "Observación principal": row.observation.mainObservation,
      "Enlace al plan": row.href,
    })),
    title,
    false,
    (row, label) =>
      label === "Ver plan" && typeof row["Enlace al plan"] === "string"
        ? `<a href="${escapeHtml(row["Enlace al plan"])}" style="color:#2F5597;text-decoration:underline">Ver plan</a>`
        : escapeHtml(formatCell(row[label])),
  );

const observationDistribution = (
  rows: ReportDashboardData["rows"],
  getItem: (row: ReportDashboardData["rows"][number]) => {
    colorToken?: string | null;
    key: string;
    label: string;
  },
): ReportChartItem[] => {
  const groups = new Map<string, ReportChartItem>();
  const seen = new Set<string>();
  for (const row of rows) {
    const item = getItem(row);
    const identity = `${row.observationId}:${item.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const group = groups.get(item.key) ?? { ...item, value: 0 };
    group.value += 1;
    groups.set(item.key, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.value - a.value || a.label.localeCompare(b.label, "es"),
  );
};

const reportContent = (input: PdfInput): string => {
  const preview = input.preview;
  const dashboard = input.dashboard;
  const audit = input.audit;
  if (input.view === "AUDIT" && audit) {
    const overview = `<div class="kpis">${kpi("Registros", audit.summary.total)}${audit.summary.overdue !== undefined ? kpi("Incumplimientos", audit.summary.overdue, "danger") : ""}${kpi("Corte", input.filters["Período"] === "Período actual" ? "Actual" : "Filtrado")}</div>`;
    const timeline = audit.timeline?.length
      ? panel(
          "Línea de tiempo",
          `<div class="timeline">${audit.timeline.map((item) => `<div><b>${escapeHtml(item.date)} · ${escapeHtml(item.title)}</b><p>${escapeHtml(item.description)}</p><small>${escapeHtml(item.actor)} · ${escapeHtml(item.area)} · ${escapeHtml(item.result)}</small></div>`).join("")}</div>`,
        )
      : "";
    return `${overview}${timeline}${table(audit.columns, audit.rows, "Registros de auditoría")}`;
  }
  if (!preview) return "";
  const actionPlanList = (title: string) =>
    input.includeActionPlans === false
      ? ""
      : input.actionPlanRows === undefined
        ? table(preview.columns, preview.rows, title)
        : actionPlanTable(input.actionPlanRows, title);
  if (input.view === "GENERATOR") {
    const rows =
      preview.reportType === "ACTION_PLANS"
        ? actionPlanList("Registros del reporte")
        : table(
            preview.columns,
            preview.rows,
            "Registros del reporte",
            preview.reportType === "OBSERVATIONS",
          );
    return `<div class="kpis">${kpi(preview.reportType === "OBSERVATIONS" ? "Planes de acción" : "Registros", preview.total, "accent")}${preview.reportType !== "OBSERVATIONS" ? kpi("Cumplimiento", `${Math.round(preview.summary.compliancePercent)}%`) : ""}</div>${rows}`;
  }
  if (input.view === "ATTENTION") {
    const summary = preview.summary;
    return `<div class="kpis">${kpi("Vigentes", summary.vigentes)}${kpi("Próximas a vencer", summary.dueSoon)}${kpi("Vencidos", summary.vencidos, "danger")}</div>${actionPlanList("Bandeja de atención")}`;
  }
  if (!dashboard)
    return actionPlanList("Registros del reporte");
  const charts = dashboard.charts;
  const summary = dashboard.summary;
  const staticSummary = input.staticDashboard?.summary ?? summary;
  const observationKpis = `<div class="kpis">${kpi("Total observaciones", staticSummary.totalObservations, "accent")}${kpi("Pendientes", staticSummary.pendingObservations)}${kpi("Cerradas", staticSummary.closedObservations)}</div>`;
  if (input.view === "REPORTS") {
    const planKpis = `<div class="kpis four">${kpi("Total de planes", staticSummary.total, "accent")}${kpi("No iniciado", staticSummary.noIniciado)}${kpi("Iniciado", staticSummary.iniciado)}${kpi("Con avance", staticSummary.conAvance)}${kpi("Concluido", staticSummary.concluido)}${kpi("Vigentes", staticSummary.vigentes)}${kpi("Vencidos", staticSummary.vencidos, "danger")}${kpi("Reprogramados", staticSummary.reprogramados)}</div>`;
    return `<h2 class="section-title">Observaciones</h2>${observationKpis}<h2 class="section-title">Planes de acción</h2>${planKpis}<div class="grid two">${panel("Lectura del corte", dashboard.insights.map((insight) => `<p>${escapeHtml(insight)}</p>`).join("") || "<p>No hay planes dentro del corte.</p>")}${panel("Cumplimiento del corte", `<strong class="big-number">${summary.compliancePercent}%</strong><p>Planes concluidos dentro de plazo</p>`)}</div><div class="grid two">${panel("Distribución por estado del plan de acción", bars(charts.progressDistribution))}${panel("Distribución por estado según plazo", bars(charts.deadlineDistribution))}${panel("Distribución por riesgo", donut(charts.riskDistribution))}${panel("Reprogramación", bars(charts.reprogrammedDistribution))}${panel("Planes por área", bars(charts.areaDistribution))}${panel("Planes por dueño del proceso", bars(charts.processOwnerDistribution))}${panel("Planes por responsable de área", bars(charts.areaResponsibleDistribution))}${panel("Planes por ejecutor", bars(charts.executorDistribution))}</div>${actionPlanList("Planes de acción")}`;
  }
  const byRisk = observationDistribution(dashboard.rows, (row) => ({
    ...row.riskLevel,
    label: row.riskLevel.name,
    key: row.riskLevel.key,
  }));
  const byArea = observationDistribution(dashboard.rows, (row) => ({
    key: row.area.id,
    label: row.area.name,
  }));
  const byResponsible = observationDistribution(dashboard.rows, (row) => ({
    key: row.areaResponsible?.id ?? "none",
    label: row.areaResponsible?.name ?? "Sin asignar",
  }));
  const byOwner = observationDistribution(dashboard.rows, (row) => ({
    key: row.processOwner?.id ?? "none",
    label: row.processOwner?.name ?? "Sin asignar",
  }));
  const byExecutor = observationDistribution(dashboard.rows, (row) => ({
    key: row.executor?.id ?? "none",
    label: row.executor?.name ?? "Sin asignar",
  }));
  const progressTotal = charts.progressDistribution.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const progressCards = `<div class="progress-cards">${charts.progressDistribution
    .map((item) => {
      const percent = progressTotal
        ? Math.round((item.value / progressTotal) * 100)
        : 0;
      return `<div><span class="mini-donut" style="background:conic-gradient(${chartColor(item)} ${percent}%,#E5E7EB 0)"><i>${percent}%</i></span><span><b>${escapeHtml(item.label)}</b><strong>${item.value}</strong></span></div>`;
    })
    .join("")}</div>`;
  const operational = dashboard.operational;
  const criticalRows = operational.criticalOrOverdueObservations.map(
    (item) => ({
      "Número de observación": item.number,
      "Observación principal": item.mainObservation,
      "Título de observación": item.title,
      Área: item.area.name,
      Riesgo: item.riskLevel.name,
      "Estado de observación": item.observationStatus.name,
      "Estado según plazo": item.deadlineStatus,
      "Fecha límite": item.dueDate,
      "Avance oficial": `${item.progressPercent}%`,
    }),
  );
  const upcomingRows = operational.upcomingActionPlans.map((item) => ({
    "Número de observación": item.observationNumber,
    "Observación principal": item.mainObservation,
    "Plan de acción": item.title,
    Ejecutor: item.executorName,
    "Fecha límite": item.effectiveDueDate,
    "Estado según plazo": item.deadlineStatus,
    "Avance oficial": `${item.progress.percent}%`,
  }));
  const planTotals = `<p class="summary-line">Total ${formatCell(summary.total)} · Vigentes ${formatCell(summary.vigentes)} · Vencidos ${formatCell(summary.vencidos)} · Reprogramados ${formatCell(summary.reprogramados)}</p>`;
  return `<h2 class="section-title">01 · Resumen de observaciones</h2>${observationKpis}<div class="grid two">${panel("Nivel de riesgo", donut(byRisk, true))}${panel("Estado según plazo", donut(charts.deadlineDistribution, true))}</div><h2 class="section-title">02 · Planes de acción</h2>${panel("Estado del plan de acción", progressCards)}<h2 class="section-title">03 · Observaciones por…</h2><div class="grid two">${panel("Estado de observación", bars(charts.statusDistribution))}${panel("Observaciones por área", bars(byArea))}${panel("Observaciones por Responsable de Área", bars(byResponsible))}${panel("Observaciones por Dueño del Proceso", bars(byOwner))}${panel("Observaciones por Ejecutor", bars(byExecutor))}</div><h2 class="section-title">04 · Planes por…</h2>${planTotals}<div class="grid two">${panel("Planes por área", bars(charts.areaDistribution))}${panel("Planes por Responsable de Área", bars(charts.areaResponsibleDistribution))}${panel("Planes por Dueño del Proceso", bars(charts.processOwnerDistribution))}${panel("Planes por Ejecutor", bars(charts.executorDistribution))}</div><h2 class="section-title">05 · Analítica complementaria</h2><div class="grid two">${panel("Tendencia mensual", trend(charts.trend))}${panel("Top responsables con mayor carga", bars(charts.topResponsibleWorkload ?? []))}${panel("Top áreas con más vencimientos", bars((charts.topOverdueAreas ?? []).map((item) => ({ ...item, colorToken: "VENCIDO" }))))}</div><h2 class="section-title">06 · Operación</h2>${table(Object.keys(criticalRows[0] ?? { "Número de observación": "", "Observación principal": "", "Título de observación": "" }), criticalRows, "Observaciones críticas o vencidas")}${table(Object.keys(upcomingRows[0] ?? { "Número de observación": "", "Observación principal": "", "Plan de acción": "" }), upcomingRows, "Planes próximos a vencer")}${actionPlanList("Planes de acción")}`;
};

const styles = `
  @font-face { font-family: Manrope; src: url(data:font/woff2;base64,${readFileSync(new URL("./fonts/manrope-latin.woff2", import.meta.url)).toString("base64")}) format("woff2"); font-weight: 200 800; }
  @font-face { font-family: Barlow; src: url(data:font/woff2;base64,${readFileSync(new URL("./fonts/barlow-semi-condensed-700-latin.woff2", import.meta.url)).toString("base64")}) format("woff2"); font-weight: 700; }
  @page { size: A3 landscape; margin: 15mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #07142d; background: white; font-family: Manrope, Arial, sans-serif; font-size: 12px; }
  header { border-bottom: 4px solid #d71920; padding: 14px 0 17px; margin-bottom: 18px; }
  header h1 { margin: 0; font-family: Barlow, Manrope, sans-serif; font-size: 25px; letter-spacing: -.02em; }
  header p { margin: 5px 0 0; color: #6b7280; }
  .filters { display: flex; flex-wrap: wrap; gap: 5px 12px; margin: 0 0 20px; color: #334155; }
  .filters span { border: 1px solid #e5e7eb; padding: 6px 9px; }
  .section-title { margin: 22px 0 12px; color: #d71920; font-size: 13px; letter-spacing: .13em; text-transform: uppercase; break-after: avoid; }
  .summary-line { margin: 0 0 12px; color: #6b7280; font-size: 10px; }
  .kpis { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 18px; }
  .kpis.four { grid-template-columns: repeat(4,1fr); }
  .kpi { display: flex; flex-direction: column; justify-content: space-between; min-height: 84px; padding: 14px; border: 1px solid #e5e7eb; break-inside: avoid; }
  .kpi span { color: #6b7280; font-size: 10px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; }
  .kpi strong { display: block; margin-top: 10px; font-size: 27px; }
  .kpi.accent { background: #07142d; color: white; border-color: #07142d; }
  .kpi.accent span { color: #cbd5e1; }
  .kpi.danger { border-color: #f5c1c3; }
  .grid { display: grid; gap: 14px; margin: 14px 0; align-items: start; }
  .grid.two { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .panel { min-width: 0; padding: 17px; border: 1px solid #e5e7eb; margin-bottom: 14px; break-inside: avoid; }
  .panel:has(table) { break-inside: auto; }
  .panel h2 { margin: 0 0 11px; font-family: Barlow, Manrope, sans-serif; font-size: 17px; text-transform: uppercase; break-after: avoid; }
  .panel .description { color: #334155; }
  .big-number { font-size: 40px; }
  .empty { padding: 20px; background: #f8fafc; color: #64748b; text-align: center; }
  .bars { display: grid; gap: 11px; }
  .bar-label { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .bar-label span { overflow-wrap: anywhere; }
  .bar { width: 100%; height: 8px; }
  .bar i { display: block; height: 8px; min-width: 2px; }
  .donut-layout { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 18px; }
  .donut-layout.compact { grid-template-columns: 100px 1fr; }
  .donut { width: 145px; height: 145px; border-radius: 50%; display: grid; place-items: center; }
  .compact .donut { width: 95px; height: 95px; }
  .donut > div { width: 53%; height: 53%; border-radius: 50%; background: white; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .donut small { color: #6b7280; text-transform: uppercase; font-size: 9px; }
  .donut strong { font-size: 22px; }
  .legend { display: grid; gap: 6px; }
  .legend > div { display: grid; grid-template-columns: 10px 1fr auto; gap: 7px; align-items: center; }
  .swatch { width: 9px; height: 9px; }
  .progress-cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
  .progress-cards > div { display: flex; gap: 10px; align-items: center; padding: 9px; border: 1px solid #e5e7eb; background: #f8fafc; }
  .progress-cards span:last-child { display: grid; gap: 3px; }
  .progress-cards strong { font-size: 20px; }
  .mini-donut { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
  .mini-donut i { width: 37px; height: 37px; border-radius: 50%; background: white; display: grid; place-items: center; font-size: 10px; font-style: normal; }
  .trend p { font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .trend p i { display: inline-block; width: 14px; height: 8px; margin-left: 12px; }
  .trend .registered, .trend-track i { background: #07142d; }
  .trend .closed, .trend-track b { background: #0f766e; }
  .trend-bars { display: flex; gap: 5px; justify-content: space-between; }
  .trend-bars > div { flex: 1; text-align: center; min-width: 0; }
  .trend-track { height: 105px; display: flex; align-items: end; justify-content: center; gap: 3px; background: #f8fafc; padding: 5px; }
  .trend-track i, .trend-track b { display: block; width: 12px; min-height: 1px; }
  .trend-bars strong, .trend-bars span { display: block; font-size: 9px; margin-top: 3px; }
  .timeline > div { padding: 9px 12px; border-left: 3px solid #07142d; margin-bottom: 9px; background: #f8fafc; break-inside: avoid; }
  .timeline p { margin: 5px 0; }
  .timeline small { color: #6b7280; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { color: #6b7280; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; text-align: left; border-bottom: 2px solid #cbd5e1; }
  th.group-header { color: white; border: 1px solid #ffffff50; }
  th, td { padding: 6px 5px; vertical-align: top; overflow-wrap: anywhere; white-space: pre-wrap; }
  td { border-bottom: 1px solid #e5e7eb; }
`;

export const renderReportHtml = (input: PdfInput): string =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${styles}</style></head><body><header><h1>${escapeHtml(input.reportName)}</h1><p>NIBOL · Generado ${escapeHtml(input.preview?.generatedAt ?? input.audit?.generatedAt ?? input.dashboard?.generatedAt ?? "")}</p></header>${filterSummary(input.filters)}${reportContent(input)}</body></html>`;

export const buildReportPdf = async (input: PdfInput): Promise<Buffer> => {
  const html = renderReportHtml(input);
  const browser = await puppeteer.launch({
    args: process.getuid?.() === 0 ? ["--no-sandbox"] : [],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => void request.abort());
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMediaType("screen");
    return Buffer.from(
      await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 300_000,
      }),
    );
  } finally {
    await browser.close();
  }
};
