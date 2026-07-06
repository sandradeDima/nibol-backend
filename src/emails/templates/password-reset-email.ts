import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type { EmailTemplateDefinition } from "../types/email-types.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";

export const passwordResetEmailTemplate: EmailTemplateDefinition<"passwordReset"> = {
  name: "passwordReset",
  render: ({ brand, variables }) => {
    const appName = variables.appName?.trim() || brand.appName;
    const expiresInLine = variables.expiresIn
      ? `<p style="margin: 0 0 16px;">This reset link expires in ${escapeHtml(variables.expiresIn)}.</p>`
      : "";
    const contentHtml = `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
      <p style="margin: 0 0 16px;">We received a request to reset your ${escapeHtml(appName)} password.</p>
      ${expiresInLine}
      <p style="margin: 24px 0;">
        <a
          href="${escapeHtml(variables.resetLink)}"
          style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
        >
          Reset Password
        </a>
      </p>
      <p style="margin: 0 0 16px;">If you did not request this, you can safely ignore this email.</p>
      <p style="margin: 0 0 16px;">If the button does not work, open this link:</p>
      <p style="margin: 0;"><a href="${escapeHtml(variables.resetLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.resetLink)}</a></p>
    `;

    return {
      html: renderBaseEmailLayout({
        brand,
        contentHtml,
        previewText: `Reset your ${appName} password.`,
      }),
      subject: `Reset your ${appName} password`,
      text: joinTextBlocks(
        greeting(variables.userName),
        `We received a request to reset your ${appName} password.`,
        variables.expiresIn ? `This reset link expires in ${variables.expiresIn}.` : undefined,
        variables.resetLink,
        "If you did not request this, you can safely ignore this email.",
      ),
    };
  },
  sampleVariables: {
    appName: "SaaS Base Project",
    expiresIn: "60 minutes",
    resetLink: "https://app.example.com/reset-password?token=demo",
    userName: "Taylor",
  },
};
