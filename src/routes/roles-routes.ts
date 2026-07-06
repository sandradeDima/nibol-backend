import { Router } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/authorization-middleware.js";
import { rolesService } from "../services/roles-service.js";
import { prisma } from "../utils/prisma.js";
import { AppError } from "../utils/app-error.js";
import { getRequestLogActorContext } from "../utils/request-context.js";
import { sendPaginated, sendSuccess } from "../utils/response.js";
import {
  createRoleSchema,
  listRolesQuerySchema,
  roleIdParamSchema,
  updateRoleSchema,
} from "../validators/roles-validator.js";

export const rolesRouter = Router();

const getQueryValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];

    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return undefined;
};

const getRequiredRoleId = (value: string | string[] | undefined): string => {
  const roleId = Array.isArray(value) ? value[0] : value;

  if (!roleId) {
    throw new AppError("Role id is required.", 400);
  }

  return roleIdParamSchema.parse({
    id: roleId,
  }).id;
};

rolesRouter.get(
  "/roles/options",
  requireAnyPermission([
    "users.create",
    "users.edit",
    "users.view",
    "invitations.create",
    "invitations.edit",
    "invitations.view",
  ]),
  asyncHandler(async (_request, response) => {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: "asc",
      },
      select: {
        description: true,
        id: true,
        name: true,
      },
      where: {
        deletedAt: null,
      },
    });

    sendSuccess(response, roles);
  }),
);

rolesRouter.get(
  "/roles",
  requirePermission("roles.view"),
  asyncHandler(async (request, response) => {
    const query = listRolesQuerySchema.parse({
      page: getQueryValue(request.query.page),
      perPage: getQueryValue(request.query.perPage),
      search: getQueryValue(request.query.search),
      sortBy: getQueryValue(request.query.sortBy),
      sortDirection: getQueryValue(request.query.sortDirection),
    });

    const result = await rolesService.listRoles(query);

    sendPaginated(response, result.data, result.pagination);
  }),
);

rolesRouter.get(
  "/roles/:roleId",
  requirePermission("roles.view"),
  asyncHandler(async (request, response) => {
    const role = await rolesService.getRoleById(
      getRequiredRoleId(request.params.roleId),
    );

    sendSuccess(response, role);
  }),
);

rolesRouter.post(
  "/roles",
  requirePermission("roles.create"),
  asyncHandler(async (request, response) => {
    const payload = createRoleSchema.parse(request.body);
    const role = await rolesService.createRole(
      payload,
      getRequestLogActorContext(request),
    );

    sendSuccess(response, role, 201);
  }),
);

rolesRouter.put(
  "/roles/:roleId",
  requirePermission("roles.edit"),
  asyncHandler(async (request, response) => {
    const payload = updateRoleSchema.parse(request.body);
    const role = await rolesService.updateRole(
      getRequiredRoleId(request.params.roleId),
      payload,
      getRequestLogActorContext(request),
    );

    sendSuccess(response, role);
  }),
);

rolesRouter.delete(
  "/roles/:roleId",
  requirePermission("roles.delete"),
  asyncHandler(async (request, response) => {
    await rolesService.deleteRole(
      getRequiredRoleId(request.params.roleId),
      getRequestLogActorContext(request),
    );

    sendSuccess(response, {
      deleted: true,
    });
  }),
);
