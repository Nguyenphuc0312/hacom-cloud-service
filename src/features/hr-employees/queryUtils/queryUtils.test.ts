import { describe, expect, it, vi } from 'vitest';

import { invalidateHrEmployeeQueries } from './queryUtils';

describe('invalidateHrEmployeeQueries', () => {
  it('invalidates list root and detail query when employee id is provided', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await invalidateHrEmployeeQueries({ invalidateQueries }, 'hr-1');

    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['hr-employees-list'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['hr-employee-detail', 'hr-1'],
    });
  });
});
