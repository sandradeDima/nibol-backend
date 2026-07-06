import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
export const SEED_NAMESPACE = "f7f9b6d0-5603-4ce2-a745-9dceb8bbf57f";
export const DEFAULT_ADMIN_SEED = {
    email: "admin@gmail.com",
    name: "System Administrator",
    password: "Mipassword!",
    source: "default",
};
const adminSeedEnvSchema = z.object({
    SEED_ADMIN_NAME: z.string().min(1).optional(),
    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});
const normalizeEmail = (email) => email.trim().toLowerCase();
export const resolveAdminSeedConfigs = (rawEnv) => {
    const env = adminSeedEnvSchema.parse(rawEnv);
    const adminSeeds = [DEFAULT_ADMIN_SEED];
    if (!env.SEED_ADMIN_EMAIL) {
        return adminSeeds;
    }
    if (normalizeEmail(env.SEED_ADMIN_EMAIL) === normalizeEmail(DEFAULT_ADMIN_SEED.email)) {
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
export const getPrimaryAdminSeed = (adminSeeds) => {
    return adminSeeds.find((adminSeed) => adminSeed.source === "env") ?? adminSeeds[0];
};
export const getAdminSeedIds = (adminSeed) => {
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
//# sourceMappingURL=admin-seed-config.js.map