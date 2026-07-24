import { AxiosError } from 'axios';

import type { ApiErrorBody } from '../types/common/common';

const CODE_MESSAGE_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không chính xác.',
  FORBIDDEN: 'Tài khoản không có quyền truy cập.',
  DB_SCHEMA_NOT_READY: 'Hệ thống đang cập nhật dữ liệu nền. Vui lòng thử lại sau ít phút.',
  DB_UNAVAILABLE: 'Không kết nối được cơ sở dữ liệu. Vui lòng thử lại sau.',
  AUTH_UPSTREAM_UNREACHABLE: 'Dịch vụ xác thực admin đang tạm thời gián đoạn. Vui lòng thử lại.',
  AUTH_UPSTREAM_ENDPOINT_NOT_FOUND:
    'Dịch vụ xác thực admin chưa sẵn sàng endpoint nội bộ cần thiết.',
  ACCESS_IP_PENDING: 'IP hiện tại đang chờ phê duyệt.',
  ACCESS_IP_REJECTED: 'IP hiện tại đã bị từ chối.',
  ACCESS_IP_REVOKED: 'Quyền truy cập của IP hiện tại đã bị thu hồi.',
  ACCESS_IP_EXPIRED: 'Phê duyệt cho IP hiện tại đã hết hạn.',
  ADMIN_ACCESS_IP_NOT_APPROVED: 'IP hiện tại đang chờ phê duyệt.',
  ALLOWLIST_EMAIL_DENIED: 'Email này không được phép truy cập admin panel.',
  RBAC_PERMISSION_DENIED: 'Tài khoản không có quyền quản trị.',
  ADMIN_ACCESS_DENIED: 'Tài khoản này không có quyền truy cập Bảng quản trị chat.',
  ADMIN_PERMISSION_DENIED: 'Bạn không có quyền truy cập admin panel.',
  ADMIN_AUTH_REQUIRED: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  ADMIN_AUTH_TOKEN_INVALID: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
  ADMIN_ACCOUNT_NOT_ACTIVE:
    'Tài khoản admin chưa hoạt động. Vui lòng liên hệ quản trị viên để kích hoạt.',
  ADMIN_CANONICAL_PERMISSIONS_MISSING:
    'Phiên đăng nhập chưa có quyền admin hợp lệ. Vui lòng đăng nhập lại.',
  CLIENT_IP_UNRESOLVED: 'Không thể xác định IP client thực tế.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  DUPLICATE_EMPLOYEE_CODE: 'Mã nhân viên đã tồn tại.',
  ACCOUNT_ALREADY_PROVISIONED: 'Nhân sự này đã được cấp tài khoản.',
  HR_EMPLOYEE_NOT_FOUND: 'Không tìm thấy hồ sơ nhân sự.',
  HR_EMPLOYEE_LINKED_TO_USER:
    'Không thể xóa vì nhân sự đã liên kết với tài khoản người dùng.',
  HR_EMPLOYEE_ALREADY_INACTIVE: 'Nhân sự đã ở trạng thái ngừng hoạt động.',
  HR_EMPLOYEE_INVALID_INPUT: 'Dữ liệu nhân sự không hợp lệ.',
  UPSTREAM_ENDPOINT_MISSING:
    'Backend chưa hỗ trợ endpoint nội bộ cần thiết cho chức năng này.',
};

const STATUS_MESSAGE_MAP: Record<number, string> = {
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện hành động này.',
  404: 'Không tìm thấy tài nguyên.',
  409: 'Dữ liệu bị xung đột.',
  422: 'Dữ liệu không thỏa điều kiện xác thực.',
  429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  500: 'Hệ thống đang bận. Vui lòng thử lại sau.',
};

const ADMIN_LOGIN_MESSAGE_MAP: Record<string, string> = {
  ADMIN_CANONICAL_PERMISSIONS_MISSING:
    'Không thể tải thông tin phân quyền quản trị. Vui lòng thử lại hoặc liên hệ quản trị viên.',
  ACCESS_IP_PENDING:
    'IP của bạn đang chờ quản trị viên phê duyệt trước khi truy cập admin panel.',
  ACCESS_IP_REJECTED: 'IP của bạn đã bị từ chối truy cập admin panel.',
  ACCESS_IP_REVOKED: 'Quyền truy cập admin panel của IP này đã bị thu hồi.',
  ACCESS_IP_EXPIRED: 'Phê duyệt truy cập admin panel của IP này đã hết hạn.',
  ADMIN_ACCESS_IP_NOT_APPROVED:
    'IP của bạn đang chờ quản trị viên phê duyệt trước khi truy cập admin panel.',
  ALLOWLIST_EMAIL_DENIED: 'Email này không được phép truy cập admin panel.',
  RBAC_PERMISSION_DENIED: 'Tài khoản của bạn không có quyền quản trị.',
  ADMIN_ACCESS_DENIED: 'Tài khoản này không có quyền truy cập Bảng quản trị chat.',
  ADMIN_PERMISSION_DENIED: 'Bạn không có quyền truy cập admin panel.',
  ADMIN_ACCOUNT_NOT_ACTIVE:
    'Tài khoản admin của bạn chưa hoạt động. Vui lòng liên hệ quản trị viên để kích hoạt.',
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

const extractUpstreamCode = (body: ApiErrorBody | undefined): string | undefined => {
  const details = body?.error?.details ?? body?.details;

  if (!details || typeof details !== 'object') {
    return undefined;
  }

  const upstreamCode = (details as { upstreamCode?: unknown }).upstreamCode;
  return typeof upstreamCode === 'string' ? upstreamCode : undefined;
};

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;
  return extractReasonCode(body) ?? extractUpstreamCode(body) ?? body?.error?.code ?? body?.code;
};

export const getApiErrorStatus = (error: unknown): number | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  return error.response?.status;
};

export const getErrorMessage = (
  error: unknown,
  fallback = 'Đã có lỗi xảy ra.',
): string => {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;

    const code = extractReasonCode(body) ?? extractUpstreamCode(body) ?? body?.error?.code ?? body?.code;
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

export const isAdminAccessIpPendingError = (error: unknown): boolean => {
  const code = getApiErrorCode(error);
  return code === 'ADMIN_ACCESS_IP_NOT_APPROVED' || code === 'ACCESS_IP_PENDING';
};
