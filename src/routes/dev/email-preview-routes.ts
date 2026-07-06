import { Router } from "express";
import { z } from "zod";

import { emailService } from "../../emails/EmailService.js";
import {
  emailTemplateDefinitions,
  emailTemplateNames,
  isEmailTemplateName,
} from "../../emails/templates/index.js";
import { asyncHandler } from "../../middleware/async-handler.js";
import { AppError } from "../../utils/app-error.js";
import { sendSuccess } from "../../utils/response.js";

const previewFormatSchema = z.enum(["html", "json"]).default("html");

const getPreviewOverrides = (query: Record<string, unknown>): Record<string, string> => {
  const overrides: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (key === "format") {
      continue;
    }

    if (typeof value === "string") {
      overrides[key] = value;
      continue;
    }

    if (Array.isArray(value) && typeof value[0] === "string") {
      overrides[key] = value[0];
    }
  }

  return overrides;
};

export const emailPreviewRouter = Router();

emailPreviewRouter.get(
  "/",
  asyncHandler(async (_request, response) => {
    sendSuccess(response, {
      templates: emailTemplateNames.map((templateName) => ({
        previewUrl: `/api/dev/email-previews/${templateName}`,
        sampleVariables: emailTemplateDefinitions[templateName].sampleVariables,
        template: templateName,
      })),
    });
  }),
);

emailPreviewRouter.get(
  "/:templateName",
  asyncHandler(async (request, response) => {
    const templateName = Array.isArray(request.params.templateName)
      ? request.params.templateName[0]
      : request.params.templateName;

    if (!templateName || !isEmailTemplateName(templateName)) {
      throw new AppError("Email template not found.", 404);
    }

    const format = previewFormatSchema.parse(request.query.format);
    const sampleVariables = emailTemplateDefinitions[templateName].sampleVariables;
    const overrides = getPreviewOverrides(
      request.query as Record<string, unknown>,
    ) as typeof sampleVariables;
    const variables = {
      ...sampleVariables,
      ...overrides,
    };
    const rendered = await emailService.renderTemplate(templateName, variables);

    if (format === "json") {
      sendSuccess(response, {
        html: rendered.html,
        subject: rendered.subject,
        template: templateName,
        text: rendered.text,
        variables,
      });
      return;
    }

    response.type("html").send(rendered.html);
  }),
);
