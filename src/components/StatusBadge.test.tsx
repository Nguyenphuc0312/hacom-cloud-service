import { describe, expect, it } from 'vitest';

import { resolveStatusBadgeConfig } from './statusBadgeUtils';

describe('resolveStatusBadgeConfig', () => {
  it('maps provisioning and activation states to stable badge text', () => {
    expect(resolveStatusBadgeConfig('PROVISIONED')).toEqual({
      color: 'green',
      text: 'Đã cấp',
    });

    expect(resolveStatusBadgeConfig('LOCKED')).toEqual({
      color: 'red',
      text: 'Đã khóa',
    });

    expect(resolveStatusBadgeConfig('NOT_PROVISIONED')).toEqual({
      color: 'default',
      text: 'Chưa cấp',
    });

    expect(resolveStatusBadgeConfig('READY_FOR_PROVISION')).toEqual({
      color: 'gold',
      text: 'Sẵn sàng cấp',
    });
  });

  it('falls back safely for unknown or missing states', () => {
    expect(resolveStatusBadgeConfig(undefined)).toEqual({
      color: 'default',
      text: 'Không xác định',
    });

    expect(resolveStatusBadgeConfig('backend_future_state')).toEqual({
      color: 'default',
      text: 'Không xác định',
      rawStatus: 'BACKEND_FUTURE_STATE',
    });
  });
});
