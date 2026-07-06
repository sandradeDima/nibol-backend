import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import type { EmailTemplateDefinition } from "../types/email-types.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";

export const emailVerificationEmailTemplate: EmailTemplateDefinition<"emailVerification"> =
  {
    name: "emailVerification",
    render: ({ brand, variables }) => {
      const appName = variables.appName?.trim() || brand.appName;
      const contentHtml = `
        <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
        <p style="margin: 0 0 16px;">Verify your email address to finish setting up your ${escapeHtml(appName)} account.</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapeHtml(variables.verificationLink)}"
            style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
          >
            Verify Email
          </a>
        </p>
        <p style="margin: 0 0 16px;">If the button does not work, open this link:</p>
        <p style="margin: 0;"><a href="${escapeHtml(variables.verificationLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.verificationLink)}</a></p>
      `;

      return {
        html: renderBaseEmailLayout({
          brand,
          contentHtml,
          previewText: `Verify your ${appName} email address.`,
        }),
        subject: `Verify your ${appName} account`,
        text: joinTextBlocks(
          greeting(variables.userName),
          `Verify your email address to finish setting up your ${appName} account.`,
          variables.verificationLink,
        ),
      };
    },
    sampleVariables: {
      appName: "SaaS Base Project",
      userName: "Taylor",
      verificationLink: "https://app.example.com/verify-email?token=demo",
    },
  };
