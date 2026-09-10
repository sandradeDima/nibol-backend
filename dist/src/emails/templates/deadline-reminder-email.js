import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { emailSemanticBadgeStyle, escapeHtml, joinTextBlocks, resolveEmailAppName, } from "../utils.js";
const bucketLabel = (bucket) => bucket === "OVERDUE"
    ? "Vencidos"
    : bucket === "DUE_TODAY"
        ? "Vence hoy"
        : "Próximos a vencer";
const deadlineBadgeStyle = (bucket) => bucket === "OVERDUE"
    ? "background:#fee2e2;color:#991b1b"
    : "background:#fef3c7;color:#92400e";
const renderPlan = (plan) => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d8e2ee;border-collapse:separate;margin:0 0 12px;">
    <tr>
      <td style="padding:14px 16px 8px;">
        <div style="color:#07142d;font-size:13px;font-weight:800;">${escapeHtml(plan.report)} · ${escapeHtml(plan.observation)}</div>
        <div style="color:#1b2940;font-size:16px;font-weight:750;line-height:1.35;margin-top:5px;">${escapeHtml(plan.plan)}</div>
        <div style="color:#617086;font-size:12px;line-height:1.55;margin-top:5px;">${escapeHtml(plan.description)}</div>
      </td>
      <td align="right" style="padding:14px 16px 8px;vertical-align:top;white-space:nowrap;">
        <span style="${emailSemanticBadgeStyle(plan.risk)};border-radius:999px;display:inline-block;font-size:11px;font-weight:700;padding:4px 8px;">${escapeHtml(plan.risk)}</span>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:4px 16px 14px;">
        <div style="color:#516075;font-size:12px;line-height:1.7;">
          <strong>Área:</strong> ${escapeHtml(plan.area)}<br>
          ${plan.executor ? `<strong>Ejecutor:</strong> ${escapeHtml(plan.executor)}<br>` : ""}
          <strong>Fecha de compromiso actual:</strong> ${escapeHtml(plan.effectiveDueDate)}<br>
          <strong>Estado de plazo:</strong> <span style="${deadlineBadgeStyle(plan.bucket)};border-radius:999px;display:inline-block;font-weight:700;padding:2px 7px;">${escapeHtml(plan.bucket === "DUE_TODAY" ? "Vence hoy" : plan.deadlineStatus)}</span><br>
          <strong>Estado de avance:</strong> ${escapeHtml(plan.officialProgress)} · ${plan.officialProgressPercent}%<br>
          <strong>Reprogramado:</strong> <span style="${plan.reprogrammed ? "background:#dbeafe;color:#1d4ed8" : "background:#e7edf5;color:#334155"};border-radius:999px;display:inline-block;font-weight:700;padding:2px 7px;">${plan.reprogrammed ? "Sí" : "No"}</span>
        </div>
      </td>
    </tr>
  </table>
`;
export const deadlineReminderEmailTemplate = {
    name: "deadlineReminder",
    render: ({ brand, variables }) => {
        const appName = resolveEmailAppName(variables.appName ?? brand.appName);
        const sections = ["OVERDUE", "DUE_TODAY", "UPCOMING"]
            .map((bucket) => {
            const plans = variables.plans.filter((plan) => plan.bucket === bucket);
            if (plans.length === 0)
                return "";
            return `
            <h2 style="color:#07142d;font-size:17px;margin:26px 0 10px;">${bucketLabel(bucket)} <span style="color:#617086;font-size:13px;font-weight:600;">(${plans.length})</span></h2>
            ${plans.map(renderPlan).join("")}
          `;
        })
            .join("");
        const contentHtml = `
        <p style="margin:0 0 16px;">Buenas tardes, ${escapeHtml(variables.userName)}:</p>
        <p style="margin:0 0 18px;">Al corte del <strong>${escapeHtml(variables.cutoffDate)}</strong>, se identificaron los siguientes planes de acción que requieren seguimiento.</p>
        <p style="background:#f3f6fa;border-left:4px solid #d71920;color:#1b2940;margin:0 0 20px;padding:14px 16px;"><strong>Resumen:</strong> ${variables.overdue} vencido${variables.overdue === 1 ? "" : "s"}, ${variables.dueToday} con vencimiento hoy y ${variables.upcoming} próximo${variables.upcoming === 1 ? "" : "s"} a vencer. Reprogramados: ${variables.reprogrammed}.</p>
        ${sections}
        <p style="margin:24px 0;"><a href="${escapeHtml(variables.platformLink)}" style="background:#07142d;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Ver pendientes en NIBOL</a></p>
        <p style="color:#617086;font-size:12px;line-height:1.6;margin:0;">Este recordatorio ${escapeHtml(variables.roleCadence)} se genera con corte calendario y utiliza la fecha de compromiso efectiva. Este mensaje fue generado por ${escapeHtml(appName)}.</p>
      `;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `${variables.subject} · ${variables.plans.length} planes`,
            }),
            subject: variables.subject,
            text: joinTextBlocks(`Buenas tardes, ${variables.userName}:`, `Al corte del ${variables.cutoffDate}, se identificaron planes de acción que requieren seguimiento.`, `Resumen: ${variables.overdue} vencidos · ${variables.dueToday} vencen hoy · ${variables.upcoming} próximos a vencer · ${variables.reprogrammed} reprogramados.`, ...["OVERDUE", "DUE_TODAY", "UPCOMING"].flatMap((bucket) => {
                const plans = variables.plans.filter((plan) => plan.bucket === bucket);
                return plans.length === 0
                    ? []
                    : [
                        bucketLabel(bucket),
                        ...plans.map((plan) => `${plan.report} · ${plan.observation} · ${plan.plan} · Área: ${plan.area} · Fecha: ${plan.effectiveDueDate} · Estado: ${plan.deadlineStatus} · Avance: ${plan.officialProgress} ${plan.officialProgressPercent}% · Reprogramado: ${plan.reprogrammed ? "Sí" : "No"}`),
                    ];
            }), `Ver pendientes en NIBOL: ${variables.platformLink}`, `Recordatorio ${variables.roleCadence} generado por ${appName}.`),
        };
    },
    sampleVariables: {
        appName: "NIBOL Bolivia",
        cutoffDate: "15 de septiembre de 2026",
        dueToday: 1,
        overdue: 1,
        plans: [
            {
                area: "Finanzas",
                bucket: "OVERDUE",
                deadlineStatus: "Vencido",
                description: "Actualizar la matriz y documentar la revisión.",
                effectiveDueDate: "10/09/2026",
                executor: "Ejecutor Demo",
                observation: "OBS-003 — Control de accesos",
                officialProgress: "Con avance",
                officialProgressPercent: 60,
                plan: "Actualizar matriz de accesos",
                reprogrammed: true,
                report: "AI-2026-004",
                risk: "Alto",
            },
            {
                area: "Finanzas",
                bucket: "DUE_TODAY",
                deadlineStatus: "Vigente",
                description: "Completar las pruebas comprometidas.",
                effectiveDueDate: "15/09/2026",
                executor: "Ejecutor Demo",
                observation: "OBS-004 — Conciliación documental",
                officialProgress: "Iniciado",
                officialProgressPercent: 20,
                plan: "Completar pruebas de control",
                reprogrammed: false,
                report: "AI-2026-004",
                risk: "Medio",
            },
        ],
        platformLink: "http://localhost:3000/reportes",
        reprogrammed: 1,
        roleCadence: "mensual",
        subject: "Recordatorio mensual de plazos — NIBOL",
        upcoming: 0,
        userName: "Sandra",
    },
};
//# sourceMappingURL=deadline-reminder-email.js.map