interface StatusBadgeConfig {
  color: string;
  text: string;
  rawStatus?: string;
}

const statusMap: Record<string, StatusBadgeConfig> = {
  up: { color: 'green', text: 'UP' },
  ready: { color: 'green', text: 'READY' },
  healthy: { color: 'green', text: 'HEALTHY' },
  active: { color: 'green', text: 'ACTIVE' },
  enabled: { color: 'green', text: 'ENABLED' },
  provisioned: { color: 'green', text: 'PROVISIONED' },

  degraded: { color: 'gold', text: 'DEGRADED' },
  warn: { color: 'gold', text: 'WARN' },
  warning: { color: 'gold', text: 'WARNING' },
  pending: { color: 'gold', text: 'PENDING' },
  pending_verification: { color: 'gold', text: 'PENDING_VERIFICATION' },
  ready_for_provision: { color: 'gold', text: 'READY_FOR_PROVISION' },
  activation_required: { color: 'gold', text: 'ACTIVATION_REQUIRED' },

  down: { color: 'red', text: 'DOWN' },
  danger: { color: 'red', text: 'DANGER' },
  error: { color: 'red', text: 'ERROR' },
  firing: { color: 'red', text: 'FIRING' },
  disabled: { color: 'red', text: 'DISABLED' },
  locked: { color: 'red', text: 'LOCKED' },
  suspended: { color: 'red', text: 'SUSPENDED' },
  failed: { color: 'red', text: 'FAILED' },

  inactive: { color: 'default', text: 'INACTIVE' },
  resolved: { color: 'default', text: 'RESOLVED' },
  unknown: { color: 'default', text: 'UNKNOWN' },
  ok: { color: 'green', text: 'OK' },
  alert: { color: 'red', text: 'ALERT' },
  not_provisioned: { color: 'default', text: 'NOT_PROVISIONED' },
  not_applicable: { color: 'default', text: 'NOT_APPLICABLE' },
  skipped: { color: 'default', text: 'SKIPPED' },
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
    text: 'UNKNOWN',
    rawStatus: normalized.toUpperCase(),
  };
};
