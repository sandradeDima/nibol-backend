import type { EmailBrandingSettings } from "../types/email-types.js";
import { escapeHtml } from "../utils.js";

type BaseEmailLayoutInput = {
  brand: EmailBrandingSettings;
  contentHtml: string;
  previewText?: string;
};

const renderLogoMarkup = (brand: EmailBrandingSettings): string => {
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
    <div style="color:#ffffff;font-size:16px;font-weight:800;letter-spacing:.16em;line-height:1.2;text-transform:uppercase;">
      NIBOL BOLIVIA
    </div>
  `;
};

export const renderBaseEmailLayout = ({
  brand,
  contentHtml,
  previewText,
}: BaseEmailLayoutInput): string => {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(brand.appName)}</title>
      </head>
      <body style="background:#edf2f7;color:#07142d;font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:28px 12px;">
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
                style="background:#ffffff;border:1px solid #d8e2ee;border-collapse:separate;max-width:680px;overflow:hidden;"
              >
                <tr>
                  <td style="background: #d71920; font-size: 0; line-height: 0; padding: 0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="background:#07142d;padding:30px 32px 28px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:22px;"><tr><td>${renderLogoMarkup(brand)}</td><td align="right" style="color:#c7d2e3;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">Seguimiento de Hallazgos de Auditoría</td></tr></table>
                    <div style="color:#ffffff;font-size:26px;font-weight:750;letter-spacing:-.02em;line-height:1.15;">NIBOL Bolivia</div>
                    <div style="color:#c7d2e3;font-size:13px;line-height:1.6;margin-top:8px;">Comunicación corporativa de Auditoría Interna.</div>
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
                    <p style="margin:0;">Departamento de Auditoría · NIBOL Bolivia</p>
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
