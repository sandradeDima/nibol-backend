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
            Open ${escapeHtml(appName)}
          </a>
        </p>
        <p style="margin: 0 0 16px;">If the button does not work, open this link:</p>
        <p style="margin: 0;"><a href="${escapeHtml(variables.loginLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.loginLink)}</a></p>
      `
      : "";

    return {
      html: renderBaseEmailLayout({
        brand,
        contentHtml: `
          <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
          <p style="margin: 0 0 16px;">Welcome to ${escapeHtml(appName)}.</p>
          <p style="margin: 0 0 16px;">Your account is ready and you can start using the application right away.</p>
          ${loginHtml}
        `,
        previewText: `Welcome to ${appName}.`,
      }),
      subject: `Welcome to ${appName}`,
      text: joinTextBlocks(
        greeting(variables.userName),
        `Welcome to ${appName}.`,
        "Your account is ready and you can start using the application right away.",
        variables.loginLink,
      ),
    };
  },
  sampleVariables: {
    appName: "SaaS Base Project",
    loginLink: "https://app.example.com/login",
    userName: "Taylor",
  },
};
