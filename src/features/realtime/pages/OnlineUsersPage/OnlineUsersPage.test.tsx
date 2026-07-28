import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOnlineUsersMock, listDevicesMock, listSessionsMock } = vi.hoisted(() => ({
  getOnlineUsersMock: vi.fn(),
  listDevicesMock: vi.fn(),
  listSessionsMock: vi.fn(),
}));

vi.mock('@/api/clients/realtimeClient/realtimeClient', () => ({
  realtimeClient: {
    getOnlineUsers: getOnlineUsersMock,
  },
}));

vi.mock('@/api/clients/sessionsClient/sessionsClient', () => ({
  sessionsClient: {
    listDevicesByUserId: listDevicesMock,
    listByUserId: listSessionsMock,
  },
}));

import { OnlineUsersPage } from './OnlineUsersPage';

const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderPage = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <OnlineUsersPage />
    </QueryClientProvider>,
  );

const onlineUser = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u1',
  displayName: 'Nguyen Van A',
  employeeCode: 'HC000001',
  department: 'IT',
  connectionCount: 2,
  presenceState: 'online',
  lastSeenAt: '2026-07-28T09:00:00.000Z',
  activeRooms: 0,
  ...overrides,
});

describe('OnlineUsersPage', () => {
  beforeEach(() => {
    getOnlineUsersMock.mockReset();
    listDevicesMock.mockReset().mockResolvedValue({ items: [], pagination: {} });
    listSessionsMock.mockReset().mockResolvedValue({ items: [], pagination: {} });
  });

  it('shows who is online with their live session count', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [onlineUser()],
      total: 1,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });

    renderPage();

    expect(await screen.findByText('Nguyen Van A')).toBeInTheDocument();
    expect(screen.getByText('HC000001')).toBeInTheDocument();
    expect(screen.getByText('IT')).toBeInTheDocument();
  });

  it('warns that an empty list is not proof nobody is online when presence is stale', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      source: 'stale',
      staleReason: 'Redis presence source is not configured or unreachable',
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Không đọc được dữ liệu presence')).toBeInTheDocument();
    });
    expect(screen.getByText(/KHÔNG có nghĩa là không có ai online/)).toBeInTheDocument();
  });

  it('distinguishes a genuinely empty list from a stale one', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });

    renderPage();

    expect(await screen.findByText('Không có người dùng online')).toBeInTheDocument();
    expect(screen.queryByText('Không đọc được dữ liệu presence')).not.toBeInTheDocument();
  });
});
