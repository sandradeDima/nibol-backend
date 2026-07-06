export class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}
//# sourceMappingURL=app-error.js.map