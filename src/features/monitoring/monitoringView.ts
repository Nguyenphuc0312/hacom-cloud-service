import type { MonitoringAvailability, MonitoringWarning } from '@/api/types';

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
