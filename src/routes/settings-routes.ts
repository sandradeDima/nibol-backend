import multer from "multer";
import { Router } from "express";

import { asyncHandler } from "../middleware/async-handler.js";
import {
  requireAdmin,
  requirePermission,
} from "../middleware/authorization-middleware.js";
import { settingsService } from "../services/settings-service.js";
import { AppError } from "../utils/app-error.js";
import { getRequestLogActorContext } from "../utils/request-context.js";
import { sendSuccess } from "../utils/response.js";
import {
  logoUploadSchema,
  updateSettingsSchema,
} from "../validators/settings-validator.js";

const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  storage: multer.memoryStorage(),
});

export const settingsRouter = Router();

settingsRouter.get(
  "/settings",
  requirePermission("settings.view"),
  asyncHandler(async (_request, response) => {
    const settings = await settingsService.getSettings();
    sendSuccess(response, settings);
  }),
);

settingsRouter.put(
  "/settings",
  requirePermission("settings.edit"),
  requireAdmin(),
  asyncHandler(async (request, response) => {
    const payload = updateSettingsSchema.parse(request.body);
    const settings = await settingsService.updateSettings(
      payload,
      getRequestLogActorContext(request),
    );

    sendSuccess(response, settings);
  }),
);

settingsRouter.put(
  "/settings/logo",
  requirePermission("settings.edit"),
  requireAdmin(),
  upload.single("logo"),
  asyncHandler(async (request, response) => {
    const file = request.file;

    if (!file) {
      throw new AppError("Logo file is required.", 400);
    }

    const metadata = logoUploadSchema.parse({
      mimetype: file.mimetype,
      originalName: file.originalname,
      size: file.size,
    });

    const settings = await settingsService.uploadLogo({
      buffer: file.buffer,
      originalName: metadata.originalName,
    }, getRequestLogActorContext(request));

    sendSuccess(response, settings);
  }),
);
