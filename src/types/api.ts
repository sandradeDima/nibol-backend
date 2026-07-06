export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedApiSuccessResponse<T> extends ApiSuccessResponse<T> {
  pagination: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
}
