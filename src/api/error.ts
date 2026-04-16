import { AxiosError } from 'axios';

import type { ApiErrorBody } from './types';

const CODE_MESSAGE_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoac mat khau khong dung.',
  FORBIDDEN: 'Tai khoan khong co quyen truy cap.',
  DB_SCHEMA_NOT_READY: 'He thong dang cap nhat du lieu nen. Vui long thu lai sau it phut.',
  DB_UNAVAILABLE: 'Khong ket noi duoc co so du lieu. Vui long thu lai sau.',
  AUTH_UPSTREAM_UNREACHABLE:
    'Dich vu xac thuc admin dang tam thoi gian doan. Vui long thu lai.',
  AUTH_UPSTREAM_ENDPOINT_NOT_FOUND:
    'Dich vu xac thuc admin chua san sang endpoint noi bo can thiet.',
  ACCESS_IP_PENDING: 'IP hien tai dang cho phe duyet.',
  ACCESS_IP_REJECTED: 'IP hien tai da bi tu choi.',
  ACCESS_IP_REVOKED: 'Quyen truy cap cua IP hien tai da bi thu hoi.',
  ACCESS_IP_EXPIRED: 'Phe duyet cho IP hien tai da het han.',
  CLIENT_IP_UNRESOLVED: 'Khong the xac dinh IP client thuc te.',
  USER_NOT_FOUND: 'Khong tim thay nguoi dung.',
  DUPLICATE_EMPLOYEE_CODE: 'Ma nhan vien da ton tai.',
  ACCOUNT_ALREADY_PROVISIONED: 'Nhan su nay da duoc cap tai khoan.',
  HR_EMPLOYEE_NOT_FOUND: 'Khong tim thay ho so nhan su.',
  HR_EMPLOYEE_LINKED_TO_USER:
    'Khong the xoa vi nhan su da lien ket voi tai khoan nguoi dung.',
  HR_EMPLOYEE_ALREADY_INACTIVE: 'Nhan su da o trang thai ngung hoat dong.',
  HR_EMPLOYEE_INVALID_INPUT: 'Du lieu nhan su khong hop le.',
  UPSTREAM_ENDPOINT_MISSING:
    'Backend chua ho tro endpoint noi bo can thiet cho chuc nang nay.',
};

const STATUS_MESSAGE_MAP: Record<number, string> = {
  400: 'Du lieu gui len khong hop le.',
  401: 'Phien dang nhap da het han. Vui long dang nhap lai.',
  403: 'Ban khong co quyen thuc hien hanh dong nay.',
  404: 'Khong tim thay tai nguyen.',
  409: 'Du lieu bi xung dot.',
  422: 'Du lieu khong thoa dieu kien xac thuc.',
  500: 'He thong dang ban. Vui long thu lai sau.',
};

const extractReasonCode = (body: ApiErrorBody | undefined): string | undefined => {
  const details = body?.error?.details ?? body?.details;

  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
};

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;
  return extractReasonCode(body) ?? body?.error?.code ?? body?.code;
};

export const getApiErrorStatus = (error: unknown): number | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  return error.response?.status;
};

export const getErrorMessage = (
  error: unknown,
  fallback = 'Da co loi xay ra.',
): string => {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;

    const code = extractReasonCode(body) ?? body?.error?.code ?? body?.code;
    const message = body?.error?.message ?? body?.message;

    if (code && CODE_MESSAGE_MAP[code]) {
      return CODE_MESSAGE_MAP[code];
    }

    if (message) {
      return message;
    }

    const status = error.response?.status;
    if (status && STATUS_MESSAGE_MAP[status]) {
      return STATUS_MESSAGE_MAP[status];
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
