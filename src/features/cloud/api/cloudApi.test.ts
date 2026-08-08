import { beforeEach, describe, expect, it, vi } from 'vitest';

const { del } = vi.hoisted(() => ({ del: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: { request: { use: vi.fn() } },
      delete: del,
      get: vi.fn(),
      post: vi.fn(),
    }),
  },
}));

import { cloudApi } from './cloudApi';

describe('cloudApi', () => {
  beforeEach(() => {
    del.mockReset();
    del.mockResolvedValue({ data: { data: { id: 'asset-1' } } });
  });

  it('purgeByMessage gọi endpoint by-message với permanent=true (xóa vĩnh viễn 1 thao tác)', async () => {
    await cloudApi.purgeByMessage('message 1');
    expect(del).toHaveBeenCalledWith('/assets/by-message/message%201', {
      params: { permanent: true },
    });
  });

  it('trashByMessage giữ nguyên đường thùng rác (không permanent) cho trang quản lý', async () => {
    await cloudApi.trashByMessage('message-1');
    expect(del).toHaveBeenCalledWith('/assets/by-message/message-1');
  });
});
