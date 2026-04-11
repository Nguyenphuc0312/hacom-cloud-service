import { Badge, Tag } from 'antd';

interface StatusBadgeProps {
  status?: string | boolean;
  mode?: 'tag' | 'badge';
}

const statusMap: Record<string, { color: string; text: string }> = {
  up: { color: 'green', text: 'UP' },
  ready: { color: 'green', text: 'READY' },
  healthy: { color: 'green', text: 'HEALTHY' },
  active: { color: 'green', text: 'ACTIVE' },
  enabled: { color: 'green', text: 'ENABLED' },

  degraded: { color: 'gold', text: 'DEGRADED' },
  warn: { color: 'gold', text: 'WARN' },
  warning: { color: 'gold', text: 'WARNING' },
  pending: { color: 'gold', text: 'PENDING' },
  pending_verification: { color: 'gold', text: 'PENDING_VERIFICATION' },

  down: { color: 'red', text: 'DOWN' },
  danger: { color: 'red', text: 'DANGER' },
  error: { color: 'red', text: 'ERROR' },
  firing: { color: 'red', text: 'FIRING' },
  disabled: { color: 'red', text: 'DISABLED' },
  locked: { color: 'red', text: 'LOCKED' },
  suspended: { color: 'red', text: 'SUSPENDED' },

  inactive: { color: 'default', text: 'INACTIVE' },
  resolved: { color: 'default', text: 'RESOLVED' },
  unknown: { color: 'default', text: 'UNKNOWN' },
  ok: { color: 'green', text: 'OK' },
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
