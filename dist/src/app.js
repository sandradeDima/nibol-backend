import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { emailPreviewRouter } from "./routes/dev/email-preview-routes.js";
import { avatarUploadsDir, ensureUploadDirectories, logoUploadsDir, } from "./utils/uploads.js";
import { errorMiddleware } from "./middleware/error-middleware.js";
import { authHandler } from "./modules/auth/auth.js";
import { sessionValidationMiddleware } from "./modules/auth/middleware/session-validation-middleware.js";
import { apiRouter } from "./routes/index.js";
import { env } from "./utils/env.js";
import { sendError, sendSuccess } from "./utils/response.js";
export const app = express();
app.disable("x-powered-by");
void ensureUploadDirectories();
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
}));
app.use(helmet());
app.use(compression());
app.all(/^\/api\/auth(\/.*)?$/, (request, response) => {
    void authHandler(request, response);
});
app.use("/uploads/avatars", express.static(avatarUploadsDir));
app.use("/uploads/logos", express.static(logoUploadsDir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if (env.NODE_ENV === "development") {
    app.use("/api/dev/email-previews", emailPreviewRouter);
}
app.get("/", (_request, response) => {
    sendSuccess(response, {
        name: env.APP_NAME,
        status: "ok",
    });
});
app.use("/api", sessionValidationMiddleware, apiRouter);
app.use((_request, response) => {
    sendError(response, "Route not found.", 404);
});
app.use(errorMiddleware);
//# sourceMappingURL=app.js.map