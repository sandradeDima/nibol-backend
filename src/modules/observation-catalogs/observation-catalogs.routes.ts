import { Router } from "express";

import { asyncHandler } from "../../middleware/async-handler.js";
import { requirePermission } from "../../middleware/authorization-middleware.js";
import { observationCatalogsController as controller } from "./observation-catalogs.controller.js";

export const observationCatalogsRouter = Router();

observationCatalogsRouter.get(
  "/risks",
  requirePermission("risks.view"),
  asyncHandler(controller.listRisks),
);
observationCatalogsRouter.post(
  "/risks",
  requirePermission("risks.create"),
  asyncHandler(controller.createRisk),
);
observationCatalogsRouter.patch(
  "/risks/:id",
  requirePermission("risks.edit"),
  asyncHandler(controller.updateRisk),
);
observationCatalogsRouter.delete(
  "/risks/:id",
  requirePermission("risks.delete"),
  asyncHandler(controller.removeRisk),
);
observationCatalogsRouter.get(
  "/observation-dictionary",
  requirePermission("observation_dictionary.view"),
  asyncHandler(controller.listDictionary),
);
observationCatalogsRouter.post(
  "/observation-dictionary",
  requirePermission("observation_dictionary.create"),
  asyncHandler(controller.createDictionary),
);
observationCatalogsRouter.patch(
  "/observation-dictionary/:id",
  requirePermission("observation_dictionary.edit"),
  asyncHandler(controller.updateDictionary),
);
observationCatalogsRouter.delete(
  "/observation-dictionary/:id",
  requirePermission("observation_dictionary.delete"),
  asyncHandler(controller.removeDictionary),
);
