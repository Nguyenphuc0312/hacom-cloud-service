import type {
  MonitoringAvailability,
  MonitoringCapacityRiskState,
  MonitoringWarning,
} from '@/api/types';

export const availabilityToStatus = (
  availability: MonitoringAvailability,
): 'healthy' | 'warning' | 'down' => {
  if (availability === 'available') {
    return 'healthy';
  }

  if (availability === 'partial') {
    return 'warning';
  }

  return 'down';
};

export const formatMetricValue = (
  value: string,
  availability: MonitoringAvailability,
  fallback = 'Không khả dụng',
): string => {
  if (availability === 'unavailable') {
    return fallback;
  }

  if (availability === 'partial' && value === '-') {
    return fallback;
  }

  return value;
};

export const summarizeWarnings = (warnings: MonitoringWarning[]): string => {
  if (warnings.length === 0) {
    return 'Một số metric upstream có thể đang trễ hoặc tạm thời thiếu dữ liệu.';
  }

  const grouped = new Map<string, number>();
  for (const warning of warnings) {
    const label = `${warning.source}:${warning.code}`;
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .slice(0, 4)
    .map(([label, count]) => `${label.replace(':', ' ')}${count > 1 ? ` x${count}` : ''}`)
    .join(' | ');
};

export const riskStateToStatus = (
  riskState: MonitoringCapacityRiskState,
): 'healthy' | 'warning' | 'down' | 'unknown' => {
  if (riskState === 'comfortable') {
    return 'healthy';
  }

  if (riskState === 'warning' || riskState === 'pending') {
    return 'warning';
  }

  if (riskState === 'near-breaking') {
    return 'down';
  }

  return 'unknown';
};

export const getRiskStateLabel = (riskState: MonitoringCapacityRiskState): string => {
  if (riskState === 'comfortable') {
    return 'An toàn';
  }

  if (riskState === 'warning') {
    return 'Cảnh báo';
  }

  if (riskState === 'near-breaking') {
    return 'Cận gãy';
  }

  return 'Đang chờ';
};

export const formatRatioValue = (value: number | null, fallback = 'Baseline chưa khả dụng'): string => {
  if (value === null || Number.isNaN(value)) {
    return fallback;
  }

  if (value < 1) {
    return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}% so với ngưỡng an toàn`;
  }

  return `${value.toFixed(value >= 10 ? 0 : 2)}x ngưỡng an toàn`;
};

export const describeRatioState = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return 'Chưa có baseline đo kiểm.';
  }

  if (value >= 1) {
    return 'Đã chạm hoặc vượt ngưỡng an toàn đã đo.';
  }

  if (value >= 0.8) {
    return 'Đang tiến gần ngưỡng an toàn đã đo.';
  }

  return 'Vẫn nằm trong khoảng đệm đã đo.';
};

export const getFreshnessLabel = (
  freshness: 'live' | 'partial' | 'unavailable',
): string => {
  if (freshness === 'live') {
    return 'Trực tiếp';
  }

  if (freshness === 'partial') {
    return 'Suy giảm';
  }

  return 'Không khả dụng';
};
