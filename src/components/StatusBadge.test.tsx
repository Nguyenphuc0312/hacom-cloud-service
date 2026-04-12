import { describe, expect, it } from 'vitest';

import { resolveStatusBadgeConfig } from './StatusBadge';

describe('resolveStatusBadgeConfig', () => {
  it('maps provisioning and activation states to stable badge text', () => {
    expect(resolveStatusBadgeConfig('PROVISIONED')).toEqual({
      color: 'green',
      text: 'PROVISIONED',
    });

    expect(resolveStatusBadgeConfig('LOCKED')).toEqual({
      color: 'red',
      text: 'LOCKED',
    });

    expect(resolveStatusBadgeConfig('NOT_PROVISIONED')).toEqual({
      color: 'default',
      text: 'NOT_PROVISIONED',
    });

    expect(resolveStatusBadgeConfig('READY_FOR_PROVISION')).toEqual({
      color: 'gold',
      text: 'READY_FOR_PROVISION',
    });
  });

  it('falls back safely for unknown or missing states', () => {
    expect(resolveStatusBadgeConfig(undefined)).toEqual({
      color: 'default',
      text: 'UNKNOWN',
    });

    expect(resolveStatusBadgeConfig('backend_future_state')).toEqual({
      color: 'default',
      text: 'UNKNOWN',
      rawStatus: 'BACKEND_FUTURE_STATE',
    });
  });
});
