import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";
export const invitationEmailTemplate = {
    name: "invitation",
    render: ({ brand, variables }) => {
        const appName = variables.appName?.trim() || brand.appName;
        const roleLine = variables.roleName
            ? `<p style="margin: 0 0 16px;">Su acceso quedara habilitado con el rol <strong>${escapeHtml(variables.roleName)}</strong>.</p>`
            : "";
        const invitedByLine = variables.invitedByName
            ? `<p style="margin: 0 0 16px;">Invitacion enviada por ${escapeHtml(variables.invitedByName)}.</p>`
            : "";
        const expiryLine = variables.expiresAt
            ? `<p style="margin: 0 0 16px;">Esta invitacion vence el ${escapeHtml(variables.expiresAt)}.</p>`
            : "";
        const contentHtml = `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
      <p style="margin: 0 0 16px;">Ha recibido una invitacion para ingresar a ${escapeHtml(appName)}.</p>
      <p style="margin: 0 0 16px;">Complete el proceso para activar su cuenta y comenzar a operar dentro de la plataforma.</p>
      ${roleLine}
      ${invitedByLine}
      ${expiryLine}
      <p style="margin: 24px 0;">
        <a
          href="${escapeHtml(variables.invitationLink)}"
          style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
        >
          Aceptar invitacion
        </a>
      </p>
      <p style="margin: 0 0 16px;">Si el boton no funciona, abra este enlace:</p>
      <p style="margin: 0;"><a href="${escapeHtml(variables.invitationLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.invitationLink)}</a></p>
    `;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `Tiene una invitacion pendiente en ${appName}.`,
            }),
            subject: `Invitacion de acceso a ${appName}`,
            text: joinTextBlocks(greeting(variables.userName), `Ha recibido una invitacion para ingresar a ${appName}.`, "Complete el proceso para activar su cuenta y comenzar a operar dentro de la plataforma.", variables.roleName ? `Rol asignado: ${variables.roleName}.` : undefined, variables.invitedByName ? `Invitacion enviada por ${variables.invitedByName}.` : undefined, variables.expiresAt ? `Esta invitacion vence el ${variables.expiresAt}.` : undefined, variables.invitationLink),
        };
    },
    sampleVariables: {
        appName: "NIBOL | Sistema de Seguimiento de Riesgos",
        expiresAt: "30 de junio de 2026",
        invitationLink: "https://app.example.com/invitations/accept?token=demo",
        invitedByName: "Administrador NIBOL",
        roleName: "Administrador",
        userName: "Sandra",
    },
};
//# sourceMappingURL=invitation-email.js.map