import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

export const SEED_NAMESPACE = "f7f9b6d0-5603-4ce2-a745-9dceb8bbf57f";

export const DEFAULT_ADMIN_SEED = {
  email: "admin@gmail.com",
  name: "System Administrator",
  password: "Mipassword!",
  source: "default",
} as const;

const adminSeedEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SEED_ADMIN_NAME: z.string().min(1).optional(),
  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type AdminSeedConfig = {
  email: string;
  name: string;
  password: string;
  source: "default" | "env";
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const resolveAdminSeedConfigs = (
  rawEnv: NodeJS.ProcessEnv,
): AdminSeedConfig[] => {
  const env = adminSeedEnvSchema.parse(rawEnv);
  if (env.NODE_ENV === "production") {
    if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
      throw new Error(
        "Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD explicitly before production seeding.",
      );
    }
    return [
      {
        email: env.SEED_ADMIN_EMAIL,
        name: env.SEED_ADMIN_NAME ?? DEFAULT_ADMIN_SEED.name,
        password: env.SEED_ADMIN_PASSWORD,
        source: "env",
      },
    ];
  }

  const defaultSeed = {
    ...DEFAULT_ADMIN_SEED,
    ...(env.SEED_ADMIN_NAME ? { name: env.SEED_ADMIN_NAME } : {}),
    ...(env.SEED_ADMIN_PASSWORD ? { password: env.SEED_ADMIN_PASSWORD } : {}),
  };
  const adminSeeds: AdminSeedConfig[] = [defaultSeed];

  if (!env.SEED_ADMIN_EMAIL) {
    return adminSeeds;
  }

  if (
    normalizeEmail(env.SEED_ADMIN_EMAIL) ===
    normalizeEmail(DEFAULT_ADMIN_SEED.email)
  ) {
    return adminSeeds;
  }

  adminSeeds.push({
    email: env.SEED_ADMIN_EMAIL,
    name: env.SEED_ADMIN_NAME ?? DEFAULT_ADMIN_SEED.name,
    password: env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_SEED.password,
    source: "env",
  });

  return adminSeeds;
};

export const getPrimaryAdminSeed = (
  adminSeeds: AdminSeedConfig[],
): AdminSeedConfig => {
  return (
    adminSeeds.find((adminSeed) => adminSeed.source === "env") ?? adminSeeds[0]!
  );
};

export const getAdminSeedIds = (
  adminSeed: AdminSeedConfig,
): {
  accountId: string;
  userId: string;
} => {
  if (adminSeed.source === "default") {
    return {
      accountId: uuidv5("account:default-admin", SEED_NAMESPACE),
      userId: uuidv5("user:default-admin", SEED_NAMESPACE),
    };
  }

  const normalizedEmail = normalizeEmail(adminSeed.email);

  return {
    accountId: uuidv5(`account:admin:${normalizedEmail}`, SEED_NAMESPACE),
    userId: uuidv5(`user:admin:${normalizedEmail}`, SEED_NAMESPACE),
  };
};
