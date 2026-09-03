import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { AxiosError, AxiosResponse } from 'axios';
import type { ApiEnvelope } from '@/api/envelope/envelope';
import type {
  CloudQuotaRequestListParams,
  CloudQuotaRequestListResponse,
  CloudQuotaReviewParams,
  CloudQuotaReviewResponse,
} from '@/api/types/cloud/cloud';

const quotaRequestsPath = '/cloud/quota-requests';

export class CloudApiError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryAfter?: string;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    requestId?: string;
    retryAfter?: string;
  }) {
    super(input.message);
    this.name = 'CloudApiError';
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.retryAfter = input.retryAfter;
  }
}

const readRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

const toCloudApiError = (error: unknown): CloudApiError => {
  const axiosError = error as AxiosError<ApiEnvelope<unknown>>;
  const response = axiosError.response;
  const responseData = readRecord(response?.data);
  const responseError = readRecord(responseData?.error);
  const responseMeta = readRecord(responseData?.meta);
  const status = response?.status;
  const requestId =
    readString(responseMeta?.requestId) ??
    readString(response?.headers?.['x-request-id']) ??
    readString(response?.headers?.['X-Request-ID']);
  const retryAfter = readString(response?.headers?.['retry-after']);

  if (error instanceof CloudApiError) return error;

  return new CloudApiError({
    status,
    requestId,
    retryAfter,
    code:
      readString(responseError?.code) ??
      (status === 401 || status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'QUOTA_REQUEST_NOT_FOUND'
          : status === 409
            ? 'CLOUD_CONFLICT'
            : status === 429
              ? 'RATE_LIMITED'
              : status && status >= 500
                ? 'CLOUD_UNAVAILABLE'
                : 'CLOUD_REQUEST_FAILED'),
    message:
      readString(responseError?.message) ??
      (error instanceof Error ? error.message : 'Cloud request failed'),
  });
};

const unwrapCloudResponse = <T>(response: AxiosResponse<ApiEnvelope<T>>): T => {
  const payload = response.data;
  const responseError = readRecord(readRecord(payload)?.error);
  if (responseError) {
    throw new CloudApiError({
      status: response.status,
      code: readString(responseError.code) ?? 'CLOUD_REQUEST_FAILED',
      message: readString(responseError.message) ?? 'Cloud request failed',
      requestId: readString(readRecord(readRecord(payload)?.meta)?.requestId),
    });
  }

  return unwrapApiEnvelope<T>(response);
};

const compactParams = (params: CloudQuotaRequestListParams) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );

export const createCloudMutationIdempotencyKey = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `cloud-admin-${crypto.randomUUID()}`;
  }

  return `cloud-admin-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const cloudClient = {
  async listQuotaRequests(
    params: CloudQuotaRequestListParams = {},
  ): Promise<CloudQuotaRequestListResponse> {
    try {
      const response = await adminAxiosInstance.get(quotaRequestsPath, {
        params: compactParams(params),
      });
      return unwrapCloudResponse(response);
    } catch (error) {
      throw toCloudApiError(error);
    }
  },

  async reviewQuotaRequest({
    requestId,
    decision,
    note,
    idempotencyKey,
  }: CloudQuotaReviewParams): Promise<CloudQuotaReviewResponse> {
    if (!idempotencyKey.trim() || idempotencyKey.length > 128) {
      throw new CloudApiError({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain 1 to 128 characters',
      });
    }
    const payload = note?.trim() ? { note: note.trim() } : {};
    try {
      const response = await adminAxiosInstance.post(
        `${quotaRequestsPath}/${encodeURIComponent(requestId)}/${decision}`,
        payload,
        { headers: { 'Idempotency-Key': idempotencyKey } },
      );
      return unwrapCloudResponse(response);
    } catch (error) {
      throw toCloudApiError(error);
    }
  },
};
