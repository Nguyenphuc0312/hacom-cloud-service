import type { AxiosResponse } from 'axios';

export interface ApiEnvelopeSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiEnvelopeError {
  success: false;
  error: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export type ApiEnvelope<T> = ApiEnvelopeSuccess<T> | ApiEnvelopeError;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const unwrapApiEnvelope = <T>(response: AxiosResponse<ApiEnvelope<T>>): T => {
  const payload = response.data;

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Request failed');
  }

  return response.data as T;
};

export const asPaginationMeta = (value: unknown): PaginationMeta => {
  const fallback: PaginationMeta = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  };

  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const record = value as Record<string, unknown>;

  const read = (key: keyof PaginationMeta, defaultValue: number): number => {
    const raw = record[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : defaultValue;
  };

  return {
    page: read('page', fallback.page),
    limit: read('limit', fallback.limit),
    total: read('total', fallback.total),
    totalPages: read('totalPages', fallback.totalPages),
  };
};
