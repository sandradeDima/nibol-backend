export const sendSuccess = (response, data, statusCode = 200) => {
    return response.status(statusCode).json({
        success: true,
        data,
    });
};
export const sendPaginated = (response, data, pagination, statusCode = 200) => {
    return response.status(statusCode).json({
        success: true,
        data,
        pagination,
    });
};
export const sendError = (response, message, statusCode = 400) => {
    return response.status(statusCode).json({
        success: false,
        message,
    });
};
//# sourceMappingURL=response.js.map