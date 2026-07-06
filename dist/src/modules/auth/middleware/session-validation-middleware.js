import { fromNodeHeaders } from "better-auth/node";
import { appendAuthHeaders, auth } from "../auth.js";
export const sessionValidationMiddleware = async (request, response, next) => {
    try {
        const sessionResult = await auth.api.getSession({
            headers: fromNodeHeaders(request.headers),
            returnHeaders: true,
        });
        if (sessionResult?.headers) {
            appendAuthHeaders(response, sessionResult.headers);
        }
        request.authSession = sessionResult?.response ?? null;
        next();
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=session-validation-middleware.js.map