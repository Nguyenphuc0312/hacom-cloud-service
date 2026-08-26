import axios from "axios";
import type { AxiosError } from "axios";
import {
  ErrorCode,
  type ApiFailure,
  type ApiResponse,
} from "@hacom/chat-shared-types/core";

interface ApiContractErrorOptions {
  statusCode: number;
  code: ErrorCode;
  details?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;
  isNetworkError?: boolean;
}

export class ApiContractError extends Error {
  public readonly status: number;
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly requestId?: string;
  public readonly retryAfterSeconds?: number;
  public readonly isNetworkError: boolean;
  public readonly isAuthError: boolean;
  public readonly isRateLimit: boolean;

  constructor(message: string, options: ApiContractErrorOptions) {
    super(message);
    this.name = "ApiContractError";
    this.status = options.statusCode;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isNetworkError = options.isNetworkError ?? options.statusCode === 0;
    this.isAuthError = options.statusCode === 401;
    this.isRateLimit =
      options.statusCode === 429 || options.code === ErrorCode.RATE_LIMITED;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const isKnownErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === "string" && Object.values(ErrorCode).includes(value as ErrorCode);

export const isApiFailure = <T>(response: ApiResponse<T>): response is ApiFailure => {
  return response.success === false;
};

export const unwrapApiSuccess = <T>(response: ApiResponse<T>): T => {
  if (response.success) {
    return response.data;
  }

  throw new ApiContractError(response.message, {
    statusCode: response.statusCode,
    code: response.error.code,
    details: response.error.details,
    requestId: response.requestId,
  });
};

export const parseRetryAfterSeconds = (
  retryAfter: string | number | readonly string[] | undefined,
  nowMs = Date.now(),
): number | undefined => {
  const rawValue = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) && rawValue >= 0 ? Math.ceil(rawValue) : undefined;
  }

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return undefined;
  }

  const trimmedValue = rawValue.trim();
  if (/^\d+$/.test(trimmedValue)) {
    return Number.parseInt(trimmedValue, 10);
  }

  const retryAtMs = Date.parse(trimmedValue);
  if (!Number.isFinite(retryAtMs)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000));
};

export const getSafeApiErrorMessage = (statusCode: number): string => {
  if (statusCode === 0) {
    return "Mất kết nối mạng. Kiểm tra Internet rồi thử lại.";
  }
  if (statusCode === 413) {
    return "Tin nhắn quá dài. Vui lòng rút gọn nội dung hoặc gửi dưới dạng tệp.";
  }
  if (statusCode === 401) {
    return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  }
  if (statusCode === 403) {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  if (statusCode === 404) {
    return "Không tìm thấy dữ liệu yêu cầu.";
  }
  if (statusCode === 429) {
    return "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.";
  }
  if (statusCode >= 500) {
    return "Hệ thống đang gặp sự cố. Vui lòng thử lại.";
  }
  return "Yêu cầu không thành công. Vui lòng thử lại.";
};

const resolveErrorCode = (statusCode: number): ErrorCode => {
  if (statusCode === 401) return ErrorCode.UNAUTHORIZED;
  if (statusCode === 403) return ErrorCode.FORBIDDEN;
  if (statusCode === 404) return ErrorCode.NOT_FOUND;
  if (statusCode === 413) return ErrorCode.PAYLOAD_TOO_LARGE;
  if (statusCode === 429) return ErrorCode.RATE_LIMITED;
  return ErrorCode.INTERNAL_ERROR;
};

const mergeRetryAfterDetails = (
  details: unknown,
  retryAfterSeconds: number | undefined,
): unknown => {
  if (retryAfterSeconds === undefined) {
    return details;
  }

  if (isRecord(details)) {
    return {
      ...details,
      retryAfterSeconds,
    };
  }

  return {
    retryAfterSeconds,
  };
};

const fromFailurePayload = (
  payload: unknown,
  retryAfterSeconds?: number,
  responseStatus?: number,
): ApiContractError | null => {
  if (!isRecord(payload) || payload.success !== false) {
    return null;
  }

  const statusCode =
    typeof payload.statusCode === "number"
      ? payload.statusCode
      : responseStatus ?? 500;
  const message =
    typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : getSafeApiErrorMessage(statusCode);

  const errorRecord = isRecord(payload.error) ? payload.error : null;
  const rawCode =
    errorRecord && "code" in errorRecord ? errorRecord.code : payload.code;

  const code = isKnownErrorCode(rawCode) ? rawCode : resolveErrorCode(statusCode);
  const details =
    errorRecord && "details" in errorRecord ? errorRecord.details : payload.details;

  return new ApiContractError(message, {
    statusCode,
    code,
    details: mergeRetryAfterDetails(details, retryAfterSeconds),
    requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
    retryAfterSeconds,
  });
};

const fromPlainApiError = (
  payload: unknown,
  retryAfterSeconds?: number,
): ApiContractError | null => {
  if (!isRecord(payload) || typeof payload.message !== "string") {
    return null;
  }

  const statusCode =
    typeof payload.statusCode === "number" ? payload.statusCode : null;
  const code = isKnownErrorCode(payload.code) ? payload.code : null;
  if (!statusCode && !code) {
    return null;
  }

  const resolvedStatusCode = statusCode ?? 500;

  return new ApiContractError(payload.message, {
    statusCode: resolvedStatusCode,
    code: code ?? resolveErrorCode(resolvedStatusCode),
    details: mergeRetryAfterDetails(payload.details, retryAfterSeconds),
    requestId:
      typeof payload.requestId === "string" ? payload.requestId : undefined,
    retryAfterSeconds,
  });
};

export const extractApiError = (error: unknown): ApiContractError => {
  if (error instanceof ApiContractError) {
    return error;
  }

  const plainApiError = fromPlainApiError(error);
  if (plainApiError) {
    return plainApiError;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;
    const retryAfterSeconds = parseRetryAfterSeconds(
      axiosError.response?.headers?.["retry-after"],
    );
    const fromPayload = fromFailurePayload(
      axiosError.response?.data,
      retryAfterSeconds,
      axiosError.response?.status,
    );
    if (fromPayload) {
      return fromPayload;
    }

    const statusCode = axiosError.response?.status ?? 0;

    return new ApiContractError(getSafeApiErrorMessage(statusCode), {
      statusCode,
      code: resolveErrorCode(statusCode),
      details:
        statusCode === 429
          ? {
              retryAfterSeconds,
            }
          : undefined,
      retryAfterSeconds,
      isNetworkError: !axiosError.response,
    });
  }

  return new ApiContractError(getSafeApiErrorMessage(500), {
    statusCode: 500,
    code: ErrorCode.INTERNAL_ERROR,
  });
};
