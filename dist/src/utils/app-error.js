export class AppError extends Error {
    metadata;
    statusCode;
    constructor(message, statusCode = 500, metadata) {
        super(message);
        this.name = "AppError";
        this.metadata = metadata;
        this.statusCode = statusCode;
    }
}
//# sourceMappingURL=app-error.js.map