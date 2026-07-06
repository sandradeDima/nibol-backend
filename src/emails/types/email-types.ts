export type EmailAddress = string | { email: string; name?: string };

export type EmailAddressLike = EmailAddress | readonly EmailAddress[];

export type EmailProviderMode = "json" | "smtp";

export type InvitationEmailVariables = {
  appName?: string;
  expiresAt?: string;
  invitationLink: string;
  invitedByName?: string;
  roleName?: string;
  userName: string;
};

export type PasswordResetEmailVariables = {
  appName?: string;
  expiresIn?: string;
  resetLink: string;
  userName: string;
};

export type EmailVerificationEmailVariables = {
  appName?: string;
  userName: string;
  verificationLink: string;
};

export type GenericNotificationEmailVariables = {
  actionLabel?: string;
  actionLink?: string;
  appName?: string;
  message: string;
  title: string;
  userName: string;
};

export type WelcomeEmailVariables = {
  appName?: string;
  loginLink?: string;
  userName: string;
};

export interface EmailTemplateVariablesMap {
  emailVerification: EmailVerificationEmailVariables;
  genericNotification: GenericNotificationEmailVariables;
  invitation: InvitationEmailVariables;
  passwordReset: PasswordResetEmailVariables;
  welcome: WelcomeEmailVariables;
}

export type EmailTemplateName = keyof EmailTemplateVariablesMap;

export type EmailTemplateRequest<TTemplate extends EmailTemplateName = EmailTemplateName> = {
  bcc?: EmailAddressLike;
  cc?: EmailAddressLike;
  headers?: Record<string, string>;
  replyTo?: EmailAddressLike;
  template: TTemplate;
  to: EmailAddressLike;
  variables: EmailTemplateVariablesMap[TTemplate];
};

export type EmailTemplateRequestUnion = {
  [TTemplate in EmailTemplateName]: EmailTemplateRequest<TTemplate>;
}[EmailTemplateName];

export type EmailSendRequest = {
  bcc?: EmailAddressLike;
  cc?: EmailAddressLike;
  headers?: Record<string, string>;
  html: string;
  replyTo?: EmailAddressLike;
  subject: string;
  text: string;
  to: EmailAddressLike;
};

export type BulkEmailRequest = EmailSendRequest | EmailTemplateRequestUnion;

export type EmailBrandingSettings = {
  appName: string;
  logoUrl: string | null;
  primaryColor: string;
  senderEmail: string;
  senderName: string;
  supportEmail: string;
};

export type RenderedEmailTemplate = {
  html: string;
  previewText?: string;
  subject: string;
  text: string;
};

export type EmailTemplateRenderContext<TVariables> = {
  brand: EmailBrandingSettings;
  variables: TVariables;
};

export type EmailTemplateDefinition<TTemplate extends EmailTemplateName> = {
  name: TTemplate;
  render: (
    context: EmailTemplateRenderContext<EmailTemplateVariablesMap[TTemplate]>,
  ) => RenderedEmailTemplate;
  sampleVariables: EmailTemplateVariablesMap[TTemplate];
};

export type EmailSendResult = {
  accepted: string[];
  error?: string;
  messageId?: string;
  providerMode: EmailProviderMode;
  rejected: string[];
  subject: string;
  success: boolean;
  to: string[];
};

export type EmailBulkSendResult = {
  failedCount: number;
  results: EmailSendResult[];
  sentCount: number;
  success: boolean;
  total: number;
};

export type EmailConnectionResult = {
  error?: string;
  providerMode: EmailProviderMode;
  success: boolean;
};
