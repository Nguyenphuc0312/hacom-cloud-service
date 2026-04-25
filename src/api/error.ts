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
  ALLOWLIST_EMAIL_DENIED: 'Email nay khong duoc phep truy cap admin panel.',
  RBAC_PERMISSION_DENIED: 'Tai khoan khong co quyen quan tri.',
  ADMIN_ACCESS_DENIED: 'Ban khong co quyen truy cap admin panel.',
  ADMIN_PERMISSION_DENIED: 'Ban khong co quyen truy cap admin panel.',
  ADMIN_AUTH_REQUIRED: 'Phien dang nhap khong hop le hoac da het han.',
  ADMIN_AUTH_TOKEN_INVALID: 'Phien dang nhap khong hop le hoac da het han.',
  ADMIN_ACCOUNT_NOT_ACTIVE:
    'Tai khoan admin chua active. Vui long lien he quan tri vien de kich hoat.',
  ADMIN_CANONICAL_PERMISSIONS_MISSING:
    'Phien dang nhap chua co quyen admin hop le. Vui long dang nhap lai.',
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

const ADMIN_LOGIN_MESSAGE_MAP: Record<string, string> = {
  ACCESS_IP_PENDING:
    'IP của bạn đang chờ quản trị viên phê duyệt để truy cập admin panel.',
  ACCESS_IP_REJECTED: 'IP của bạn đã bị từ chối truy cập admin panel.',
  ACCESS_IP_REVOKED: 'Quyền truy cập admin panel của IP này đã bị thu hồi.',
  ACCESS_IP_EXPIRED: 'Phê duyệt truy cập admin panel của IP này đã hết hạn.',
  ALLOWLIST_EMAIL_DENIED: 'Email này không được phép truy cập admin panel.',
  RBAC_PERMISSION_DENIED: 'Tài khoản của bạn không có quyền quản trị.',
  ADMIN_ACCESS_DENIED: 'Bạn không có quyền truy cập admin panel.',
  ADMIN_PERMISSION_DENIED: 'Bạn không có quyền truy cập admin panel.',
  ADMIN_ACCOUNT_NOT_ACTIVE:
    'Tài khoản admin của bạn chưa active. Vui lòng liên hệ quản trị viên để kích hoạt.',
  ADMIN_AUTH_REQUIRED: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  ADMIN_AUTH_TOKEN_INVALID: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  UNAUTHORIZED: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
};

const extractReasonCode = (body: ApiErrorBody | undefined): string | undefined => {
  const details = body?.error?.details ?? body?.details;

  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const reason = (details as { reason?: unknown }).reason;
  if (typeof reason === 'string') {
    return reason;
  }

  const upstreamDetails = (details as { upstreamDetails?: unknown }).upstreamDetails;
  if (!upstreamDetails || typeof upstreamDetails !== 'object') {
    return undefined;
  }

  const upstreamReason = (upstreamDetails as { reason?: unknown }).reason;
  return typeof upstreamReason === 'string' ? upstreamReason : undefined;
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

export const getAdminLoginErrorMessage = (error: unknown): string => {
  const code = getApiErrorCode(error);
  if (code && ADMIN_LOGIN_MESSAGE_MAP[code]) {
    return ADMIN_LOGIN_MESSAGE_MAP[code];
  }

  const status = getApiErrorStatus(error);
  if (status === 403) {
    return 'Bạn không có quyền truy cập admin panel.';
  }

  if (status === 401) {
    return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
  }

  return 'Không thể xác minh quyền truy cập admin. Vui lòng thử lại.';
};
