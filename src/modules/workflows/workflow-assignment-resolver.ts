import type { Prisma } from "../../../generated/prisma/client.js";

import {
  getAllowlistedRuntimeReference,
  type WorkflowRuntimeContext,
} from "./workflow-runtime-context.js";
import type { WorkflowNodeConfiguration } from "./workflows.validators.js";

type RuntimeDatabase = Prisma.TransactionClient;
type HumanNodeConfiguration = Extract<
  WorkflowNodeConfiguration,
  { nodeType: "STAGE" | "APPROVAL" }
>;

export type AssignmentResolution = {
  assignedAreaId?: string;
  assignedRoleId?: string;
  assignedUserId?: string;
  fallbackApplied: boolean;
  fallbackReason?: string;
  strategy: string;
};

const cleanReference = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getActiveUser = async (db: RuntimeDatabase, id: string) =>
  db.user.findFirst({
    select: { id: true },
    where: { deletedAt: null, id, isActive: true },
  });

const getActiveRole = async (db: RuntimeDatabase, id: string) =>
  db.role.findFirst({
    select: { id: true },
    where: { deletedAt: null, id },
  });

const getActiveArea = async (db: RuntimeDatabase, id: string) =>
  db.area.findFirst({
    select: {
      id: true,
      managerUser: {
        select: { deletedAt: true, id: true, isActive: true },
      },
    },
    where: { active: true, deletedAt: null, id },
  });

const userResolution = (
  strategy: string,
  userId: string,
  fallbackApplied = false,
  fallbackReason?: string,
): AssignmentResolution => ({
  assignedUserId: userId,
  ...(fallbackReason ? { fallbackReason } : {}),
  fallbackApplied,
  strategy,
});

const roleResolution = (
  strategy: string,
  roleId: string,
  fallbackApplied = false,
  fallbackReason?: string,
): AssignmentResolution => ({
  assignedRoleId: roleId,
  ...(fallbackReason ? { fallbackReason } : {}),
  fallbackApplied,
  strategy,
});

const areaResolution = (
  strategy: string,
  areaId: string,
  managerUserId: string,
  fallbackApplied = false,
  fallbackReason?: string,
): AssignmentResolution => ({
  assignedAreaId: areaId,
  assignedUserId: managerUserId,
  ...(fallbackReason ? { fallbackReason } : {}),
  fallbackApplied,
  strategy,
});

const resolveConfiguredUser = async (
  db: RuntimeDatabase,
  strategy: string,
  userId: string | null,
): Promise<AssignmentResolution | null> => {
  if (!userId) return null;
  const user = await getActiveUser(db, userId);
  return user ? userResolution(strategy, user.id) : null;
};

const resolveConfiguredRole = async (
  db: RuntimeDatabase,
  strategy: string,
  roleId: string | null,
): Promise<AssignmentResolution | null> => {
  if (!roleId) return null;
  const role = await getActiveRole(db, roleId);
  return role ? roleResolution(strategy, role.id) : null;
};

const resolveConfiguredArea = async (
  db: RuntimeDatabase,
  strategy: string,
  areaId: string | null,
): Promise<AssignmentResolution | null> => {
  if (!areaId) return null;
  const area = await getActiveArea(db, areaId);
  const manager = area?.managerUser;
  if (!area || !manager || !manager.isActive || manager.deletedAt) return null;
  return areaResolution(strategy, area.id, manager.id);
};

const resolveDirectAssignment = async (
  db: RuntimeDatabase,
  configuration: HumanNodeConfiguration,
  context: WorkflowRuntimeContext,
): Promise<AssignmentResolution | null> => {
  const strategy = configuration.assignmentStrategy as
    | string
    | null
    | undefined;
  switch (strategy) {
    case "FIXED_USER":
      return resolveConfiguredUser(
        db,
        strategy,
        cleanReference(configuration.userId),
      );
    case "ROLE":
      return resolveConfiguredRole(
        db,
        strategy,
        cleanReference(configuration.roleId),
      );
    case "AREA":
      return resolveConfiguredArea(
        db,
        strategy,
        cleanReference(configuration.areaId) ?? cleanReference(context.areaId),
      );
    case "RECORD_OWNER":
      return resolveConfiguredUser(
        db,
        strategy,
        cleanReference(context.custom.recordOwnerUserId),
      );
    case "OBSERVATION_RESPONSIBLE":
      return resolveConfiguredUser(
        db,
        strategy,
        cleanReference(context.responsibleUserId) ??
          cleanReference(context.custom.observationResponsibleUserId),
      );
    case "REQUESTER":
      return resolveConfiguredUser(
        db,
        strategy,
        cleanReference(context.requesterUserId),
      );
    case "SUPERVISOR":
      return resolveConfiguredArea(
        db,
        strategy,
        cleanReference(configuration.areaId) ?? cleanReference(context.areaId),
      );
    case "FIELD_REFERENCE":
      return resolveConfiguredUser(
        db,
        strategy,
        getAllowlistedRuntimeReference(context, configuration.fieldReference),
      );
    case null:
    case undefined:
    default:
      return null;
  }
};

const resolveFallback = async (
  db: RuntimeDatabase,
  configuration: HumanNodeConfiguration,
  reason: string,
): Promise<AssignmentResolution | null> => {
  switch (configuration.fallbackStrategy) {
    case "USER": {
      const resolved = await resolveConfiguredUser(
        db,
        "FALLBACK_USER",
        cleanReference(configuration.fallbackUserId),
      );
      return resolved
        ? {
            ...resolved,
            fallbackApplied: true,
            fallbackReason: reason,
          }
        : null;
    }
    case "ROLE": {
      const resolved = await resolveConfiguredRole(
        db,
        "FALLBACK_ROLE",
        cleanReference(configuration.fallbackRoleId),
      );
      return resolved
        ? {
            ...resolved,
            fallbackApplied: true,
            fallbackReason: reason,
          }
        : null;
    }
    case "ADMINISTRATOR": {
      const adminRole = await db.role.findFirst({
        select: { id: true },
        where: { deletedAt: null, name: "Admin" },
      });
      return adminRole
        ? roleResolution("FALLBACK_ADMINISTRATOR", adminRole.id, true, reason)
        : null;
    }
    case "STOP":
    case null:
    case undefined:
      return null;
  }
};

export const resolveRuntimeAssignment = async ({
  configuration,
  context,
  db,
}: {
  configuration: HumanNodeConfiguration;
  context: WorkflowRuntimeContext;
  db: RuntimeDatabase;
}): Promise<AssignmentResolution> => {
  const direct = await resolveDirectAssignment(db, configuration, context);
  if (direct) return direct;

  const strategy = (configuration.assignmentStrategy ?? "UNASSIGNED") as string;
  const reason =
    strategy === "MANAGEMENT"
      ? "La estrategia MANAGEMENT no está disponible en el runtime."
      : `No se pudo resolver la asignación ${strategy}.`;
  const fallback = await resolveFallback(db, configuration, reason);
  if (fallback) return fallback;

  return {
    fallbackApplied: false,
    fallbackReason: reason,
    strategy,
  };
};
