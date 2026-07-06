const greeting = (name) => {
    return name.trim() ? `Hi ${name},` : "Hi,";
};
export const buildVerificationEmail = ({ appName, name, url, }) => {
    return {
        html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <p>${greeting(name)}</p>
        <p>Verify your email address to finish setting up your ${appName} account.</p>
        <p>
          <a href="${url}" style="display: inline-block; padding: 12px 18px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
            Verify Email
          </a>
        </p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${url}">${url}</a></p>
      </div>
    `,
        subject: `Verify your ${appName} account`,
        text: `${greeting(name)}\n\nVerify your email address to finish setting up your ${appName} account.\n\n${url}`,
    };
};
export const buildPasswordResetEmail = ({ appName, name, url, }) => {
    return {
        html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
        <p>${greeting(name)}</p>
        <p>We received a request to reset your ${appName} password.</p>
        <p>
          <a href="${url}" style="display: inline-block; padding: 12px 18px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 8px;">
            Reset Password
          </a>
        </p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${url}">${url}</a></p>
      </div>
    `,
        subject: `Reset your ${appName} password`,
        text: `${greeting(name)}\n\nWe received a request to reset your ${appName} password.\n\n${url}\n\nIf you did not request this, you can safely ignore this email.`,
    };
};
//# sourceMappingURL=auth-emails.js.map