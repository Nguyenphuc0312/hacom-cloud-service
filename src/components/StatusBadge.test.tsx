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
  });
});
