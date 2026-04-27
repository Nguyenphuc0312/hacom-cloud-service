import { describe, expect, it } from 'vitest';

import { resolveStatusBadgeConfig } from './statusBadgeUtils';

describe('resolveStatusBadgeConfig', () => {
  it('maps provisioning and activation states to stable badge text', () => {
    expect(resolveStatusBadgeConfig('PROVISIONED')).toEqual({
      color: 'green',
      text: 'Đã cấp tài khoản',
    });

    expect(resolveStatusBadgeConfig('LOCKED')).toEqual({
      color: 'red',
      text: 'Đã khóa',
    });

    expect(resolveStatusBadgeConfig('NOT_PROVISIONED')).toEqual({
      color: 'default',
      text: 'Chưa cấp tài khoản',
    });

    expect(resolveStatusBadgeConfig('READY_FOR_PROVISION')).toEqual({
      color: 'gold',
      text: 'Sẵn sàng cấp tài khoản',
    });
  });

  it('falls back safely for unknown or missing states', () => {
    expect(resolveStatusBadgeConfig(undefined)).toEqual({
      color: 'default',
      text: 'Không rõ',
    });

    expect(resolveStatusBadgeConfig('backend_future_state')).toEqual({
      color: 'default',
      text: 'Không rõ',
      rawStatus: 'BACKEND_FUTURE_STATE',
    });
  });
});
