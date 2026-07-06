import type { EmailTemplateDefinition, EmailTemplateName } from "../types/email-types.js";
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
} satisfies {
  [TTemplate in EmailTemplateName]: EmailTemplateDefinition<TTemplate>;
};

export const emailTemplateNames = Object.keys(
  emailTemplateDefinitions,
) as EmailTemplateName[];

export const isEmailTemplateName = (value: string): value is EmailTemplateName => {
  return value in emailTemplateDefinitions;
};
