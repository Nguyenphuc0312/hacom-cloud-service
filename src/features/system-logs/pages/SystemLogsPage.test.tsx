import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
}));

vi.mock('@/api/clients', () => ({
  systemLogsClient: {
    list: listMock,
  },
}));

import { SystemLogsPage } from './SystemLogsPage';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderWithQuery = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <SystemLogsPage />
    </QueryClientProvider>,
  );

const baseLog = {
  id: 'log-1',
  timestamp: '2026-04-22T03:00:00.000Z',
  level: 'error' as const,
  service: 'chat-api-service',
  host: 'api-1',
  summary: 'Persistence failed after retries',
  message: 'Persistence failed after retries',
  requestId: 'req-1',
  traceId: 'trace-1',
  spanId: 'span-1',
  source: 'runtime',
  metadata: {
    queue: 'message_sender',
  },
};

describe('SystemLogsPage', () => {
  beforeEach(() => {
    listMock.mockReset();
    vi.useRealTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders the initial loading state', () => {
    listMock.mockImplementation(() => new Promise(() => undefined));

    renderWithQuery();

    expect(screen.getByText('Đang tải nhật ký hệ thống...')).toBeInTheDocument();
  });

  it('renders the error state when the API fails', async () => {
    listMock.mockRejectedValue(new Error('loki down'));

    renderWithQuery();

    expect(await screen.findByText('loki down')).toBeInTheDocument();
  });

  it('renders the empty state when no items are returned', async () => {
    listMock.mockResolvedValue({ items: [] });

    renderWithQuery();

    expect(await screen.findByText('Chưa có bản ghi')).toBeInTheDocument();
  });

  it('renders logs and opens the detail panel', async () => {
    listMock.mockResolvedValue({ items: [baseLog] });

    renderWithQuery();

    const summaries = await screen.findAllByText('Persistence failed after retries');
    fireEvent.click(summaries[0]!);

    expect((await screen.findAllByText('Request ID')).length).toBeGreaterThan(0);
    expect(screen.getByText('Trace ID')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trace ID/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('trace-1');
    });
  });

  it('disables copy buttons when correlation IDs are missing', async () => {
    listMock.mockResolvedValue({
      items: [
        {
          ...baseLog,
          id: 'log-2',
          requestId: null,
          traceId: null,
          spanId: null,
        },
      ],
    });

    renderWithQuery();

    const summaries = await screen.findAllByText('Persistence failed after retries');
    fireEvent.click(summaries[0]!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Request ID/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Trace ID/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Span ID/i })).toBeDisabled();
    });
  });

  it('debounces keyword changes before refetching', async () => {
    listMock.mockResolvedValue({ items: [baseLog] });

    renderWithQuery();

    await screen.findAllByText('Persistence failed after retries');
    expect(listMock).toHaveBeenCalledWith({
      keyword: undefined,
      level: undefined,
      service: undefined,
      range: '1h',
      limit: 200,
    });

    fireEvent.change(screen.getByPlaceholderText('Tìm thông điệp, request ID, trace ID'), {
      target: { value: 'trace-1' },
    });

    expect(listMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
    });

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        keyword: 'trace-1',
        level: undefined,
        service: undefined,
        range: '1h',
        limit: 200,
      });
    });
  });

  it('refetches when level, service, and range filters change', async () => {
    listMock.mockResolvedValue({
      items: [
        baseLog,
        {
          ...baseLog,
          id: 'log-3',
          level: 'warning',
          service: 'chat-auth-service',
          summary: 'Auth latency is rising',
          message: 'Auth latency is rising',
        },
      ],
    });

    renderWithQuery();

    await screen.findAllByText('Persistence failed after retries');
    const [levelSelect, serviceSelect, rangeSelect] = screen.getAllByRole('combobox');

    fireEvent.mouseDown(levelSelect);
    fireEvent.click((await screen.findAllByText('Cảnh báo')).at(-1)!);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        keyword: undefined,
        level: 'warning',
        service: undefined,
        range: '1h',
        limit: 200,
      });
    });

    fireEvent.mouseDown(serviceSelect);
    fireEvent.click((await screen.findAllByText('chat-auth-service')).at(-1)!);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        keyword: undefined,
        level: 'warning',
        service: 'chat-auth-service',
        range: '1h',
        limit: 200,
      });
    });

    fireEvent.mouseDown(rangeSelect);
    fireEvent.click((await screen.findAllByText('24 giờ')).at(-1)!);

    await waitFor(() => {
      expect(listMock).toHaveBeenLastCalledWith({
        keyword: undefined,
        level: 'warning',
        service: 'chat-auth-service',
        range: '24h',
        limit: 200,
      });
    });
  });
});
