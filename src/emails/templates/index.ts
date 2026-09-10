import type {
  EmailTemplateDefinition,
  EmailTemplateName,
} from "../types/email-types.js";
import { automationNotificationEmailTemplate } from "./automation-notification-email.js";
import { deadlineReminderEmailTemplate } from "./deadline-reminder-email.js";
import { emailVerificationEmailTemplate } from "./email-verification-email.js";
import { genericNotificationEmailTemplate } from "./generic-notification-email.js";
import { observationAssignmentEmailTemplate } from "./observation-assignment-email.js";
import { invitationEmailTemplate } from "./invitation-email.js";
import { passwordResetEmailTemplate } from "./password-reset-email.js";
import { welcomeEmailTemplate } from "./welcome-email.js";

export const emailTemplateDefinitions = {
  automationNotification: automationNotificationEmailTemplate,
  deadlineReminder: deadlineReminderEmailTemplate,
  emailVerification: emailVerificationEmailTemplate,
  genericNotification: genericNotificationEmailTemplate,
  observationAssignment: observationAssignmentEmailTemplate,
  invitation: invitationEmailTemplate,
  passwordReset: passwordResetEmailTemplate,
  welcome: welcomeEmailTemplate,
} satisfies {
  [TTemplate in EmailTemplateName]: EmailTemplateDefinition<TTemplate>;
};

export const emailTemplateNames = Object.keys(
  emailTemplateDefinitions,
) as EmailTemplateName[];

export const isEmailTemplateName = (
  value: string,
): value is EmailTemplateName => {
  return value in emailTemplateDefinitions;
};
