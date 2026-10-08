import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type { EmailTemplateDefinition } from "../types/email-types.js";
import {
  emailRiskColor,
  escapeHtml,
  joinTextBlocks,
  resolveEmailAppName,
} from "../utils.js";

const parseMaxPeriods = (
  value: string,
): Array<{ label: string; period: string }> =>
  value
    .split("·")
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator < 0) return null;
      return {
        label: entry.slice(0, separator).trim(),
        period: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry): entry is { label: string; period: string } =>
      Boolean(entry),
    );

const riskScheduleColor = (label: string): string => {
  const normalized = label.toLowerCase();
  if (normalized.includes("alto") || normalized.includes("high"))
    return "#d92d20";
  if (normalized.includes("medio") || normalized.includes("medium"))
    return "#f0b323";
  if (normalized.includes("bajo") || normalized.includes("low"))
    return "#27a866";
  return "#6b7d91";
};

const riskScheduleRank = (label: string): number => {
  const normalized = label.toLowerCase();
  if (normalized.includes("alto") || normalized.includes("high")) return 0;
  if (normalized.includes("medio") || normalized.includes("medium")) return 1;
  if (normalized.includes("bajo") || normalized.includes("low")) return 2;
  return 3;
};

export const observationAssignmentEmailTemplate: EmailTemplateDefinition<"observationAssignment"> =
  {
    name: "observationAssignment",
    render: ({ brand, variables }) => {
      const appName = resolveEmailAppName(variables.appName ?? brand.appName);
      const observations = variables.reports.flatMap(
        (report) => report.observations,
      );
      const reportReferenceText = variables.reports
        .map((report) => `N.º ${report.reportNumber} – ${report.reportTitle}`)
        .join("; ");
      const reportReference = variables.reports
        .map(
          (report) =>
            `N.º ${escapeHtml(report.reportNumber)} – ${escapeHtml(report.reportTitle)}`,
        )
        .join("; ");
      const observationRows = observations
        .map(
          (item, index) => `
            <tr>
              <td style="border-bottom:1px solid #e4edf6;padding:8px 10px;vertical-align:middle;width:34px;">
                <span style="background:#eef5fd;border-radius:50%;color:#52759e;display:inline-block;font-weight:700;line-height:24px;text-align:center;width:24px;">${index + 1}</span>
              </td>
              <td style="border-bottom:1px solid #e4edf6;color:#42668f;font-size:12px;font-weight:700;line-height:1.35;padding:8px 8px;vertical-align:middle;">${escapeHtml(item.title)}</td>
              <td style="border-bottom:1px solid #e4edf6;padding:8px 10px;text-align:left;vertical-align:middle;white-space:nowrap;">
                <span style="background:#fff4e5;border-radius:999px;color:#c87913;display:inline-block;font-size:11px;font-weight:700;padding:6px 10px;">
                  <span style="background:${emailRiskColor(item.risk, item.riskColorToken)};border-radius:50%;display:inline-block;height:10px;margin-right:6px;vertical-align:-1px;width:10px;"></span>${escapeHtml(item.risk)}
                </span>
              </td>
            </tr>`,
        )
        .join("");
      const maxPeriodRows = parseMaxPeriods(variables.maxPeriods)
        .sort(
          (left, right) =>
            riskScheduleRank(left.label) - riskScheduleRank(right.label),
        )
        .map(
          ({ label, period }) => `
            <tr>
              <td style="background:${riskScheduleColor(label)};color:#ffffff;font-size:10px;font-weight:700;padding:5px 8px;">${escapeHtml(label)}</td>
              <td style="border-bottom:1px dashed #c9d4df;color:#26384d;font-size:10px;padding:5px 8px;">${escapeHtml(period)}</td>
            </tr>`,
        )
        .join("");
      const reportIntro =
        variables.reports.length === 1
          ? `En relación con el Informe de Auditoría Interna ${reportReference}, se detallan a continuación las observaciones asignadas para su gestión:`
          : `En relación con los informes de Auditoría Interna ${reportReference}, se detallan a continuación las observaciones asignadas para su gestión:`;
      const contentHtml = `
        <p style="font-weight:700;margin:0 0 16px;">Buenas tardes estimados:</p>
        <p style="font-weight:600;margin:0 0 14px;">${reportIntro}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 18px;">
          <thead>
            <tr><th colspan="3" style="background:#eaf3fb;color:#3c6590;font-size:12px;padding:8px 10px;text-align:left;">Hallazgos asociados</th></tr>
            <tr>
              <th style="background:#f5f9fd;color:#42668f;font-size:11px;padding:7px 10px;text-align:left;width:34px;">#</th>
              <th style="background:#f5f9fd;color:#42668f;font-size:11px;padding:7px 8px;text-align:left;">Hallazgo</th>
              <th style="background:#f5f9fd;color:#42668f;font-size:11px;padding:7px 10px;text-align:left;white-space:nowrap;">Nivel de riesgo</th>
            </tr>
          </thead>
          <tbody>${observationRows}</tbody>
        </table>
        <p style="font-weight:700;margin:0 0 16px;">Total Observaciones ${variables.total}</p>
        <p style="margin:0 0 14px;">Agradecemos revisar las observaciones asignadas y los planes de acción recomendados. Para consultar el detalle y gestionar las acciones correspondientes, favor ingresar a la plataforma a través del siguiente enlace: <a href="${escapeHtml(variables.platformLink)}" style="color:#245d8f;font-weight:700;text-decoration:none;">Enlace a la plataforma</a>.</p>
        <p style="margin:0 0 8px;">Tener en cuenta que los plazos de remediación de acuerdo al nivel de riesgo de la observación no deben exceder de:</p>
        ${maxPeriodRows ? `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px;min-width:210px;"><thead><tr><th style="border-bottom:1px solid #d6dee8;color:#26384d;font-size:10px;padding:4px 8px;text-align:left;">Nivel de Riesgo</th><th style="border-bottom:1px solid #d6dee8;color:#26384d;font-size:10px;padding:4px 8px;text-align:left;">Plazo máximo de remediación</th></tr></thead><tbody>${maxPeriodRows}</tbody></table>` : `<p style="color:#617086;font-size:11px;margin:0 0 12px;">${escapeHtml(variables.maxPeriods)}</p>`}
        <p style="margin:0;">Saludos cordiales,<br><strong>Departamento de Auditoría</strong></p>
        `;
      return {
        html: renderBaseEmailLayout({
          brand,
          contentHtml,
          previewText: `NIBOL · ${variables.total} observaciones asignadas`,
          variant: "auditDigest",
        }),
        subject: `Observaciones asignadas · ${variables.total} observaciones`,
        text: joinTextBlocks(
          "Buenas tardes estimados:",
          `${
            variables.reports.length === 1
              ? "En relación con el Informe de Auditoría Interna "
              : "En relación con los informes de Auditoría Interna "
          }${reportReferenceText}, se detallan a continuación las observaciones asignadas para su gestión:`,
          ...variables.reports.flatMap((report) => [
            `Informe ${report.reportNumber} · ${report.reportTitle}`,
            ...report.observations.map(
              (item) =>
                `${item.code ?? item.number}. ${item.title} · Riesgo: ${item.risk} · Área: ${item.area ?? "No especificada"} · Fecha: ${item.dueDate ?? "Por definir"}`,
            ),
          ]),
          `Total de observaciones incluidas: ${variables.total}`,
          `Consultar el detalle en la plataforma: ${variables.platformLink}`,
          `Plazos máximos: ${variables.maxPeriods}`,
          "Saludos cordiales, Departamento de Auditoría",
          `Mensaje generado por ${appName}.`,
        ),
      };
    },
    sampleVariables: {
      maxPeriods: "Bajo: 180 días · Medio: 120 días · Alto: 90 días",
      reports: [
        {
          areaNames: ["Finanzas"],
          observations: [
            {
              description: "Descripción de ejemplo",
              number: 1,
              risk: "Alto",
              riskColorToken: "high",
              title: "Observación de ejemplo",
            },
          ],
          reportNumber: "INF-001",
          reportTitle: "Informe de Auditoría Interna",
        },
      ],
      platformLink: "https://app.example.com/observaciones/demo",
      total: 1,
      userName: "Equipo responsable",
    },
  };
