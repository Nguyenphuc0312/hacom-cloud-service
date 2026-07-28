import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  platforms: { web: 2 },
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
      expect(screen.getByText('Không đọc được presence')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Redis presence source is not configured or unreachable'),
    ).toBeInTheDocument();
    // The whole point: an empty table must not read as "nobody is online".
    // The sentence is split by <strong>, so match on the element's text content.
    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' &&
          /không\s+có nghĩa là không có ai online/i.test(element.textContent ?? ''),
      ),
    ).toBeInTheDocument();
  });

  it('breaks the current page down by presence state', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [
        onlineUser({ userId: 'u1', presenceState: 'online', connectionCount: 2 }),
        onlineUser({ userId: 'u2', presenceState: 'away', connectionCount: 1 }),
        onlineUser({ userId: 'u3', presenceState: 'away', connectionCount: 1 }),
      ],
      total: 3,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });

    renderPage();

    // Backend total leads; the state split describes the page.
    expect(await screen.findByText('người đang kết nối')).toBeInTheDocument();
    expect(screen.getByText('4 phiên WebSocket đang mở trong trang này')).toBeInTheDocument();
    expect(screen.getByLabelText('Trực tuyến: 1, Vắng mặt: 2')).toBeInTheDocument();
  });

  it('shows the device class of live connections without extra requests', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [
        onlineUser({ userId: 'u1', connectionCount: 3, platforms: { web: 1, mobile: 2 } }),
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });

    renderPage();

    expect(await screen.findByText('Trình duyệt: 1 kết nối')).toBeInTheDocument();
    expect(screen.getByText('Điện thoại: 2 kết nối')).toBeInTheDocument();
    // Device classes ride along with the presence payload; no per-user call.
    expect(listDevicesMock).not.toHaveBeenCalled();
  });

  it('marks unclassified connections as unknown instead of guessing a device', async () => {
    getOnlineUsersMock.mockResolvedValue({
      // Three live sessions, only one classified by the gateway.
      items: [onlineUser({ userId: 'u1', connectionCount: 3, platforms: { web: 1 } })],
      total: 1,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });

    renderPage();

    expect(await screen.findByText('Trình duyệt: 1 kết nối')).toBeInTheDocument();
    expect(screen.getByText('Không rõ thiết bị: 2 kết nối')).toBeInTheDocument();
  });

  it('loads devices only when a row is expanded, never one request per row', async () => {
    getOnlineUsersMock.mockResolvedValue({
      items: [onlineUser({ userId: 'u1' }), onlineUser({ userId: 'u2' })],
      total: 2,
      page: 1,
      pageSize: 50,
      source: 'redis',
      staleReason: null,
    });
    listDevicesMock.mockResolvedValue({
      items: [
        {
          id: 'd1',
          userId: 'u1',
          deviceName: 'Pixel 8',
          platform: 'android',
          hasDeviceToken: true,
          pushEnabled: true,
          userAgent: null,
          lastActiveAt: '2026-07-28T08:00:00.000Z',
          createdAt: null,
          updatedAt: null,
        },
      ],
      pagination: {},
    });

    renderPage();
    await screen.findAllByText('Nguyen Van A');

    // Nothing fetched while the table is collapsed.
    expect(listDevicesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Expand row' })[0]);

    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    // Registered devices are account-level; they are not the live connection.
    expect(
      screen.getByText('Bên dưới là thiết bị của tài khoản, không phải của kết nối'),
    ).toBeInTheDocument();
    expect(listDevicesMock).toHaveBeenCalledTimes(1);
    expect(listDevicesMock).toHaveBeenCalledWith('u1', expect.anything());
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
    expect(screen.queryByText('Không đọc được presence')).not.toBeInTheDocument();
  });
});
