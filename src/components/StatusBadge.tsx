import { Badge, Tag } from 'antd';

interface StatusBadgeProps {
  status?: string | boolean;
  mode?: 'tag' | 'badge';
}

const statusMap: Record<string, { color: string; text: string }> = {
  up: { color: 'green', text: 'UP' },
  ready: { color: 'green', text: 'READY' },
  degraded: { color: 'gold', text: 'DEGRADED' },
  down: { color: 'red', text: 'DOWN' },
  unknown: { color: 'default', text: 'UNKNOWN' },
  firing: { color: 'red', text: 'FIRING' },
  resolved: { color: 'green', text: 'RESOLVED' },
  ok: { color: 'green', text: 'OK' },
  warn: { color: 'gold', text: 'WARN' },
  alert: { color: 'red', text: 'ALERT' },
};

const normalizeStatus = (status?: string | boolean): string => {
  if (typeof status === 'boolean') {
    return status ? 'ready' : 'down';
  }

  return status?.toLowerCase() ?? 'unknown';
};

export const StatusBadge = ({ status, mode = 'tag' }: StatusBadgeProps) => {
  const normalized = normalizeStatus(status);
  const config = statusMap[normalized] ?? {
    color: 'default',
    text: normalized.toUpperCase(),
  };

  if (mode === 'badge') {
    return <Badge color={config.color} text={config.text} />;
  }

  return <Tag color={config.color}>{config.text}</Tag>;
};
