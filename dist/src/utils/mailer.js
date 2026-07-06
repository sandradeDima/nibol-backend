import nodemailer from "nodemailer";
import { env } from "./env.js";
import { logger } from "./logger.js";
const isSmtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS);
const transport = isSmtpConfigured
    ? nodemailer.createTransport({
        auth: {
            pass: env.SMTP_PASS,
            user: env.SMTP_USER,
        },
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
    })
    : nodemailer.createTransport({
        jsonTransport: true,
    });
export const sendMail = async ({ html, subject, text, to, }) => {
    const info = await transport.sendMail({
        from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
        html,
        subject,
        text,
        to,
    });
    if (!isSmtpConfigured) {
        logger.info("Email captured by JSON transport.", {
            messageId: info.messageId,
            subject,
            to,
        });
    }
};
//# sourceMappingURL=mailer.js.map