import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
    APP_NAME: z
        .string()
        .min(1)
        .default("NIBOL | Sistema de Seguimiento de Riesgos"),
    BETTER_AUTH_SECRET: z
        .string()
        .min(32)
        .default("development-better-auth-secret-change-me"),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    SMTP_FROM_EMAIL: z.email().default("no-reply@example.com"),
    SMTP_FROM_NAME: z.string().min(1).default("NIBOL"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: z.coerce.boolean().default(false),
    SMTP_USER: z.string().min(1).optional(),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    const issues = parsedEnv.error.issues
        .map(({ path, message }) => `${path.join(".") || "env"}: ${message}`)
        .join("\n");
    throw new Error(`Invalid environment configuration.\n${issues}`);
}
export const env = parsedEnv.data;
//# sourceMappingURL=env.js.map