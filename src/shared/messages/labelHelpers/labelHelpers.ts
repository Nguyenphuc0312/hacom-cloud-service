// Helper mapping status/error/... ra label tiếng Việt

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Đang hoạt động';
    case 'INACTIVE':
      return 'Chưa kích hoạt';
    case 'LOCKED':
      return 'Bị khóa';
    case 'DISABLED':
      return 'Bị vô hiệu hóa';
    case 'PROVISIONED':
      return 'Đã cấp tài khoản';
    case 'NO_ACCOUNT':
      return 'Chưa có tài khoản';
    case 'CONFLICT':
      return 'Xung đột dữ liệu';
    case 'UNKNOWN':
      return 'Không xác định';
    default:
      return status;
  }
}

export function getProvisioningStatusLabel(status: string): string {
  switch (status) {
    case 'PROVISIONED':
      return 'Đã cấp tài khoản';
    case 'NO_ACCOUNT':
      return 'Chưa có tài khoản';
    default:
      return getStatusLabel(status);
  }
}

export function getCommonErrorMessage(code: string): string {
  switch (code) {
    case 'REQUIRED':
      return 'Trường này bắt buộc nhập';
    case 'INVALID_EMAIL':
      return 'Email không hợp lệ';
    case 'INVALID_FORMAT':
      return 'Định dạng không hợp lệ';
    case 'TOO_LARGE':
      return 'Vượt quá giới hạn';
    case 'NOT_FOUND':
      return 'Không tìm thấy dữ liệu';
    case 'FORBIDDEN':
      return 'Bạn không có quyền thực hiện thao tác này';
    case 'SERVER_ERROR':
      return 'Đã xảy ra lỗi hệ thống';
    default:
      return 'Đã xảy ra lỗi, vui lòng thử lại sau';
  }
}
