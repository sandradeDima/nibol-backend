import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type {
  DeadlineReminderEmailVariables,
  EmailTemplateDefinition,
} from "../types/email-types.js";
import {
  emailSemanticBadgeStyle,
  escapeHtml,
  joinTextBlocks,
  resolveEmailAppName,
} from "../utils.js";

const MAX_VISIBLE_PLANS = 8;

const deadlineBadgeStyle = (
  bucket: DeadlineReminderEmailVariables["plans"][number]["bucket"],
): string =>
  bucket === "OVERDUE"
    ? "background:#fee2e2;color:#991b1b"
    : "background:#fef3c7;color:#92400e";

const groupPlansByArea = (
  plans: readonly DeadlineReminderEmailVariables["plans"][number][],
): Array<{
  area: string;
  plans: DeadlineReminderEmailVariables["plans"][number][];
}> => {
  const groups = new Map<
    string,
    DeadlineReminderEmailVariables["plans"][number][]
  >();

  for (const plan of plans) {
    const area = plan.area.trim() || "Sin área asignada";
    const group = groups.get(area);
    if (group) {
      group.push(plan);
    } else {
      groups.set(area, [plan]);
    }
  }

  return [...groups].map(([area, groupedPlans]) => ({
    area,
    plans: groupedPlans,
  }));
};

const renderPlan = (
  plan: DeadlineReminderEmailVariables["plans"][number],
): string => `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d8e2ee;border-collapse:separate;margin:0 0 12px;">
    <tr>
      <td style="padding:14px 16px 8px;vertical-align:top;">
        <div style="color:#07142d;font-size:13px;font-weight:800;">${escapeHtml(plan.report)} · ${escapeHtml(plan.observation)}</div>
        <div style="color:#1b2940;font-size:16px;font-weight:750;line-height:1.35;margin-top:5px;">${escapeHtml(plan.plan)}</div>
        <div style="color:#617086;font-size:12px;line-height:1.55;margin-top:5px;">${escapeHtml(plan.description)}</div>
      </td>
      <td align="right" style="padding:14px 16px 8px;vertical-align:top;white-space:nowrap;">
        <span style="${emailSemanticBadgeStyle(plan.risk, plan.riskColorToken)};border-radius:999px;display:inline-block;font-size:11px;font-weight:700;padding:4px 8px;">${escapeHtml(plan.risk)}</span>
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

export const deadlineReminderEmailTemplate: EmailTemplateDefinition<"deadlineReminder"> =
  {
    name: "deadlineReminder",
    render: ({ brand, variables }) => {
      const appName = resolveEmailAppName(variables.appName ?? brand.appName);
      const visiblePlans = variables.plans.slice(0, MAX_VISIBLE_PLANS);
      const omittedPlans = Math.max(
        0,
        variables.plans.length - visiblePlans.length,
      );
      const areaGroups = groupPlansByArea(visiblePlans);
      const areaSections = areaGroups
        .map(
          ({ area, plans }) => `
            <h2 style="color:#07142d;font-size:17px;margin:26px 0 10px;">Área: ${escapeHtml(area)} <span style="color:#617086;font-size:13px;font-weight:600;">(${plans.length})</span></h2>
            ${plans.map(renderPlan).join("")}
          `,
        )
        .join("");
      const contentHtml = `
        <p style="margin:0 0 16px;">Buenas tardes, ${escapeHtml(variables.userName)}:</p>
        <p style="margin:0 0 18px;">Al corte del <strong>${escapeHtml(variables.cutoffDate)}</strong>, se identificaron los siguientes planes de acción que requieren seguimiento.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;border:1px solid #d8e2ee;border-collapse:collapse;margin:0 0 20px;"><tr><td style="border-top:3px solid #d71920;color:#1b2940;padding:14px 16px;"><strong>Resumen:</strong> ${variables.overdue} vencido${variables.overdue === 1 ? "" : "s"}, ${variables.dueToday} con vencimiento hoy y ${variables.upcoming} próximo${variables.upcoming === 1 ? "" : "s"} a vencer. Reprogramados: ${variables.reprogrammed}.</td></tr></table>
        ${areaSections}
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
        text: joinTextBlocks(
          `Buenas tardes, ${variables.userName}:`,
          `Al corte del ${variables.cutoffDate}, se identificaron los siguientes planes de acción que requieren seguimiento.`,
          `Resumen: ${variables.overdue} vencidos · ${variables.dueToday} vencen hoy · ${variables.upcoming} próximos · ${variables.reprogrammed} reprogramados.`,
          ...areaGroups.flatMap(({ area, plans }) => [
            `Área: ${area} (${plans.length})`,
            ...plans.map(
              (plan) =>
                `${plan.report} · ${plan.observation} · ${plan.plan} · Área: ${plan.area} · Fecha: ${plan.effectiveDueDate} · Estado: ${plan.deadlineStatus} · Avance: ${plan.officialProgress} ${plan.officialProgressPercent}% · Reprogramado: ${plan.reprogrammed ? "Sí" : "No"}`,
            ),
          ]),
          ...(omittedPlans > 0
            ? [`${omittedPlans} pendientes adicionales disponibles en NIBOL.`]
            : []),
          `Ver pendientes en NIBOL: ${variables.platformLink}`,
          `Recordatorio ${variables.roleCadence} generado por ${appName}.`,
        ),
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
      platformLink:
        "https://app.example.com/planes-accion?filter.status=NOT_STARTED,STARTED,WITH_PROGRESS",
      reprogrammed: 1,
      roleCadence: "mensual",
      subject: "NIBOL · 2 pendientes requieren atención",
      upcoming: 0,
      userName: "Sandra",
    },
  };
