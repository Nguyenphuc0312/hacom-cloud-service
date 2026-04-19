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
}

export class ApiContractError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(message: string, options: ApiContractErrorOptions) {
    super(message);
    this.name = "ApiContractError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
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

const fromFailurePayload = (payload: unknown): ApiContractError | null => {
  if (!isRecord(payload) || payload.success !== false) {
    return null;
  }

  const statusCode =
    typeof payload.statusCode === "number" ? payload.statusCode : 500;
  const message =
    typeof payload.message === "string"
      ? payload.message
      : typeof payload.error === "string"
        ? payload.error
        : "Request failed";

  const errorRecord = isRecord(payload.error) ? payload.error : null;
  const rawCode =
    errorRecord && "code" in errorRecord ? errorRecord.code : payload.code;

  const code = isKnownErrorCode(rawCode) ? rawCode : ErrorCode.INTERNAL_ERROR;
  const details =
    errorRecord && "details" in errorRecord ? errorRecord.details : payload.details;

  return new ApiContractError(message, {
    statusCode,
    code,
    details,
    requestId: typeof payload.requestId === "string" ? payload.requestId : undefined,
  });
};

export const extractApiError = (error: unknown): ApiContractError => {
  if (error instanceof ApiContractError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<unknown>;
    const fromPayload = fromFailurePayload(axiosError.response?.data);
    if (fromPayload) {
      return fromPayload;
    }

    const fallbackMessage = axiosError.message || "Request failed";
    const statusCode = axiosError.response?.status ?? 500;

    return new ApiContractError(fallbackMessage, {
      statusCode,
      code: statusCode === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.INTERNAL_ERROR,
    });
  }

  if (error instanceof Error) {
    return new ApiContractError(error.message, {
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
    });
  }

  return new ApiContractError("Unexpected error", {
    statusCode: 500,
    code: ErrorCode.INTERNAL_ERROR,
  });
};
