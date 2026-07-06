declare module "compression" {
  import type { RequestHandler } from "express";

  const compression: (options?: unknown) => RequestHandler;

  export default compression;
}
