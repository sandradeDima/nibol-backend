export const asyncHandler = (handler) => {
    return (request, response, next) => {
        void handler(request, response, next).catch(next);
    };
};
//# sourceMappingURL=async-handler.js.map