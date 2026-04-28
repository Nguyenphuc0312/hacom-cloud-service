interface StatusBadgeConfig {
  color: string;
  text: string;
  rawStatus?: string;
}

const statusMap: Record<string, StatusBadgeConfig> = {
  up: { color: 'green', text: 'Đang chạy' },
  ready: { color: 'green', text: 'Sẵn sàng' },
  healthy: { color: 'green', text: 'Tốt' },
  active: { color: 'green', text: 'Hoạt động' },
  enabled: { color: 'green', text: 'Bật' },
  provisioned: { color: 'green', text: 'Đã cấp tài khoản' },
  comfortable: { color: 'green', text: 'Ổn định' },
  configured: { color: 'green', text: 'Đã cấu hình' },
  live: { color: 'green', text: 'Trực tiếp' },
  online: { color: 'green', text: 'Trực tuyến' },
  success: { color: 'green', text: 'Thành công' },
  approved: { color: 'green', text: 'Đã duyệt' },
  grant: { color: 'green', text: 'Cấp quyền' },
  ok: { color: 'green', text: 'OK' },

  degraded: { color: 'gold', text: 'Suy giảm' },
  warn: { color: 'gold', text: 'Cảnh báo' },
  warning: { color: 'gold', text: 'Cảnh báo' },
  pending: { color: 'gold', text: 'Chờ xử lý' },
  partial: { color: 'gold', text: 'Một phần' },
  pending_verification: { color: 'gold', text: 'Chờ xác minh' },
  ready_for_provision: { color: 'gold', text: 'Sẵn sàng cấp tài khoản' },
  activation_required: { color: 'gold', text: 'Cần kích hoạt' },
  away: { color: 'gold', text: 'Vắng mặt' },
  info: { color: 'blue', text: 'Thông tin' },

  rejected: { color: 'red', text: 'Đã từ chối' },
  revoked: { color: 'red', text: 'Đã thu hồi' },
  deny: { color: 'red', text: 'Từ chối' },
  near_breaking: { color: 'red', text: 'Gần quá tải' },
  'near-breaking': { color: 'red', text: 'Gần quá tải' },
  down: { color: 'red', text: 'Dừng' },
  danger: { color: 'red', text: 'Nguy hiểm' },
  error: { color: 'red', text: 'Lỗi' },
  firing: { color: 'red', text: 'Đang cảnh báo' },
  disabled: { color: 'red', text: 'Tắt' },
  locked: { color: 'red', text: 'Đã khóa' },
  suspended: { color: 'red', text: 'Tạm ngưng' },
  failed: { color: 'red', text: 'Thất bại' },
  dnd: { color: 'red', text: 'Không làm phiền' },
  alert: { color: 'red', text: 'Cảnh báo' },

  expired: { color: 'default', text: 'Hết hạn' },
  inactive: { color: 'default', text: 'Không hoạt động' },
  resolved: { color: 'default', text: 'Đã xử lý' },
  unknown: { color: 'default', text: 'Không rõ' },
  unavailable: { color: 'default', text: 'Không khả dụng' },
  offline: { color: 'default', text: 'Ngoại tuyến' },
  not_provisioned: { color: 'default', text: 'Chưa cấp tài khoản' },
  unlinked: { color: 'default', text: 'Chưa liên kết' },
  not_applicable: { color: 'default', text: 'Không áp dụng' },
  skipped: { color: 'default', text: 'Bỏ qua' },
};

const normalizeStatus = (status?: string | boolean | null): string => {
  if (typeof status === 'boolean') {
    return status ? 'ready' : 'down';
  }

  if (!status) {
    return 'unknown';
  }

  return status.trim().toLowerCase().replace(/\s+/g, '_');
};

export const resolveStatusBadgeConfig = (status?: string | boolean | null): StatusBadgeConfig => {
  const normalized = normalizeStatus(status);

  const mappedConfig = statusMap[normalized];
  if (mappedConfig) {
    return mappedConfig;
  }

  if (normalized === 'unknown') {
    return statusMap.unknown;
  }

  return {
    color: 'default',
    text: 'Không rõ',
    rawStatus: normalized.toUpperCase(),
  };
};
