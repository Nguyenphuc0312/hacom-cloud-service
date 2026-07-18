import type { SupportIssuePriority, SupportIssueStatus } from '@/api/types/support/support';

/** Nhãn + màu Ant Design cho trạng thái ticket. Một nguồn, dùng ở bảng lẫn panel chi tiết. */
export const STATUS_META: Record<SupportIssueStatus, { label: string; color: string }> = {
  open: { label: 'Mới', color: 'blue' },
  in_progress: { label: 'Đang xử lý', color: 'gold' },
  resolved: { label: 'Đã xử lý', color: 'green' },
  closed: { label: 'Đã đóng', color: 'default' },
};

export const PRIORITY_META: Record<SupportIssuePriority, { label: string; color: string }> = {
  low: { label: 'Thấp', color: 'default' },
  medium: { label: 'Trung bình', color: 'blue' },
  high: { label: 'Cao', color: 'red' },
};

export const STATUS_OPTIONS = (
  Object.keys(STATUS_META) as SupportIssueStatus[]
).map((value) => ({ value, label: STATUS_META[value].label }));

export const PRIORITY_OPTIONS = (
  Object.keys(PRIORITY_META) as SupportIssuePriority[]
).map((value) => ({ value, label: PRIORITY_META[value].label }));

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};
