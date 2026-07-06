import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type { EmailTemplateDefinition } from "../types/email-types.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";

export const welcomeEmailTemplate: EmailTemplateDefinition<"welcome"> = {
  name: "welcome",
  render: ({ brand, variables }) => {
    const appName = variables.appName?.trim() || brand.appName;
    const loginHtml = variables.loginLink
      ? `
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(variables.loginLink)}"
            style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
          >
            Ir a la plataforma
          </a>
        </p>
        <p style="margin: 0 0 16px;">Si el boton no funciona, abra este enlace:</p>
        <p style="margin: 0;"><a href="${escapeHtml(variables.loginLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.loginLink)}</a></p>
      `
      : "";

    return {
      html: renderBaseEmailLayout({
        brand,
        contentHtml: `
          <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
          <p style="margin: 0 0 16px;">Bienvenido a ${escapeHtml(appName)}.</p>
          <p style="margin: 0 0 16px;">Su cuenta ya esta lista y puede comenzar a usar la plataforma de inmediato.</p>
          ${loginHtml}
        `,
        previewText: `Bienvenido a ${appName}.`,
      }),
      subject: `Bienvenido a ${appName}`,
      text: joinTextBlocks(
        greeting(variables.userName),
        `Bienvenido a ${appName}.`,
        "Su cuenta ya esta lista y puede comenzar a usar la plataforma de inmediato.",
        variables.loginLink,
      ),
    };
  },
  sampleVariables: {
    appName: "NIBOL | Sistema de Seguimiento de Riesgos",
    loginLink: "https://app.example.com/login",
    userName: "Sandra",
  },
};
