import "dotenv/config";

import { z } from "zod";

const DEVELOPMENT_AUTH_SECRET = "development-better-auth-secret-change-me";

const envSchema = z.object({
  APP_NAME: z
    .string()
    .min(1)
    .default("NIBOL | Sistema de Seguimiento de Riesgos"),
  BETTER_AUTH_SECRET: z.string().min(32).default(DEVELOPMENT_AUTH_SECRET),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
  CRON_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SMTP_FROM_EMAIL: z.email().default("no-reply@example.com"),
  SMTP_FROM_NAME: z.string().min(1).default("NIBOL"),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().min(1).optional(),
  WORKFLOW_TIMER_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100),
  WORKFLOW_TIMER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .default(60_000),
});

const parsedEnv = envSchema
  .superRefine((value, context) => {
    if (value.NODE_ENV !== "production") return;

    if (
      !process.env.BETTER_AUTH_SECRET ||
      value.BETTER_AUTH_SECRET === DEVELOPMENT_AUTH_SECRET
    ) {
      context.addIssue({
        code: "custom",
        message:
          "BETTER_AUTH_SECRET must be explicitly configured in production.",
        path: ["BETTER_AUTH_SECRET"],
      });
    }

    if (!process.env.BETTER_AUTH_URL) {
      context.addIssue({
        code: "custom",
        message: "BETTER_AUTH_URL must be explicitly configured in production.",
        path: ["BETTER_AUTH_URL"],
      });
    }

    if (!process.env.FRONTEND_URL) {
      context.addIssue({
        code: "custom",
        message: "FRONTEND_URL must be explicitly configured in production.",
        path: ["FRONTEND_URL"],
      });
    }
  })
  .safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues
    .map(({ path, message }) => `${path.join(".") || "env"}: ${message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration.\n${issues}`);
}

export const env = parsedEnv.data;

export type Env = typeof env;
