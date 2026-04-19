interface StatusBadgeConfig {
  color: string;
  text: string;
  rawStatus?: string;
}

const statusMap: Record<string, StatusBadgeConfig> = {
  up: { color: 'green', text: 'Hoạt động' },
  ready: { color: 'green', text: 'Sẵn sàng' },
  healthy: { color: 'green', text: 'Ổn định' },
  active: { color: 'green', text: 'Đang hoạt động' },
  enabled: { color: 'green', text: 'Đã bật' },
  provisioned: { color: 'green', text: 'Đã cấp' },
  comfortable: { color: 'green', text: 'Ổn định' },
  configured: { color: 'green', text: 'Đã cấu hình' },
  live: { color: 'green', text: 'Thời gian thực' },
  online: { color: 'green', text: 'Trực tuyến' },
  success: { color: 'green', text: 'Thành công' },

  degraded: { color: 'gold', text: 'Suy giảm' },
  warn: { color: 'gold', text: 'Cảnh báo' },
  warning: { color: 'gold', text: 'Cảnh báo' },
  pending: { color: 'gold', text: 'Chờ xử lý' },
  approved: { color: 'green', text: 'Đã duyệt' },
  rejected: { color: 'red', text: 'Đã từ chối' },
  revoked: { color: 'red', text: 'Đã thu hồi' },
  expired: { color: 'default', text: 'Hết hạn' },
  partial: { color: 'gold', text: 'Một phần' },
  pending_verification: { color: 'gold', text: 'Chờ xác minh' },
  ready_for_provision: { color: 'gold', text: 'Sẵn sàng cấp' },
  activation_required: { color: 'gold', text: 'Cần kích hoạt' },
  away: { color: 'gold', text: 'Vắng mặt' },
  info: { color: 'blue', text: 'Thông tin' },
  grant: { color: 'green', text: 'Cấp quyền' },
  deny: { color: 'red', text: 'Từ chối quyền' },
  near_breaking: { color: 'red', text: 'Sắp quá tải' },
  'near-breaking': { color: 'red', text: 'Sắp quá tải' },

  down: { color: 'red', text: 'Ngừng hoạt động' },
  danger: { color: 'red', text: 'Nguy hiểm' },
  error: { color: 'red', text: 'Lỗi' },
  firing: { color: 'red', text: 'Đang báo động' },
  disabled: { color: 'red', text: 'Đã tắt' },
  locked: { color: 'red', text: 'Đã khóa' },
  suspended: { color: 'red', text: 'Tạm ngưng' },
  failed: { color: 'red', text: 'Thất bại' },
  dnd: { color: 'red', text: 'Không làm phiền' },

  inactive: { color: 'default', text: 'Không hoạt động' },
  resolved: { color: 'default', text: 'Đã xử lý' },
  unknown: { color: 'default', text: 'Không xác định' },
  unavailable: { color: 'default', text: 'Không khả dụng' },
  offline: { color: 'default', text: 'Ngoại tuyến' },
  ok: { color: 'green', text: 'OK' },
  alert: { color: 'red', text: 'Cảnh báo' },
  not_provisioned: { color: 'default', text: 'Chưa cấp' },
  not_applicable: { color: 'default', text: 'Không áp dụng' },
  skipped: { color: 'default', text: 'Đã bỏ qua' },
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
    text: 'Không xác định',
    rawStatus: normalized.toUpperCase(),
  };
};
