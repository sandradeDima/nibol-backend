import type { AuthSession } from "../modules/auth/auth.js";
import type {
  AuthorizationRequestCache,
  AuthorizationSummary,
} from "../services/authorization-service.js";

declare global {
  namespace Express {
    interface Request {
      authSession?: AuthSession | null;
      authorizationCache?: AuthorizationRequestCache;
      authorizationSummary?: AuthorizationSummary | null;
    }
  }
}

export {};
