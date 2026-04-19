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
  comfortable: { color: 'green', text: 'COMFORTABLE' },
  configured: { color: 'green', text: 'CONFIGURED' },
  live: { color: 'green', text: 'LIVE' },
  online: { color: 'green', text: 'ONLINE' },
  success: { color: 'green', text: 'SUCCESS' },

  degraded: { color: 'gold', text: 'DEGRADED' },
  warn: { color: 'gold', text: 'WARN' },
  warning: { color: 'gold', text: 'WARNING' },
  pending: { color: 'gold', text: 'PENDING' },
  approved: { color: 'green', text: 'APPROVED' },
  rejected: { color: 'red', text: 'REJECTED' },
  revoked: { color: 'red', text: 'REVOKED' },
  expired: { color: 'default', text: 'EXPIRED' },
  partial: { color: 'gold', text: 'PARTIAL' },
  pending_verification: { color: 'gold', text: 'PENDING_VERIFICATION' },
  ready_for_provision: { color: 'gold', text: 'READY_FOR_PROVISION' },
  activation_required: { color: 'gold', text: 'ACTIVATION_REQUIRED' },
  away: { color: 'gold', text: 'AWAY' },
  info: { color: 'blue', text: 'INFO' },
  grant: { color: 'green', text: 'GRANT' },
  deny: { color: 'red', text: 'DENY' },
  near_breaking: { color: 'red', text: 'NEAR_BREAKING' },
  'near-breaking': { color: 'red', text: 'NEAR_BREAKING' },

  down: { color: 'red', text: 'DOWN' },
  danger: { color: 'red', text: 'DANGER' },
  error: { color: 'red', text: 'ERROR' },
  firing: { color: 'red', text: 'FIRING' },
  disabled: { color: 'red', text: 'DISABLED' },
  locked: { color: 'red', text: 'LOCKED' },
  suspended: { color: 'red', text: 'SUSPENDED' },
  failed: { color: 'red', text: 'FAILED' },
  dnd: { color: 'red', text: 'DO_NOT_DISTURB' },

  inactive: { color: 'default', text: 'INACTIVE' },
  resolved: { color: 'default', text: 'RESOLVED' },
  unknown: { color: 'default', text: 'UNKNOWN' },
  unavailable: { color: 'default', text: 'UNAVAILABLE' },
  offline: { color: 'default', text: 'OFFLINE' },
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
