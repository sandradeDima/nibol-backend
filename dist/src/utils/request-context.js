const getForwardedIpAddress = (request) => {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string") {
        return forwardedFor.split(",")[0]?.trim() ?? null;
    }
    if (Array.isArray(forwardedFor)) {
        return forwardedFor[0]?.split(",")[0]?.trim() ?? null;
    }
    return null;
};
export const getRequestIpAddress = (request) => {
    return getForwardedIpAddress(request) ?? request.ip ?? null;
};
export const getRequestLogActorContext = (request) => {
    return {
        ipAddress: getRequestIpAddress(request),
        userId: request.authSession?.user.id ?? null,
    };
};
//# sourceMappingURL=request-context.js.map