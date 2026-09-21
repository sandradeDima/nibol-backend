import { prismaAdapter } from "@better-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import type { Response } from "express";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { toNodeHandler } from "better-auth/node";

import { activityLogService } from "../../services/activity-log-service.js";
import { notificationService } from "../../services/notification-service.js";
import { env } from "../../utils/env.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../utils/prisma.js";
import {
  EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
  sendVerificationEmailToUser,
} from "./verification-email.js";
import { emailService } from "../../emails/EmailService.js";

const syncCredentialPassword = async (
  userId: string,
  password: string | null | undefined,
): Promise<void> => {
  if (!password) {
    return;
  }

  await prisma.user.update({
    data: {
      password,
    },
    where: {
      id: userId,
    },
  });
};

const getRequestIpAddress = (request?: Request): string | null => {
  if (!request) {
    return null;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.headers.get("x-real-ip");
};

const getRequestEmail = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null || !("email" in body)) {
    return null;
  }

  const email = body["email"];
  return typeof email === "string" && email.trim().length > 0
    ? email.trim()
    : null;
};

const microsoftProvider =
  env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
    ? {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        disableDefaultScope: true,
        disableProfilePhoto: true,
        disableSignUp: true,
        mapProfileToUser: (profile: {
          email?: string;
          preferred_username: string;
        }) => ({
          email: profile.email ?? profile.preferred_username,
        }),
        redirectURI: `${env.FRONTEND_URL}/api/auth/callback/microsoft`,
        scope: ["openid", "profile", "email"],
        tenantId: env.MICROSOFT_TENANT_ID,
      }
    : undefined;

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "mysql",
    transaction: true,
  }),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["microsoft"],
    },
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === "credential") {
            await syncCredentialPassword(account.userId, account.password);
          }
        },
      },
      update: {
        after: async (account) => {
          if (account.providerId === "credential") {
            await syncCredentialPassword(account.userId, account.password);
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            select: {
              deletedAt: true,
              isActive: true,
            },
            where: {
              id: session.userId,
            },
          });

          if (!user?.isActive || user.deletedAt) {
            throw APIError.from("FORBIDDEN", {
              code: "ACCOUNT_INACTIVE",
              message: "This account is inactive.",
            });
          }
        },
        after: async (session) => {
          await prisma.user.update({
            data: {
              lastLoginAt: new Date(),
            },
            where: {
              id: session.userId,
            },
          });
        },
      },
    },
  },
  emailAndPassword: {
    autoSignIn: false,
    enabled: true,
    onPasswordReset: async ({ user }) => {
      void notificationService
        .create({
          message:
            "Your password was reset successfully. If this wasn't you, contact support immediately.",
          title: "Password reset",
          type: "warning",
          userId: user.id,
        })
        .catch((error: unknown) => {
          logger.error("Failed to create password reset notification.", {
            error: error instanceof Error ? error.message : String(error),
            userId: user.id,
          });
        });
    },
    password: {
      hash: async (password) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ url, user }) => {
      await emailService.sendTemplate({
        template: "passwordReset",
        to: user.email,
        variables: {
          expiresIn: "60 minutes",
          resetLink: url,
          userName: user.name,
        },
      });
    },
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ url, user }) => {
      await sendVerificationEmailToUser(
        {
          email: user.email,
          name: user.name,
        },
        url,
      );
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const ipAddress = getRequestIpAddress(ctx.request);
      const email = getRequestEmail(ctx.body);
      const response = ctx.context.returned;

      if (ctx.path === "/sign-in/email") {
        if (response instanceof APIError) {
          await activityLogService.logSystemEvent({
            action: "Login failure",
            entityType: "authentication",
            ipAddress,
            metadata: {
              email,
              reason: response.message,
              summary: email
                ? `A login attempt failed for ${email}.`
                : "A login attempt failed.",
            },
          });

          return;
        }

        if (ctx.context.newSession) {
          await activityLogService.logUserAction({
            action: "Login success",
            entityId: ctx.context.newSession.user.id,
            entityType: "authentication",
            ipAddress:
              ctx.context.newSession.session.ipAddress ?? ipAddress ?? null,
            metadata: {
              email: ctx.context.newSession.user.email,
              summary: `${ctx.context.newSession.user.email} signed in successfully.`,
            },
            userId: ctx.context.newSession.user.id,
          });
        }

        return;
      }

      if (
        ctx.path === "/sign-out" &&
        !(response instanceof APIError) &&
        ctx.context.session
      ) {
        await activityLogService.logUserAction({
          action: "Logout success",
          entityId: ctx.context.session.user.id,
          entityType: "authentication",
          ipAddress: ctx.context.session.session.ipAddress ?? ipAddress ?? null,
          metadata: {
            email: ctx.context.session.user.email,
            summary: `${ctx.context.session.user.email} signed out successfully.`,
          },
          userId: ctx.context.session.user.id,
        });

        return;
      }

      if (
        ctx.path === "/sign-up/email" &&
        !(response instanceof APIError) &&
        ctx.context.newSession
      ) {
        await activityLogService.logUserAction({
          action: "User created",
          entityId: ctx.context.newSession.user.id,
          entityType: "user",
          ipAddress:
            ctx.context.newSession.session.ipAddress ?? ipAddress ?? null,
          metadata: {
            email: ctx.context.newSession.user.email,
            summary: `${ctx.context.newSession.user.email} registered a new account.`,
          },
          userId: ctx.context.newSession.user.id,
        });
      }
    }),
  },
  secret: env.BETTER_AUTH_SECRET,
  socialProviders: microsoftProvider
    ? {
        microsoft: microsoftProvider,
      }
    : undefined,
  trustedOrigins: [env.FRONTEND_URL],
  user: {
    fields: {
      image: "avatar",
    },
  },
});

export type AuthSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export const authHandler = toNodeHandler(auth);

export const appendAuthHeaders = (
  response: Response,
  headers: Headers,
): void => {
  const headerBag = headers as Headers & {
    getSetCookie?: () => string[];
  };

  for (const setCookie of headerBag.getSetCookie?.() ?? []) {
    response.append("set-cookie", setCookie);
  }

  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      return;
    }

    response.append(key, value);
  });
};

logger.info("Better Auth configured.", {
  baseUrl: env.BETTER_AUTH_URL,
});
