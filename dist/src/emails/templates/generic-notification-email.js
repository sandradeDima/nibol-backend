import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { escapeHtml, greeting, joinTextBlocks, toParagraphHtml } from "../utils.js";
export const genericNotificationEmailTemplate = {
    name: "genericNotification",
    render: ({ brand, variables }) => {
        const appName = variables.appName?.trim() || brand.appName;
        const actionHtml = variables.actionLabel && variables.actionLink
            ? `
            <p style="margin: 24px 0;">
              <a
                href="${escapeHtml(variables.actionLink)}"
                style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
              >
                ${escapeHtml(variables.actionLabel)}
              </a>
            </p>
          `
            : "";
        const actionText = variables.actionLabel && variables.actionLink
            ? `${variables.actionLabel}: ${variables.actionLink}`
            : undefined;
        const contentHtml = `
        <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
        <p style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">${escapeHtml(variables.title)}</p>
        ${toParagraphHtml(variables.message)}
        ${actionHtml}
        <p style="margin: 16px 0 0;">Este mensaje fue generado por ${escapeHtml(appName)}.</p>
      `;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: variables.title,
            }),
            subject: variables.title,
            text: joinTextBlocks(greeting(variables.userName), variables.title, variables.message, actionText, `Este mensaje fue generado por ${appName}.`),
        };
    },
    sampleVariables: {
        actionLabel: "Ver detalle",
        actionLink: "https://app.example.com/notifications/demo",
        appName: "NIBOL | Sistema de Seguimiento de Riesgos",
        message: "Se registro una nueva actividad que requiere su atencion.\nAbra la plataforma para revisar la ultima actualizacion.",
        title: "Nueva notificacion",
        userName: "Sandra",
    },
};
//# sourceMappingURL=generic-notification-email.js.map