import "dotenv/config";

import bcrypt from "bcryptjs";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

import {
  ADMIN_ROLE_NAME,
  buildPermissionName,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
} from "../src/permissions/definitions.js";
import { logger } from "../src/utils/logger.js";
import { prisma } from "../src/utils/prisma.js";

const SEED_NAMESPACE = "f7f9b6d0-5603-4ce2-a745-9dceb8bbf57f";

const seedAdminEnvSchema = z.object({
  SEED_ADMIN_NAME: z.string().min(1).default("System Administrator"),
  SEED_ADMIN_EMAIL: z.email().default("admin@gmail.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8).default("Mipassword!"),
});

const env = seedAdminEnvSchema.parse(process.env);

const ids = {
  adminAccount: uuidv5("account:default-admin", SEED_NAMESPACE),
  adminRole: uuidv5("role:admin", SEED_NAMESPACE),
  adminUser: uuidv5("user:default-admin", SEED_NAMESPACE),
};

const adminPermissions = PERMISSION_RESOURCES.flatMap((resource) =>
  PERMISSION_ACTIONS.map((action) => ({
    description: `${resource} ${action} permission.`,
    id: uuidv5(`permission:${buildPermissionName(resource, action)}`, SEED_NAMESPACE),
    name: buildPermissionName(resource, action),
  })),
);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const recreateAdmin = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12);

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

    const user = await tx.user.upsert({
      create: {
        avatar: null,
        deletedAt: null,
        email: env.SEED_ADMIN_EMAIL,
        emailVerified: true,
        id: ids.adminUser,
        isActive: true,
        name: env.SEED_ADMIN_NAME,
        password: passwordHash,
      },
      update: {
        avatar: null,
        deletedAt: null,
        emailVerified: true,
        isActive: true,
        name: env.SEED_ADMIN_NAME,
        password: passwordHash,
      },
      where: {
        email: env.SEED_ADMIN_EMAIL,
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
    } else {
      await tx.account.create({
        data: {
          accountId: user.id,
          id: ids.adminAccount,
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

    return {
      email: user.email,
      permissions: adminPermissions.length,
      role: role.name,
      userId: user.id,
    };
  });

  logger.info("Cuenta administradora recreada.", summary);
};

void recreateAdmin()
  .catch((error: unknown) => {
    logger.error("No se pudo recrear la cuenta administradora.", {
      error: getErrorMessage(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
