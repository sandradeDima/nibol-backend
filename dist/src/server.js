import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./utils/env.js";
import { logger } from "./utils/logger.js";
const server = createServer(app);
const shutdown = (signal) => {
    logger.info(`Received ${signal}. Shutting down server.`);
    server.close(async (error) => {
        if (error) {
            logger.error("Server shutdown failed.", { message: error.message });
            process.exit(1);
        }
        process.exit(0);
    });
};
server.listen(env.PORT, () => {
    logger.info(`API server listening on http://localhost:${env.PORT}`);
});
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
//# sourceMappingURL=server.js.map