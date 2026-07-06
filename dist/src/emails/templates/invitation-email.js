import { renderBaseEmailLayout } from "../layouts/BaseEmailLayout.js";
import { escapeHtml, greeting, joinTextBlocks } from "../utils.js";
export const invitationEmailTemplate = {
    name: "invitation",
    render: ({ brand, variables }) => {
        const appName = variables.appName?.trim() || brand.appName;
        const roleLine = variables.roleName
            ? `<p style="margin: 0 0 16px;">You have been invited to join as <strong>${escapeHtml(variables.roleName)}</strong>.</p>`
            : "";
        const invitedByLine = variables.invitedByName
            ? `<p style="margin: 0 0 16px;">Invitation sent by ${escapeHtml(variables.invitedByName)}.</p>`
            : "";
        const expiryLine = variables.expiresAt
            ? `<p style="margin: 0 0 16px;">This invitation expires on ${escapeHtml(variables.expiresAt)}.</p>`
            : "";
        const contentHtml = `
      <p style="margin: 0 0 16px;">${escapeHtml(greeting(variables.userName))}</p>
      <p style="margin: 0 0 16px;">You have been invited to join ${escapeHtml(appName)}.</p>
      ${roleLine}
      ${invitedByLine}
      ${expiryLine}
      <p style="margin: 24px 0;">
        <a
          href="${escapeHtml(variables.invitationLink)}"
          style="background: ${brand.primaryColor}; border-radius: 10px; color: #ffffff; display: inline-block; font-weight: 700; padding: 14px 20px; text-decoration: none;"
        >
          Accept Invitation
        </a>
      </p>
      <p style="margin: 0 0 16px;">If the button does not work, open this link:</p>
      <p style="margin: 0;"><a href="${escapeHtml(variables.invitationLink)}" style="color: ${brand.primaryColor};">${escapeHtml(variables.invitationLink)}</a></p>
    `;
        return {
            html: renderBaseEmailLayout({
                brand,
                contentHtml,
                previewText: `You are invited to join ${appName}.`,
            }),
            subject: `You are invited to join ${appName}`,
            text: joinTextBlocks(greeting(variables.userName), `You have been invited to join ${appName}.`, variables.roleName ? `Role: ${variables.roleName}` : undefined, variables.invitedByName ? `Invitation sent by ${variables.invitedByName}.` : undefined, variables.expiresAt ? `Expires on ${variables.expiresAt}.` : undefined, variables.invitationLink),
        };
    },
    sampleVariables: {
        appName: "SaaS Base Project",
        expiresAt: "June 30, 2026",
        invitationLink: "https://app.example.com/invitations/accept?token=demo",
        invitedByName: "Admin User",
        roleName: "Admin",
        userName: "Taylor",
    },
};
//# sourceMappingURL=invitation-email.js.map