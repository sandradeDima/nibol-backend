import { createEmailVerificationToken } from "better-auth/api";

import { emailService } from "../../emails/EmailService.js";
import { AppError } from "../../utils/app-error.js";
import { env } from "../../utils/env.js";

export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60 * 24;
export const DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL = "/login?verified=1";

type VerificationEmailUser = {
  email: string;
  name: string;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, "");

const getAuthBaseUrl = (): URL => {
  const url = new URL(env.BETTER_AUTH_URL);
  const pathname = trimTrailingSlash(url.pathname);

  url.pathname = pathname.endsWith("/api/auth")
    ? pathname
    : pathname.endsWith("/api")
      ? `${pathname}/auth`
      : `${pathname || ""}/api/auth`;

  return url;
};

export const buildEmailVerificationLink = async (
  email: string,
  callbackURL = DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL,
): Promise<string> => {
  const token = await createEmailVerificationToken(
    env.BETTER_AUTH_SECRET,
    email,
    undefined,
    EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
  );
  const url = new URL("verify-email", `${trimTrailingSlash(getAuthBaseUrl().toString())}/`);

  url.searchParams.set("callbackURL", callbackURL);
  url.searchParams.set("token", token);

  return url.toString();
};

export const sendVerificationEmailToUser = async (
  user: VerificationEmailUser,
  verificationLink: string,
): Promise<void> => {
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

export const resendVerificationEmailToUser = async (
  user: VerificationEmailUser,
  callbackURL = DEFAULT_EMAIL_VERIFICATION_CALLBACK_URL,
): Promise<void> => {
  const verificationLink = await buildEmailVerificationLink(user.email, callbackURL);

  await sendVerificationEmailToUser(user, verificationLink);
};
