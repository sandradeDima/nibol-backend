import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { sendError } from "../utils/response.js";

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  void _next;

  if (response.headersSent) {
    return;
  }

  if (error instanceof ZodError) {
    logger.warn("Request validation failed.", {
      issues: error.flatten().fieldErrors,
    });

    const translateIssue = (issue: ZodError["issues"][number]) => {
      if (issue.code === "invalid_type")
        return issue.input === undefined
          ? "es obligatorio."
          : "tiene un tipo o formato inválido.";
      if (issue.code === "too_small") return "no alcanza el mínimo permitido.";
      if (issue.code === "too_big") return "supera el máximo permitido.";
      if (issue.code === "invalid_format") return "tiene un formato inválido.";
      if (/^Invalid input|^Too (small|big)/i.test(issue.message))
        return "contiene un valor inválido.";
      return issue.message;
    };
    const details = error.issues
      .map((issue) => {
        const field = issue.path.join(".");
        const message = translateIssue(issue);
        return field ? `${field}: ${message}` : message;
      })
      .join(" ");
    sendError(
      response,
      details
        ? `Revise los datos ingresados. ${details}`
        : "Revise los datos ingresados.",
      400,
    );
    return;
  }

  if (error instanceof AppError) {
    logger.warn(error.message, {
      metadata: error.metadata,
      statusCode: error.statusCode,
    });
    sendError(response, error.message, error.statusCode);
    return;
  }

  logger.error("Unhandled application error.", {
    message: error instanceof Error ? error.message : "Unknown error",
  });

  sendError(
    response,
    "Ocurrió un error interno al procesar la solicitud. Intente nuevamente y, si continúa, contacte al administrador.",
    500,
  );
};
