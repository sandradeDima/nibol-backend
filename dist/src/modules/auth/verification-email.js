import { createEmailVerificationToken } from "better-auth/api";
import { emailService } from "../../emails/EmailService.js";
import { AppError } from "../../utils/app-error.js";
import { env } from "../../utils/env.js";
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
    if (!result.success) {
        throw new AppError("No se pudo enviar el correo de verificacion.", 502);
    }
};
export const resendVerificationEmailToUser = async (user, callbackURL = DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL) => {
    const verificationLink = await buildEmailVerificationLink(user.email, callbackURL);
    await sendVerificationEmailToUser(user, verificationLink);
};
//# sourceMappingURL=verification-email.js.map