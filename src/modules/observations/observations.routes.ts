import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import {
  requireAnyPermission,
  requirePermission,
} from "../../middleware/authorization-middleware.js";
import { observationsController } from "./observations.controller.js";
import { OBSERVATIONS_PERMISSIONS } from "./observations.permissions.js";

export const observationsRouter = Router();

observationsRouter.get(
  "/observations/options",
  requireAnyPermission([
    OBSERVATIONS_PERMISSIONS.view,
    OBSERVATIONS_PERMISSIONS.create,
    OBSERVATIONS_PERMISSIONS.edit,
  ]),
  asyncHandler(observationsController.options),
);

observationsRouter.get(
  "/observations",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(observationsController.list),
);

observationsRouter.get(
  "/observations/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.view),
  asyncHandler(observationsController.getById),
);

observationsRouter.post(
  "/observations",
  requirePermission(OBSERVATIONS_PERMISSIONS.create),
  asyncHandler(observationsController.create),
);

observationsRouter.patch(
  "/observations/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.edit),
  asyncHandler(observationsController.update),
);

observationsRouter.delete(
  "/observations/:id",
  requirePermission(OBSERVATIONS_PERMISSIONS.delete),
  asyncHandler(observationsController.remove),
);
