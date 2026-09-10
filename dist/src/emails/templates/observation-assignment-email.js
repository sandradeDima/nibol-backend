import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { emailSemanticBadgeStyle, escapeHtml, joinTextBlocks, } from "../utils.js";
export const observationAssignmentEmailTemplate = {
    name: "observationAssignment",
    render: ({ brand, variables }) => {
        const reportsHtml = variables.reports
            .map((report) => {
            const rows = report.observations
                .map((item) => `
      <tr>
        <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;">${escapeHtml(item.code ?? String(item.number))}</td>
        <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;"><strong>${escapeHtml(item.title)}</strong><br><span style="color:#617086;font-size:12px;">${escapeHtml(item.description)}</span><br><span style="color:#617086;font-size:12px;">Área: ${escapeHtml(item.area ?? "No especificada")} · Fecha compromiso: ${escapeHtml(item.dueDate ?? "Por definir")}</span></td>
        <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;"><span style="${emailSemanticBadgeStyle(item.risk)};border-radius:999px;font-size:12px;font-weight:700;padding:4px 8px;">${escapeHtml(item.risk)}</span></td>
      </tr>`)
                .join("");
            return `
      <h3 style="color:#07142d;font-size:17px;margin:24px 0 8px;">Informe de Auditoría Interna N.º ${escapeHtml(report.reportNumber)} – ${escapeHtml(report.reportTitle)}</h3>
      <p>Áreas involucradas: <strong>${escapeHtml(report.areaNames.join(", "))}</strong></p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0;"><thead><tr><th style="text-align:left;padding:8px;">N.º</th><th style="text-align:left;padding:8px;">Observación</th><th style="text-align:left;padding:8px;">Riesgo</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Observaciones de este informe: <strong>${report.observations.length}</strong>.</p>`;
        })
            .join("");
        const contentHtml = `
      <p style="margin:0 0 16px;">Buenas tardes estimados:</p>
      <p>En relación con los informes de Auditoría Interna que se detallan a continuación, se presentan las observaciones asignadas para su gestión:</p>
      ${reportsHtml}
      <p>Total de observaciones incluidas: <strong>${variables.total}</strong>.</p>
      <p>Agradecemos revisar las observaciones asignadas y los planes de acción recomendados.</p>
      <p style="margin:24px 0;"><a href="${escapeHtml(variables.platformLink)}" style="background:#07142d;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Ver observaciones asignadas</a></p>
      <p>Para consultar el detalle y gestionar las acciones correspondientes, favor ingresar a la plataforma a través del siguiente enlace: <a href="${escapeHtml(variables.platformLink)}">${escapeHtml(variables.platformLink)}</a>.</p>
      <p>Tener en cuenta que los plazos de remediación de acuerdo al nivel de riesgo de la observación no deben exceder de: ${escapeHtml(variables.maxPeriods)}.</p>
      <p>Saludos cordiales,<br><strong>Departamento de Auditoría</strong></p>
      <p style="color:#617086;font-size:12px;">Este mensaje fue generado por NIBOL Bolivia.</p>`;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `Observaciones asignadas · ${variables.total}`,
            }),
            subject: `Observaciones asignadas · ${variables.total} observaciones`,
            text: joinTextBlocks("Buenas tardes estimados:", ...variables.reports.flatMap((report) => [
                `Informe ${report.reportNumber} – ${report.reportTitle}`,
                `Áreas: ${report.areaNames.join(", ")}`,
                ...report.observations.map((item) => `${item.code ?? item.number}. ${item.title} · Área: ${item.area ?? "No especificada"} · Riesgo: ${item.risk} · Fecha compromiso: ${item.dueDate ?? "Por definir"}`),
            ]), `Total: ${variables.total}`, `Ingresar a la plataforma: ${variables.platformLink}`, `Plazos máximos: ${variables.maxPeriods}`, "Saludos cordiales, Departamento de Auditoría"),
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
                        title: "Observación de ejemplo",
                    },
                ],
                reportNumber: "INF-001",
                reportTitle: "Informe de Auditoría Interna",
            },
        ],
        platformLink: "http://localhost:3000/observaciones/demo",
        total: 1,
        userName: "Equipo responsable",
    },
};
//# sourceMappingURL=observation-assignment-email.js.map