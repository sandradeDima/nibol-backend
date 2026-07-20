import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer/index.js";

import type {
  EmailAddress,
  EmailAddressLike,
  EmailConnectionResult,
  EmailProviderMode,
  EmailSendRequest,
} from "./types/email-types.js";
import { env } from "../utils/env.js";

type ProviderSendRequest = EmailSendRequest & {
  from: EmailAddress;
};

type ProviderSendResult = {
  accepted: string[];
  messageId?: string;
  providerMode: EmailProviderMode;
  rejected: string[];
};

const isSmtpConfigured = Boolean(
  env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    (env.SMTP_PASSWORD || env.SMTP_PASS),
);

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const toNodemailerAddress = (address: EmailAddress): string | Mail.Address => {
  if (typeof address === "string") {
    return address;
  }

  return {
    address: address.email,
    name: address.name,
  };
};

const isEmailAddressArray = (
  address: EmailAddressLike,
): address is readonly EmailAddress[] => {
  return Array.isArray(address);
};

const toNodemailerAddressLike = (
  address: EmailAddressLike | undefined,
): string | Mail.Address | Array<string | Mail.Address> | undefined => {
  if (!address) {
    return undefined;
  }

  return isEmailAddressArray(address)
    ? address.map((entry) => toNodemailerAddress(entry))
    : toNodemailerAddress(address);
};

/**
 * Wraps Nodemailer so the rest of the application only depends on this provider boundary.
 */
export class EmailProvider {
  private readonly providerMode: EmailProviderMode = isSmtpConfigured ? "smtp" : "json";

  private readonly transport = isSmtpConfigured
    ? nodemailer.createTransport({
        auth: {
          pass: env.SMTP_PASSWORD ?? env.SMTP_PASS,
          user: env.SMTP_USER,
        },
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
      })
    : nodemailer.createTransport({
        jsonTransport: true,
      });

  public get mode(): EmailProviderMode {
    return this.providerMode;
  }

  public async send(message: ProviderSendRequest): Promise<ProviderSendResult> {
    const payload: Mail.Options = {
      from: toNodemailerAddress(message.from),
      html: message.html,
      subject: message.subject,
      text: message.text,
      to: toNodemailerAddressLike(message.to),
    };

    if (message.bcc) {
      payload.bcc = toNodemailerAddressLike(message.bcc);
    }

    if (message.cc) {
      payload.cc = toNodemailerAddressLike(message.cc);
    }

    if (message.headers) {
      payload.headers = message.headers;
    }

    if (message.replyTo) {
      payload.replyTo = toNodemailerAddressLike(message.replyTo);
    }

    const info = await new Promise<nodemailer.SentMessageInfo>((resolve, reject) => {
      this.transport.sendMail(payload, (error, sentMessageInfo) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(sentMessageInfo);
      });
    });

    return {
      accepted: toStringArray(info.accepted),
      messageId: typeof info.messageId === "string" ? info.messageId : undefined,
      providerMode: this.providerMode,
      rejected: toStringArray(info.rejected),
    };
  }

  public async verifyConnection(): Promise<EmailConnectionResult> {
    if (this.providerMode === "json") {
      return {
        providerMode: this.providerMode,
        success: true,
      };
    }

    await this.transport.verify();

    return {
      providerMode: this.providerMode,
      success: true,
    };
  }
}

export const emailProvider = new EmailProvider();
