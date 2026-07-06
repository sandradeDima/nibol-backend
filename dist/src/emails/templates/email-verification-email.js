import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";
export const emailVerificationEmailTemplate = {
    name: "emailVerification",
    render: ({ brand, variables }) => {
        const appName = variables.appName?.trim() || brand.appName;
        const contentHtml = `
        <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
        <p style="margin: 0 0 16px;">Confirme su correo electronico para activar su cuenta en ${escapeHtml(appName)}.</p>
        <p style="margin: 0 0 16px;">Este paso protege el acceso a la plataforma y valida que la direccion registrada le pertenece.</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(variables.verificationLink)}"
            style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
          >
            Verificar correo
          </a>
        </p>
        <p style="margin: 0 0 16px;">Si el boton no funciona, abra este enlace:</p>
        <p style="margin: 0;"><a href="${escapeHtml(variables.verificationLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.verificationLink)}</a></p>
      `;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `Verifique su cuenta en ${appName}.`,
            }),
            subject: `Verifique su cuenta de ${appName}`,
            text: joinTextBlocks(greeting(variables.userName), `Confirme su correo electronico para activar su cuenta en ${appName}.`, "Este paso protege el acceso a la plataforma y valida que la direccion registrada le pertenece.", variables.verificationLink),
        };
    },
    sampleVariables: {
        appName: "NIBOL | Sistema de Seguimiento de Riesgos",
        userName: "Sandra",
        verificationLink: "https://app.example.com/verify-email?token=demo",
    },
};
//# sourceMappingURL=email-verification-email.js.map