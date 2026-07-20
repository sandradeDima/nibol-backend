import nodemailer from "nodemailer";
import { env } from "../utils/env.js";
const isSmtpConfigured = Boolean(env.SMTP_HOST &&
    env.SMTP_PORT &&
    env.SMTP_USER &&
    (env.SMTP_PASSWORD || env.SMTP_PASS));
const toStringArray = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry) => typeof entry === "string");
};
const toNodemailerAddress = (address) => {
    if (typeof address === "string") {
        return address;
    }
    return {
        address: address.email,
        name: address.name,
    };
};
const isEmailAddressArray = (address) => {
    return Array.isArray(address);
};
const toNodemailerAddressLike = (address) => {
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
    providerMode = isSmtpConfigured ? "smtp" : "json";
    transport = isSmtpConfigured
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
    get mode() {
        return this.providerMode;
    }
    async send(message) {
        const payload = {
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
        const info = await new Promise((resolve, reject) => {
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
    async verifyConnection() {
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
//# sourceMappingURL=EmailProvider.js.map