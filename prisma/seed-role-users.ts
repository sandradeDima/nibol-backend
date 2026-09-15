import "dotenv/config";

import bcrypt from "bcryptjs";
import { v5 as uuidv5 } from "uuid";

import {
  ADMIN_ROLE_CODE,
  ALL_PERMISSION_NAMES,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_NAMES,
  type RoleCode,
} from "../src/permissions/definitions.js";
import { prisma } from "../src/utils/prisma.js";
import { SEED_NAMESPACE } from "./admin-seed-config.js";

type RoleUser = {
  email: string;
  jobTitle: string;
  name: string;
  roleCode: RoleCode;
};

const isProduction = process.env.NODE_ENV === "production";
const rolePassword =
  process.env.SEED_ROLE_PASSWORD ??
  process.env.SEED_DEMO_PASSWORD ??
  (isProduction ? "" : "nibol-demo-local-change-me");
const adminPassword =
  process.env.SEED_ADMIN_PASSWORD ?? (isProduction ? "" : "Mipassword!");

if (
  rolePassword.length < 8 ||
  adminPassword.length < 8 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    process.env.SEED_ADMIN_EMAIL ?? "admin@gmail.com",
  )
) {
  throw new Error(
    "Set valid SEED_ROLE_PASSWORD, SEED_ADMIN_PASSWORD, and SEED_ADMIN_EMAIL values before seeding.",
  );
}

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@gmail.com";
const adminName = process.env.SEED_ADMIN_NAME ?? "System Administrator";

const roleUsers: RoleUser[] = [
  {
    email: adminEmail,
    jobTitle: "Administración técnica de la plataforma",
    name: adminName,
    roleCode: ADMIN_ROLE_CODE,
  },
  {
    email: "auditor@nibol.local",
    jobTitle: "Auditoría interna",
    name: "Auditor Demo",
    roleCode: "AUDITOR",
  },
  {
    email: "dueno.proceso@nibol.local",
    jobTitle: "Dueño del proceso de Finanzas",
    name: "Dueño Proceso Demo",
    roleCode: "PROCESS_OWNER",
  },
  {
    email: "responsable.area@nibol.local",
    jobTitle: "Responsable del área de Finanzas",
    name: "Responsable Área Demo",
    roleCode: "AREA_RESPONSIBLE",
  },
  {
    email: "ejecutor@nibol.local",
    jobTitle: "Ejecutor de planes de acción",
    name: "Ejecutor Demo",
    roleCode: "EXECUTOR",
  },
];

const getPassword = (roleCode: RoleCode): string =>
  roleCode === ADMIN_ROLE_CODE ? adminPassword : rolePassword;

const seed = async (): Promise<void> => {
  const summary = await prisma.$transaction(async (tx) => {
    const roleIds = new Map<RoleCode, string>();
    const permissionIds = new Map<string, string>();

    for (const role of ROLE_DEFINITIONS) {
      const record = await tx.role.upsert({
        create: {
          code: role.code,
          description: role.description,
          id: uuidv5(`role:${role.code}`, SEED_NAMESPACE),
          name: role.name,
        },
        update: {
          deletedAt: null,
          description: role.description,
          name: role.name,
        },
        where: { code: role.code },
      });

      roleIds.set(role.code, record.id);
    }

    for (const name of ALL_PERMISSION_NAMES) {
      const record = await tx.permission.upsert({
        create: {
          description: `${name} permission.`,
          id: uuidv5(`permission:${name}`, SEED_NAMESPACE),
          name,
        },
        update: {
          deletedAt: null,
          description: `${name} permission.`,
        },
        where: { name },
      });

      permissionIds.set(name, record.id);
    }

    for (const role of ROLE_DEFINITIONS) {
      const roleId = roleIds.get(role.code);
      if (!roleId) throw new Error(`Role ${role.code} was not seeded.`);

      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: ROLE_PERMISSION_NAMES[role.code].map((name) => {
          const permissionId = permissionIds.get(name);
          if (!permissionId) {
            throw new Error(`Permission ${name} was not seeded.`);
          }

          return {
            id: uuidv5(
              `role-permission:${roleId}:${permissionId}`,
              SEED_NAMESPACE,
            ),
            permissionId,
            roleId,
          };
        }),
      });
    }

    const users = [];

    for (const roleUser of roleUsers) {
      const roleId = roleIds.get(roleUser.roleCode);
      if (!roleId) {
        throw new Error(`Role ${roleUser.roleCode} was not seeded.`);
      }

      const password = await bcrypt.hash(getPassword(roleUser.roleCode), 12);
      const user = await tx.user.upsert({
        create: {
          avatar: null,
          deletedAt: null,
          email: roleUser.email,
          emailVerified: true,
          id: uuidv5(
            `role-user:${roleUser.email.toLowerCase()}`,
            SEED_NAMESPACE,
          ),
          isActive: true,
          jobTitle: roleUser.jobTitle,
          name: roleUser.name,
          password,
        },
        update: {
          avatar: null,
          deletedAt: null,
          emailVerified: true,
          isActive: true,
          jobTitle: roleUser.jobTitle,
          name: roleUser.name,
          password,
        },
        where: { email: roleUser.email },
      });

      const account = await tx.account.findFirst({
        select: { id: true },
        where: { providerId: "credential", userId: user.id },
      });

      if (account) {
        await tx.account.update({
          data: { accountId: user.id, password },
          where: { id: account.id },
        });
      } else {
        await tx.account.create({
          data: {
            accountId: user.id,
            id: uuidv5(
              `role-account:${roleUser.email.toLowerCase()}`,
              SEED_NAMESPACE,
            ),
            password,
            providerId: "credential",
            userId: user.id,
          },
        });
      }

      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.create({
        data: {
          id: uuidv5(`user-role:${user.id}:${roleId}`, SEED_NAMESPACE),
          roleId,
          userId: user.id,
        },
      });

      users.push({ email: user.email, role: roleUser.roleCode });
    }

    return { roles: roleUsers.length, users };
  });

  if (summary.users.length !== roleUsers.length) {
    throw new Error("Role user seeding verification failed.");
  }

  console.info(JSON.stringify(summary, null, 2));
};

void seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
