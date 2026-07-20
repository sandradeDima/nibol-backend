import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";
export const automationNotificationEmailTemplate = {
    name: "automationNotification",
    render: ({ brand, variables }) => {
        const appName = variables.appName?.trim() || brand.appName;
        const details = [
            ["Código", variables.code],
            ["Área responsable", variables.areaName],
            ["Fecha límite", variables.dueDate],
            ["Estado actual", variables.currentStatus],
        ];
        const detailsHtml = details
            .map(([label, value]) => `
          <tr>
            <td style="border-bottom: 1px solid #e7edf5; color: #617086; font-size: 12px; font-weight: 700; padding: 10px 12px 10px 0; text-transform: uppercase;">${escapeHtml(label)}</td>
            <td style="border-bottom: 1px solid #e7edf5; color: #1b2940; font-size: 14px; font-weight: 600; padding: 10px 0;">${escapeHtml(value)}</td>
          </tr>
        `)
            .join("");
        const contentHtml = `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
      <p style="font-size: 21px; font-weight: 750; margin: 0 0 12px;">${escapeHtml(variables.title)}</p>
      <p style="margin: 0 0 20px;">${escapeHtml(variables.description)}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0 0 22px;">
        ${detailsHtml}
      </table>
      <p style="background: #fff4e5; border: 1px solid #f3d8a9; color: #6c4617; margin: 0 0 22px; padding: 14px 16px;"><strong>Acción requerida:</strong> ${escapeHtml(variables.actionRequired)}</p>
      <p style="margin: 0 0 18px;"><a href="${escapeHtml(variables.targetUrl)}" style="background: ${brand.primaryColor}; color: #ffffff; display: inline-block; font-weight: 700; padding: 13px 18px; text-decoration: none;">Abrir en NIBOL</a></p>
      <p style="color: #617086; font-size: 12px; margin: 0;">Esta es una notificación automática de ${escapeHtml(appName)}. No adjuntamos archivos de evidencia.</p>
    `;
        return {
            html: renderBaseEmailLayout({ brand, contentHtml, previewText: variables.title }),
            subject: `${variables.title} · ${variables.code}`,
            text: joinTextBlocks(greeting(variables.userName), variables.title, variables.description, `Código: ${variables.code}`, `Área responsable: ${variables.areaName}`, `Fecha límite: ${variables.dueDate}`, `Estado actual: ${variables.currentStatus}`, `Acción requerida: ${variables.actionRequired}`, `Abrir en NIBOL: ${variables.targetUrl}`, `Esta es una notificación automática de ${appName}. No adjuntamos archivos de evidencia.`),
        };
    },
    sampleVariables: {
        actionRequired: "Ingrese al sistema y actualice el avance correspondiente.",
        appName: "NIBOL | Sistema de Seguimiento de Riesgos",
        areaName: "Operaciones",
        code: "OBS-2026-001",
        currentStatus: "En seguimiento",
        description: "La fecha límite se encuentra próxima y requiere atención.",
        dueDate: "30/07/2026",
        targetUrl: "https://app.example.com/observaciones/demo",
        title: "Próximo vencimiento",
        userName: "Sandra",
    },
};
//# sourceMappingURL=automation-notification-email.js.map