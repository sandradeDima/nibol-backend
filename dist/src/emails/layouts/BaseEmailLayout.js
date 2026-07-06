import { escapeHtml } from "../utils.js";
const renderLogoMarkup = (brand) => {
    if (brand.logoUrl) {
        return `
      <img
        src="${escapeHtml(brand.logoUrl)}"
        alt="Logo de ${escapeHtml(brand.appName)}"
        style="display: block; max-height: 42px; max-width: 190px;"
      />
    `;
    }
    return `
    <div
      style="
        align-items: center;
        background: #07142d;
        border-radius: 999px;
        color: #ffffff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 800;
        justify-content: center;
        letter-spacing: 0.18em;
        min-width: 88px;
        padding: 11px 18px;
        text-transform: uppercase;
      "
    >
      ${escapeHtml(brand.senderName || brand.appName)}
    </div>
  `;
};
export const renderBaseEmailLayout = ({ brand, contentHtml, previewText, }) => {
    return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(brand.appName)}</title>
      </head>
      <body style="background: #edf2f7; color: #07142d; font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 28px 12px;">
        <div style="display: none; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
          ${escapeHtml(previewText ?? `Notificacion de ${brand.appName}`)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
          <tr>
            <td align="center">
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                style="background: #ffffff; border: 1px solid #d8e2ee; border-radius: 22px; border-collapse: separate; max-width: 640px; overflow: hidden;"
              >
                <tr>
                  <td style="background: #d71920; font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="background: linear-gradient(180deg, #07142d 0%, #0b1a36 100%); padding: 30px 32px 28px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 22px;">
                      <div>${renderLogoMarkup(brand)}</div>
                      <div style="color: #f3f5f8; font-size: 11px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase;">
                        Nibol Digital
                      </div>
                    </div>
                    <div style="color: #ffffff; font-size: 28px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.15;">
                      ${escapeHtml(brand.appName)}
                    </div>
                    <div style="color: #c7d2e3; font-size: 13px; line-height: 1.6; margin-top: 8px;">
                      Comunicacion automatica para operaciones, accesos y seguimiento corporativo.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 34px 32px;">
                    <div style="color: #1b2940; font-size: 16px; line-height: 1.75;">
                      ${contentHtml}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px solid #e2e8f0; color: #516075; font-size: 13px; line-height: 1.7; padding: 22px 32px 30px;">
                    <p style="margin: 0 0 8px;">
                      Si necesita ayuda, escribanos a
                      <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color: ${brand.primaryColor}; font-weight: 700; text-decoration: none;">${escapeHtml(brand.supportEmail)}</a>.
                    </p>
                    <p style="margin: 0;">Mensaje enviado por ${escapeHtml(brand.senderName || brand.appName)}.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};
//# sourceMappingURL=BaseEmailLayout.js.map