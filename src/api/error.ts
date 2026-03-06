import { AxiosError } from 'axios';

import type { ApiErrorBody } from './types';

const CODE_MESSAGE_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  USER_FORBIDDEN: 'Tài khoản không có quyền truy cập.',
  SMTP_TEST_FAILED: 'Kết nối SMTP thất bại, vui lòng kiểm tra cấu hình.',
  SMTP_SEND_FAILED: 'Gửi email test thất bại.',
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

    if (body?.code && CODE_MESSAGE_MAP[body.code]) {
      return CODE_MESSAGE_MAP[body.code];
    }

    if (body?.message) {
      return body.message;
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
