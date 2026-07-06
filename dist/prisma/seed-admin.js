import "dotenv/config";
import bcrypt from "bcryptjs";
import { v5 as uuidv5 } from "uuid";
import { getAdminSeedIds, resolveAdminSeedConfigs, SEED_NAMESPACE, } from "./admin-seed-config.js";
import { ADMIN_ROLE_NAME, buildPermissionName, PERMISSION_ACTIONS, PERMISSION_RESOURCES, } from "../src/permissions/definitions.js";
import { logger } from "../src/utils/logger.js";
import { prisma } from "../src/utils/prisma.js";
const adminSeeds = resolveAdminSeedConfigs(process.env);
const ids = {
    adminRole: uuidv5("role:admin", SEED_NAMESPACE),
};
const adminPermissions = PERMISSION_RESOURCES.flatMap((resource) => PERMISSION_ACTIONS.map((action) => ({
    description: `${resource} ${action} permission.`,
    id: uuidv5(`permission:${buildPermissionName(resource, action)}`, SEED_NAMESPACE),
    name: buildPermissionName(resource, action),
})));
const getErrorMessage = (error) => {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
};
const recreateAdmin = async () => {
    const summary = await prisma.$transaction(async (tx) => {
        const role = await tx.role.upsert({
            create: {
                description: "Full access to the application.",
                id: ids.adminRole,
                name: ADMIN_ROLE_NAME,
            },
            update: {
                deletedAt: null,
                description: "Full access to the application.",
            },
            where: {
                name: ADMIN_ROLE_NAME,
            },
        });
        for (const permission of adminPermissions) {
            await tx.permission.upsert({
                create: {
                    description: permission.description,
                    id: permission.id,
                    name: permission.name,
                },
                update: {
                    deletedAt: null,
                    description: permission.description,
                },
                where: {
                    name: permission.name,
                },
            });
            await tx.rolePermission.upsert({
                create: {
                    id: uuidv5(`role-permission:${role.id}:${permission.id}`, SEED_NAMESPACE),
                    permissionId: permission.id,
                    roleId: role.id,
                },
                update: {},
                where: {
                    roleId_permissionId: {
                        permissionId: permission.id,
                        roleId: role.id,
                    },
                },
            });
        }
        const admins = [];
        for (const adminSeed of adminSeeds) {
            const passwordHash = await bcrypt.hash(adminSeed.password, 12);
            const adminSeedIds = getAdminSeedIds(adminSeed);
            const user = await tx.user.upsert({
                create: {
                    avatar: null,
                    deletedAt: null,
                    email: adminSeed.email,
                    emailVerified: true,
                    id: adminSeedIds.userId,
                    isActive: true,
                    name: adminSeed.name,
                    password: passwordHash,
                },
                update: {
                    avatar: null,
                    deletedAt: null,
                    emailVerified: true,
                    isActive: true,
                    name: adminSeed.name,
                    password: passwordHash,
                },
                where: {
                    email: adminSeed.email,
                },
            });
            const existingCredentialAccount = await tx.account.findFirst({
                select: {
                    id: true,
                },
                where: {
                    providerId: "credential",
                    userId: user.id,
                },
            });
            if (existingCredentialAccount) {
                await tx.account.update({
                    data: {
                        accessToken: null,
                        accessTokenExpiresAt: null,
                        accountId: user.id,
                        idToken: null,
                        password: passwordHash,
                        refreshToken: null,
                        refreshTokenExpiresAt: null,
                        scope: null,
                        userId: user.id,
                    },
                    where: {
                        id: existingCredentialAccount.id,
                    },
                });
            }
            else {
                await tx.account.create({
                    data: {
                        accountId: user.id,
                        id: adminSeedIds.accountId,
                        password: passwordHash,
                        providerId: "credential",
                        userId: user.id,
                    },
                });
            }
            await tx.userRole.upsert({
                create: {
                    id: uuidv5(`user-role:${user.id}:${role.id}`, SEED_NAMESPACE),
                    roleId: role.id,
                    userId: user.id,
                },
                update: {},
                where: {
                    userId_roleId: {
                        roleId: role.id,
                        userId: user.id,
                    },
                },
            });
            admins.push({
                email: user.email,
                source: adminSeed.source,
                userId: user.id,
            });
        }
        return {
            admins,
            adminCount: admins.length,
            permissions: adminPermissions.length,
            role: role.name,
        };
    });
    logger.info("Cuentas administradoras aseguradas.", summary);
};
void recreateAdmin()
    .catch((error) => {
    logger.error("No se pudo recrear la cuenta administradora.", {
        error: getErrorMessage(error),
    });
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-admin.js.map