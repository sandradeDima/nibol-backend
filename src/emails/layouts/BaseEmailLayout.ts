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
        alt="${escapeHtml(brand.appName)} logo"
        style="display: block; max-height: 40px; max-width: 180px;"
      />
    `;
  }

  return `
    <div
      style="
        align-items: center;
        background: ${brand.primaryColor}14;
        border: 1px dashed ${brand.primaryColor};
        border-radius: 10px;
        color: ${brand.primaryColor};
        display: inline-flex;
        font-size: 12px;
        font-weight: 700;
        height: 40px;
        justify-content: center;
        letter-spacing: 0.08em;
        min-width: 88px;
        padding: 0 16px;
        text-transform: uppercase;
      "
    >
      Logo
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
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(brand.appName)}</title>
      </head>
      <body style="background: #f4f7fb; color: #0f172a; font-family: Arial, sans-serif; margin: 0; padding: 24px 12px;">
        <div style="display: none; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">
          ${escapeHtml(previewText ?? `Notification from ${brand.appName}`)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
          <tr>
            <td align="center">
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                style="background: #ffffff; border: 1px solid #dbe3ef; border-radius: 18px; border-collapse: separate; max-width: 640px; overflow: hidden;"
              >
                <tr>
                  <td style="background: linear-gradient(135deg, ${brand.primaryColor}, #0f172a); padding: 28px 32px;">
                    <div style="margin-bottom: 20px;">${renderLogoMarkup(brand)}</div>
                    <div style="color: #ffffff; font-size: 26px; font-weight: 700; line-height: 1.2;">
                      ${escapeHtml(brand.appName)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 32px;">
                    <div style="color: #1e293b; font-size: 16px; line-height: 1.7;">
                      ${contentHtml}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px; line-height: 1.7; padding: 20px 32px 28px;">
                    <p style="margin: 0 0 8px;">Need help? Contact us at <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color: ${brand.primaryColor}; text-decoration: none;">${escapeHtml(brand.supportEmail)}</a>.</p>
                    <p style="margin: 0;">Sent by ${escapeHtml(brand.appName)}.</p>
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
