import { ZodError } from "zod";
import { AppError } from "../utils/app-error.js";
import { logger } from "../utils/logger.js";
import { sendError } from "../utils/response.js";
export const errorMiddleware = (error, _request, response, _next) => {
    void _next;
    if (response.headersSent) {
        return;
    }
    if (error instanceof ZodError) {
        logger.warn("Request validation failed.", {
            issues: error.flatten().fieldErrors,
        });
        sendError(response, "Validation failed.", 400);
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
    sendError(response, "Internal server error.", 500);
};
//# sourceMappingURL=error-middleware.js.map