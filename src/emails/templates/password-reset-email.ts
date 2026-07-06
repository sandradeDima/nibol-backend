import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type { EmailTemplateDefinition } from "../types/email-types.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";

export const passwordResetEmailTemplate: EmailTemplateDefinition<"passwordReset"> = {
  name: "passwordReset",
  render: ({ brand, variables }) => {
    const appName = variables.appName?.trim() || brand.appName;
    const expiresInLine = variables.expiresIn
      ? `<p style="margin: 0 0 16px;">Este enlace vence en ${escapeHtml(variables.expiresIn)}.</p>`
      : "";
    const contentHtml = `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
      <p style="margin: 0 0 16px;">Recibimos una solicitud para restablecer la contrasena de su cuenta en ${escapeHtml(appName)}.</p>
      <p style="margin: 0 0 16px;">Si desea continuar, utilice el siguiente acceso seguro:</p>
      ${expiresInLine}
      <p style="margin: 24px 0;">
        <a
          href="${escapeHtml(variables.resetLink)}"
          style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
        >
          Restablecer contrasena
        </a>
      </p>
      <p style="margin: 0 0 16px;">Si usted no solicito este cambio, puede ignorar este mensaje con tranquilidad.</p>
      <p style="margin: 0 0 16px;">Si el boton no funciona, abra este enlace:</p>
      <p style="margin: 0;"><a href="${escapeHtml(variables.resetLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.resetLink)}</a></p>
    `;

    return {
      html: renderBaseEmailLayout({
        brand,
        contentHtml,
        previewText: `Restablezca su contrasena de ${appName}.`,
      }),
      subject: `Restablezca su contrasena de ${appName}`,
      text: joinTextBlocks(
        greeting(variables.userName),
        `Recibimos una solicitud para restablecer la contrasena de su cuenta en ${appName}.`,
        "Si desea continuar, utilice el siguiente acceso seguro.",
        variables.expiresIn ? `Este enlace vence en ${variables.expiresIn}.` : undefined,
        variables.resetLink,
        "Si usted no solicito este cambio, puede ignorar este mensaje con tranquilidad.",
      ),
    };
  },
  sampleVariables: {
    appName: "NIBOL | Sistema de Seguimiento de Riesgos",
    expiresIn: "60 minutos",
    resetLink: "https://app.example.com/reset-password?token=demo",
    userName: "Sandra",
  },
};
