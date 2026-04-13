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
  fallback = 'Unavailable',
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
    return 'Some upstream metrics may be delayed or temporarily missing.';
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
  if (riskState === 'near-breaking') {
    return 'Near-breaking';
  }

  return riskState.charAt(0).toUpperCase() + riskState.slice(1);
};

export const formatRatioValue = (value: number | null, fallback = 'Baseline unavailable'): string => {
  if (value === null || Number.isNaN(value)) {
    return fallback;
  }

  if (value < 1) {
    return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}% of comfortable`;
  }

  return `${value.toFixed(value >= 10 ? 0 : 2)}x comfortable`;
};

export const describeRatioState = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return 'No measured baseline yet.';
  }

  if (value >= 1) {
    return 'At or above the tested comfortable threshold.';
  }

  if (value >= 0.8) {
    return 'Close to the tested comfortable threshold.';
  }

  return 'Within measured headroom.';
};

export const getFreshnessLabel = (
  freshness: 'live' | 'partial' | 'unavailable',
): string => {
  if (freshness === 'live') {
    return 'Live';
  }

  if (freshness === 'partial') {
    return 'Degraded';
  }

  return 'Unavailable';
};
