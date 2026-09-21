import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { emailRiskColor, emailSemanticBadgeStyle, escapeHtml, greeting, joinTextBlocks, resolveEmailAppName, } from "../utils.js";
const MAX_VISIBLE_PLANS = 8;
const bucketLabel = (bucket) => bucket === "OVERDUE"
    ? "Vencido"
    : bucket === "DUE_TODAY"
        ? "Vence hoy"
        : "Próximo";
const riskKey = (plan) => {
    const value = `${plan.risk} ${plan.riskColorToken ?? ""}`.toLowerCase();
    if (value.includes("alto") || value.includes("high"))
        return "high";
    if (value.includes("medio") || value.includes("medium"))
        return "medium";
    if (value.includes("bajo") || value.includes("low"))
        return "low";
    return "other";
};
const renderRiskSummary = (plans) => {
    const counts = ["high", "medium", "low"].map((key) => ({
        count: plans.filter((plan) => riskKey(plan) === key).length,
        key,
    }));
    const maximum = Math.max(1, ...counts.map(({ count }) => count));
    const labels = { high: "Alto", low: "Bajo", medium: "Medio" };
    const colors = {
        high: emailRiskColor("Alto", "high"),
        low: emailRiskColor("Bajo", "low"),
        medium: emailRiskColor("Medio", "medium"),
    };
    return counts
        .map(({ count, key }) => `
        <tr>
          <td style="color:#516075;font-size:12px;padding:4px 8px 4px 0;width:52px;">${labels[key]}</td>
          <td style="padding:4px 0;"><div style="background:#edf2f7;height:8px;width:100%;"><div style="background:${colors[key]};height:8px;width:${Math.max(8, Math.round((count / maximum) * 100))}%;"></div></div></td>
          <td style="color:#1b2940;font-size:12px;font-weight:700;padding:4px 0 4px 8px;text-align:right;width:28px;">${count}</td>
        </tr>`)
        .join("");
};
const renderPlan = (plan) => `
  <tr>
    <td style="border-bottom:1px solid #e7edf5;padding:10px 8px 10px 0;vertical-align:top;">
      <strong style="color:#07142d;">${escapeHtml(plan.observation)}</strong><br>
      <span style="color:#617086;font-size:12px;">${escapeHtml(plan.plan)}</span>
    </td>
    <td style="border-bottom:1px solid #e7edf5;padding:10px 8px;vertical-align:top;white-space:nowrap;">${escapeHtml(plan.effectiveDueDate)}</td>
    <td style="border-bottom:1px solid #e7edf5;padding:10px 0 10px 8px;text-align:right;vertical-align:top;white-space:nowrap;"><span style="${emailSemanticBadgeStyle(plan.risk, plan.riskColorToken)};border-radius:999px;font-size:11px;font-weight:700;padding:4px 7px;">${escapeHtml(plan.risk)}</span><br><span style="color:#617086;font-size:11px;">${bucketLabel(plan.bucket)}</span></td>
  </tr>`;
export const deadlineReminderEmailTemplate = {
    name: "deadlineReminder",
    render: ({ brand, variables }) => {
        const appName = resolveEmailAppName(variables.appName ?? brand.appName);
        const visiblePlans = variables.plans.slice(0, MAX_VISIBLE_PLANS);
        const omittedPlans = Math.max(0, variables.plans.length - visiblePlans.length);
        const contentHtml = `
        <p style="margin:0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
        <p style="font-size:20px;font-weight:700;margin:0 0 12px;">Pendientes de seguimiento</p>
        <p style="margin:0 0 18px;">Al corte del <strong>${escapeHtml(variables.cutoffDate)}</strong>, <strong>Total pendientes: ${variables.plans.length}</strong> plan${variables.plans.length === 1 ? "" : "es"} en NIBOL.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;border-left:4px solid #d71920;border-collapse:collapse;margin:0 0 20px;padding:8px 12px;"><tr><td style="padding:12px;"><strong>Resumen</strong><br><span style="color:#516075;font-size:13px;line-height:1.7;">${variables.overdue} vencido${variables.overdue === 1 ? "" : "s"} · ${variables.dueToday} vence${variables.dueToday === 1 ? "" : "n"} hoy · ${variables.upcoming} próximo${variables.upcoming === 1 ? "" : "s"} · ${variables.reprogrammed} reprogramado${variables.reprogrammed === 1 ? "" : "s"}</span></td></tr></table>
        <p style="color:#07142d;font-size:14px;font-weight:700;margin:0 0 8px;">Riesgo de los pendientes</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;">${renderRiskSummary(variables.plans)}</table>
        <p style="color:#07142d;font-size:14px;font-weight:700;margin:0 0 8px;">Atención prioritaria</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 8px;"><tbody>${visiblePlans.map(renderPlan).join("")}</tbody></table>
        ${omittedPlans > 0 ? `<p style="color:#617086;font-size:12px;margin:8px 0 0;">Se muestran ${visiblePlans.length} pendientes prioritarios. Hay ${omittedPlans} adicional${omittedPlans === 1 ? "" : "es"} disponible${omittedPlans === 1 ? "" : "s"} en NIBOL.</p>` : ""}
        <p style="margin:24px 0;"><a href="${escapeHtml(variables.platformLink)}" style="background:#07142d;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Ver pendientes en NIBOL</a></p>
        <p style="color:#617086;font-size:12px;line-height:1.6;margin:0;">Este recordatorio ${escapeHtml(variables.roleCadence)} usa la fecha de compromiso efectiva, incluyendo reprogramaciones aprobadas. Mensaje generado por ${escapeHtml(appName)}.</p>`;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `${variables.subject} · ${variables.plans.length} pendientes`,
            }),
            subject: variables.subject,
            text: joinTextBlocks(greeting(variables.userName), `Tienes ${variables.plans.length} plan${variables.plans.length === 1 ? "" : "es"} pendiente${variables.plans.length === 1 ? "" : "s"} en NIBOL.`, `Resumen: ${variables.overdue} vencidos · ${variables.dueToday} vencen hoy · ${variables.upcoming} próximos · ${variables.reprogrammed} reprogramados.`, "Atención prioritaria:", ...visiblePlans.map((plan) => `${plan.observation} · ${plan.plan} · ${plan.effectiveDueDate} · ${plan.risk} · ${bucketLabel(plan.bucket)}`), ...(omittedPlans > 0
                ? [`${omittedPlans} pendientes adicionales disponibles en NIBOL.`]
                : []), `Ver pendientes en NIBOL: ${variables.platformLink}`, `Recordatorio ${variables.roleCadence} generado por ${appName}.`),
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
                riskColorToken: "high",
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
                riskColorToken: "medium",
            },
        ],
        platformLink: "https://app.example.com/planes-accion?filter.status=NOT_STARTED,STARTED,WITH_PROGRESS",
        reprogrammed: 1,
        roleCadence: "mensual",
        subject: "NIBOL · 2 pendientes requieren atención",
        upcoming: 0,
        userName: "Sandra",
    },
};
//# sourceMappingURL=deadline-reminder-email.js.map