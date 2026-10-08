import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type {
  DeadlineReminderEmailVariables,
  EmailTemplateDefinition,
} from "../types/email-types.js";
import {
  emailRiskColor,
  escapeHtml,
  joinTextBlocks,
  resolveEmailAppName,
} from "../utils.js";

type ReminderPlan = DeadlineReminderEmailVariables["plans"][number];

const groupPlansByArea = (plans: readonly ReminderPlan[]) => {
  const groups = new Map<string, ReminderPlan[]>();
  for (const plan of plans) {
    const area = plan.area.trim() || "Sin área asignada";
    groups.set(area, [...(groups.get(area) ?? []), plan]);
  }
  return [...groups].map(([area, areaPlans]) => {
    const observations = new Map<string, ReminderPlan[]>();
    for (const plan of areaPlans) {
      observations.set(plan.observationId, [
        ...(observations.get(plan.observationId) ?? []),
        plan,
      ]);
    }
    const statusCounts = [0, 0, 0, 0];
    const riskCounts = [0, 0, 0, 0];
    for (const observationPlans of observations.values()) {
      const progress = Math.min(
        ...observationPlans.map((plan) => plan.officialProgressPercent),
      );
      statusCounts[
        progress >= 100 ? 3 : progress >= 60 ? 2 : progress > 0 ? 1 : 0
      ]! += 1;
      const riskPlan = observationPlans[0]!;
      const color = emailRiskColor(riskPlan.risk, riskPlan.riskColorToken);
      riskCounts[
        color === "#027A48"
          ? 0
          : color === "#DC6803"
            ? 1
            : color === "#D92D20"
              ? 2
              : 3
      ]! += 1;
    }
    return { area, count: observations.size, riskCounts, statusCounts };
  });
};

const renderChart = (
  title: string,
  rows: Array<{ label: string; count: number; color: string }>,
): string => {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return `
    <div style="font-size:10px;font-weight:700;margin:0 0 12px;text-align:center;">${title}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${rows
        .map(
          ({ label, count, color }) => `<tr>
        <td style="color:#555;font-size:11px;padding:5px 8px 5px 0;text-align:right;white-space:nowrap;width:104px;">${label}</td>
        <td style="border-left:1px solid #d4d4d4;padding:5px 0 5px 6px;">
          <div style="background:${color};color:#07142d;font-size:11px;font-weight:700;line-height:18px;min-width:22px;text-align:center;width:${Math.max(22, Math.round((count / maximum) * 120))}px;">${count}</div>
        </td>
      </tr>`,
        )
        .join("")}
    </table>`;
};

export const deadlineReminderEmailTemplate: EmailTemplateDefinition<"deadlineReminder"> =
  {
    name: "deadlineReminder",
    render: ({ brand, variables }) => {
      const appName = resolveEmailAppName(variables.appName ?? brand.appName);
      const areas = groupPlansByArea(variables.plans);
      const areaSections = areas
        .map(
          ({ area, count, riskCounts, statusCounts }) => `
      <div style="background:#c91000;color:#fff;font-size:14px;font-weight:700;margin:24px 0 0;padding:5px 8px;">${escapeHtml(area.toUpperCase())} &nbsp; ${count} Observacion${count === 1 ? "" : "es"}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #e0e0e0;margin:0 0 16px;table-layout:fixed;"><tr>
        <td width="50%" style="border-right:1px solid #d4d4d4;padding:12px 6px;vertical-align:top;">${renderChart(
          "ESTATUS AVANCE PLAN DE REMEDIACIÓN",
          [
            {
              label: "No iniciado (NI)",
              count: statusCounts[0]!,
              color: "#eff000",
            },
            {
              label: "Iniciado (I)",
              count: statusCounts[1]!,
              color: "#38b6e9",
            },
            {
              label: "Con avance (CA)",
              count: statusCounts[2]!,
              color: "#ffba00",
            },
            {
              label: "Concluido (CO)",
              count: statusCounts[3]!,
              color: "#1db65f",
            },
          ],
        )}</td>
        <td width="50%" style="padding:12px 6px;vertical-align:top;">${renderChart(
          "CALIFICACIÓN DEL RIESGO",
          [
            { label: "Bajo", count: riskCounts[0]!, color: "#1db65f" },
            { label: "Medio", count: riskCounts[1]!, color: "#eff000" },
            { label: "Alto", count: riskCounts[2]!, color: "#f21d0c" },
            ...(riskCounts[3]
              ? [{ label: "Otro", count: riskCounts[3]!, color: "#94a3b8" }]
              : []),
          ],
        )}</td>
      </tr></table>`,
        )
        .join("");
      const contentHtml = `
      <div style="background:#c91000;color:#fff;font-size:14px;font-weight:700;line-height:1.3;margin:0 0 24px;padding:7px 10px;text-align:center;">Responsable de área / Dueño de proceso / Ejecutor</div>
      <p style="margin:0 0 20px;">Buenas tardes estimados:</p>
      <p style="margin:0 0 20px;">A la fecha, las siguientes observaciones permanecen pendientes de cierre:</p>
      ${areaSections}
      <p style="margin:24px 0;"><a href="${escapeHtml(variables.platformLink)}" style="background:#07142d;border-radius:8px;color:#ffffff;display:inline-block;font-weight:700;padding:13px 18px;text-decoration:none;">Ver pendientes en NIBOL</a></p>
      <p style="color:#617086;font-size:12px;line-height:1.6;margin:0;">Este recordatorio ${escapeHtml(variables.roleCadence)} se genera con corte calendario y utiliza la fecha de compromiso efectiva. Este mensaje fue generado por ${escapeHtml(appName)}.</p>`;
      return {
        html: renderBaseEmailLayout({
          brand,
          contentHtml,
          previewText: variables.subject,
        }),
        subject: variables.subject,
        text: joinTextBlocks(
          "Responsable de área / Dueño de proceso / Ejecutor",
          "Buenas tardes estimados:",
          "A la fecha, las siguientes observaciones permanecen pendientes de cierre:",
          ...areas.map(
            ({ area, count, riskCounts, statusCounts }) =>
              `${area.toUpperCase()} · ${count} Observacion${count === 1 ? "" : "es"}\nEstatus avance plan de remediación: No iniciado ${statusCounts[0]}, Iniciado ${statusCounts[1]}, Con avance ${statusCounts[2]}, Concluido ${statusCounts[3]}\nCalificación del riesgo: Bajo ${riskCounts[0]}, Medio ${riskCounts[1]}, Alto ${riskCounts[2]}${riskCounts[3] ? `, Otro ${riskCounts[3]}` : ""}`,
          ),
          `Ver pendientes en NIBOL: ${variables.platformLink}`,
          `Este recordatorio ${variables.roleCadence} se genera con corte calendario y utiliza la fecha de compromiso efectiva. Este mensaje fue generado por ${appName}.`,
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
          observationId: "sample-obs-003",
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
          observationId: "sample-obs-004",
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
