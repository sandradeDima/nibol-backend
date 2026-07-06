import { createEmailVerificationToken } from "better-auth/api";
import { emailService } from "../../emails/EmailService.js";
import { AppError } from "../../utils/app-error.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60 * 24;
export const DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL = "/login?verified=1";
const trimTrailingSlash = (value) => value.replace(/\/$/, "");
const getAuthBaseUrl = () => {
    const url = new URL(env.BETTER_AUTH_URL);
    const pathname = trimTrailingSlash(url.pathname);
    url.pathname = pathname.endsWith("/api/auth")
        ? pathname
        : pathname.endsWith("/api")
            ? `${pathname}/auth`
            : `${pathname || ""}/api/auth`;
    return url;
};
const redactSensitiveUrl = (value) => {
    const url = new URL(value);
    if (url.searchParams.has("token")) {
        url.searchParams.set("token", "[redacted]");
    }
    return url.toString();
};
export const buildEmailVerificationLink = async (email, callbackURL = DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL) => {
    const token = await createEmailVerificationToken(env.BETTER_AUTH_SECRET, email, undefined, EMAIL_VERIFICATION_EXPIRES_IN_SECONDS);
    const url = new URL("verify-email", `${trimTrailingSlash(getAuthBaseUrl().toString())}/`);
    url.searchParams.set("callbackURL", callbackURL);
    url.searchParams.set("token", token);
    return url.toString();
};
export const sendVerificationEmailToUser = async (user, verificationLink) => {
    const result = await emailService.sendTemplate({
        template: "emailVerification",
        to: user.email,
        variables: {
            userName: user.name,
            verificationLink,
        },
    });
    if (result.success) {
        logger.info("Verification email processed.", {
            deliveryMode: result.providerMode === "json" ? "captured" : "sent",
            email: user.email,
            messageId: result.messageId,
            providerMode: result.providerMode,
            subject: result.subject,
            to: result.to,
            userName: user.name,
            verificationLink: redactSensitiveUrl(verificationLink),
        });
        return;
    }
    const metadata = {
        accepted: result.accepted,
        email: user.email,
        error: result.error,
        providerMode: result.providerMode,
        rejected: result.rejected,
        subject: result.subject,
        to: result.to,
        userName: user.name,
        verificationLink: redactSensitiveUrl(verificationLink),
    };
    logger.error("Verification email delivery failed.", metadata);
    throw new AppError("No se pudo enviar el correo de verificacion.", 502, metadata);
};
export const resendVerificationEmailToUser = async (user, callbackURL = DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL) => {
    const verificationLink = await buildEmailVerificationLink(user.email, callbackURL);
    await sendVerificationEmailToUser(user, verificationLink);
};
//# sourceMappingURL=verification-email.js.map