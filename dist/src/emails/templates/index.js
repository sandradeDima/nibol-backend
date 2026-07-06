import { emailVerificationEmailTemplate } from "./email-verification-email.js";
import { genericNotificationEmailTemplate } from "./generic-notification-email.js";
import { invitationEmailTemplate } from "./invitation-email.js";
import { passwordResetEmailTemplate } from "./password-reset-email.js";
import { welcomeEmailTemplate } from "./welcome-email.js";
export const emailTemplateDefinitions = {
    emailVerification: emailVerificationEmailTemplate,
    genericNotification: genericNotificationEmailTemplate,
    invitation: invitationEmailTemplate,
    passwordReset: passwordResetEmailTemplate,
    welcome: welcomeEmailTemplate,
};
export const emailTemplateNames = Object.keys(emailTemplateDefinitions);
export const isEmailTemplateName = (value) => {
    return value in emailTemplateDefinitions;
};
//# sourceMappingURL=index.js.map