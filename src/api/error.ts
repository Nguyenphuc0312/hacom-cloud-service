import { AxiosError } from 'axios';

import type { ApiErrorBody } from './types';

const CODE_MESSAGE_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  FORBIDDEN: 'Tài khoản không có quyền truy cập.',
  AUTH_UPSTREAM_UNREACHABLE: 'Dịch vụ xác thực admin đang tạm thời gián đoạn. Vui lòng thử lại.',
  AUTH_UPSTREAM_ENDPOINT_NOT_FOUND:
    'Dịch vụ xác thực admin chưa sẵn sàng endpoint nội bộ cần thiết.',
  USER_NOT_FOUND: 'Không tìm thấy người dùng.',
  DUPLICATE_EMPLOYEE_CODE: 'Mã nhân viên đã tồn tại.',
  HR_EMPLOYEE_NOT_FOUND: 'Không tìm thấy hồ sơ nhân sự.',
  HR_EMPLOYEE_LINKED_TO_USER: 'Không thể xóa vì nhân sự đã liên kết với tài khoản người dùng.',
  HR_EMPLOYEE_ALREADY_INACTIVE: 'Nhân sự đã ở trạng thái ngừng hoạt động.',
  HR_EMPLOYEE_INVALID_INPUT: 'Dữ liệu nhân sự không hợp lệ.',
  UPSTREAM_ENDPOINT_MISSING: 'Backend chưa hỗ trợ endpoint nội bộ cần thiết cho chức năng này.',
};

export const getApiErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  const body = error.response?.data as ApiErrorBody | undefined;
  return body?.error?.code ?? body?.code;
};

export const getApiErrorStatus = (error: unknown): number | undefined => {
  if (!(error instanceof AxiosError)) {
    return undefined;
  }

  return error.response?.status;
};

const STATUS_MESSAGE_MAP: Record<number, string> = {
  400: 'Dữ liệu gửi lên không hợp lệ.',
  401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  403: 'Bạn không có quyền thực hiện hành động này.',
  404: 'Không tìm thấy tài nguyên.',
  409: 'Dữ liệu bị xung đột.',
  422: 'Dữ liệu không thỏa điều kiện xác thực.',
  500: 'Hệ thống đang bận. Vui lòng thử lại sau.',
};

export const getErrorMessage = (error: unknown, fallback = 'Đã có lỗi xảy ra.'): string => {
  if (error instanceof AxiosError) {
    const body = error.response?.data as ApiErrorBody | undefined;

    const code = body?.error?.code ?? body?.code;
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
