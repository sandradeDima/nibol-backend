import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { emailSemanticBadgeStyle, escapeHtml, greeting, joinTextBlocks, resolveEmailAppName, } from "../utils.js";
export const observationAssignmentEmailTemplate = {
    name: "observationAssignment",
    render: ({ brand, variables }) => {
        const appName = resolveEmailAppName(variables.appName ?? brand.appName);
        const context = variables.reports
            .map((report) => `Informe ${escapeHtml(report.reportNumber)} · ${escapeHtml(report.reportTitle)} · ${escapeHtml(report.areaNames.join(", "))}`)
            .join("<br>");
        const rows = variables.reports
            .flatMap((report) => report.observations.map((item) => `
              <tr>
                <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;">${escapeHtml(item.code ?? String(item.number))}</td>
                <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;"><strong>${escapeHtml(item.title)}</strong><br><span style="color:#617086;font-size:12px;">${escapeHtml(item.area ?? "Área no especificada")} · ${escapeHtml(item.dueDate ?? "Fecha por definir")}</span></td>
                <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;"><span style="${emailSemanticBadgeStyle(item.risk, item.riskColorToken)};border-radius:999px;font-size:12px;font-weight:700;padding:4px 8px;">${escapeHtml(item.risk)}</span></td>
              </tr>`))
            .join("");
        const contentHtml = `
        <p style="margin:0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
        <p style="font-size:20px;font-weight:700;margin:0 0 12px;">Nuevas observaciones asignadas</p>
        <p style="margin:0 0 16px;">Tienes <strong>${variables.total}</strong> observación${variables.total === 1 ? "" : "es"} nueva${variables.total === 1 ? "" : "s"} para gestionar en NIBOL.</p>
        <p style="color:#617086;font-size:13px;line-height:1.6;margin:0 0 18px;">${context}</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;"><thead><tr><th style="text-align:left;padding:8px;">Código</th><th style="text-align:left;padding:8px;">Observación</th><th style="text-align:left;padding:8px;">Riesgo</th></tr></thead><tbody>${rows}</tbody></table>
        <p style="margin:24px 0;"><a href="${escapeHtml(variables.platformLink)}" style="background:#07142d;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Ver observaciones en NIBOL</a></p>
        <p style="color:#617086;font-size:12px;line-height:1.6;margin:0;">Este mensaje fue generado por ${escapeHtml(appName)}.</p>`;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `NIBOL · ${variables.total} observaciones asignadas`,
            }),
            subject: `NIBOL · ${variables.total} observación${variables.total === 1 ? "" : "es"} asignada${variables.total === 1 ? "" : "s"}`,
            text: joinTextBlocks(greeting(variables.userName), `Tienes ${variables.total} observación${variables.total === 1 ? "" : "es"} nueva${variables.total === 1 ? "" : "s"} para gestionar en NIBOL.`, ...variables.reports.flatMap((report) => [
                `Informe ${report.reportNumber} · ${report.reportTitle}`,
                ...report.observations.map((item) => `${item.code ?? item.number}. ${item.title} · Riesgo: ${item.risk} · Área: ${item.area ?? "No especificada"} · Fecha: ${item.dueDate ?? "Por definir"}`),
            ]), `Ver observaciones en NIBOL: ${variables.platformLink}`, `Mensaje generado por ${appName}.`),
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
//# sourceMappingURL=observation-assignment-email.js.map