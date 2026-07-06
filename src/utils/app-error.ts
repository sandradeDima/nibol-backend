export class AppError extends Error {
  public readonly metadata?: unknown;

  public readonly statusCode: number;

  constructor(message: string, statusCode = 500, metadata?: unknown) {
    super(message);
    this.name = "AppError";
    this.metadata = metadata;
    this.statusCode = statusCode;
  }
}
