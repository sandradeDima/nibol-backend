import type { Response } from "express";

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginatedApiSuccessResponse,
  PaginationMeta,
} from "../types/api.js";

export const sendSuccess = <T>(
  response: Response<ApiSuccessResponse<T>>,
  data: T,
  statusCode = 200,
): Response<ApiSuccessResponse<T>> => {
  return response.status(statusCode).json({
    success: true,
    data,
  });
};

export const sendPaginated = <T>(
  response: Response<PaginatedApiSuccessResponse<T>>,
  data: T,
  pagination: PaginationMeta,
  statusCode = 200,
): Response<PaginatedApiSuccessResponse<T>> => {
  return response.status(statusCode).json({
    success: true,
    data,
    pagination,
  });
};

export const sendError = (
  response: Response<ApiErrorResponse>,
  message: string,
  statusCode = 400,
): Response<ApiErrorResponse> => {
  return response.status(statusCode).json({
    success: false,
    message,
  });
};
