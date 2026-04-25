import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import type * as AntdModule from 'antd';
import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiErrorBody, CurrentAdmin } from '@/api/types';
import { useAuthStore } from '@/store/authStore';

const { loginMock, getCurrentAdminMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  getCurrentAdminMock: vi.fn(),
}));

vi.mock('@/api/clients', () => ({
  authClient: {
    login: loginMock,
  },
  currentAdminClient: {
    getCurrentAdmin: getCurrentAdminMock,
  },
}));

vi.mock('antd', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AntdModule;
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

import { LoginPage } from './LoginPage';

const admin: CurrentAdmin = {
  id: 'admin-1',
  email: 'admin@company.test',
  username: 'admin',
  role: 'super_admin',
  permissions: ['admin.profile.read'],
};

const buildAxiosError = (
  status: number,
  code?: string,
  upstreamReason?: string,
): AxiosError<ApiErrorBody> => {
  const response: AxiosResponse<ApiErrorBody> = {
    data: code
      ? {
          success: false,
          error: {
            code,
            details: upstreamReason
              ? {
                  upstreamDetails: {
                    reason: upstreamReason,
                  },
                }
              : undefined,
          },
        }
      : { success: false },
    status,
    statusText: `${status}`,
    headers: {},
    config: {
      headers: new AxiosHeaders(),
    },
  };

  return new AxiosError('Admin preflight failed', undefined, undefined, undefined, response);
};

const renderLoginPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const submitLogin = async (container: HTMLElement) => {
  fireEvent.change(screen.getByPlaceholderText('admin@company.com'), {
    target: { value: 'admin@company.test' },
  });

  const passwordInput = container.querySelector('input[type="password"]');
  expect(passwordInput).toBeInTheDocument();
  fireEvent.change(passwordInput!, {
    target: { value: 'secret' },
  });

  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
};

describe('LoginPage admin preflight', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      user: null,
      access: null,
      accessBootstrapStatus: 'unknown',
    });
    loginMock.mockReset();
    getCurrentAdminMock.mockReset();
    vi.mocked(message.success).mockReset();
    vi.mocked(message.error).mockReset();
  });

  it('stores token and enters dashboard only after /admin/me passes', async () => {
    loginMock.mockResolvedValue({ accessToken: 'admin-token' });
    getCurrentAdminMock.mockResolvedValue(admin);

    const { container } = renderLoginPage();
    await submitLogin(container);

    await waitFor(() => {
      expect(getCurrentAdminMock).toHaveBeenCalledWith(
        expect.objectContaining({
          skipAuthRedirect: true,
          headers: expect.objectContaining({
            Authorization: 'Bearer admin-token',
          }),
        }),
      );
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('admin-token'));
    expect(useAuthStore.getState().user).toEqual(admin);
    expect(message.success).toHaveBeenCalledWith('Đăng nhập thành công.');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('clears token and shows RBAC reason when normal user logs into admin panel', async () => {
    loginMock.mockResolvedValue({ accessToken: 'normal-user-token' });
    getCurrentAdminMock.mockRejectedValue(buildAxiosError(403, 'RBAC_PERMISSION_DENIED'));

    const { container } = renderLoginPage();
    await submitLogin(container);

    const expectedMessage = 'Tài khoản của bạn không có quyền quản trị.';
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(message.error).toHaveBeenCalledWith(expectedMessage);
  });

  it('clears token and shows pending IP reason when admin IP is not approved', async () => {
    loginMock.mockResolvedValue({ accessToken: 'pending-ip-token' });
    getCurrentAdminMock.mockRejectedValue(buildAxiosError(403, 'ACCESS_IP_PENDING'));

    const { container } = renderLoginPage();
    await submitLogin(container);

    const expectedMessage =
      'IP của bạn đang chờ quản trị viên phê duyệt để truy cập admin panel.';
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(message.error).toHaveBeenCalledWith(expectedMessage);
  });

  it('clears token and shows inactive admin account reason from upstream details', async () => {
    loginMock.mockResolvedValue({ accessToken: 'inactive-admin-token' });
    getCurrentAdminMock.mockRejectedValue(
      buildAxiosError(403, 'ADMIN_PERMISSION_DENIED', 'ADMIN_ACCOUNT_NOT_ACTIVE'),
    );

    const { container } = renderLoginPage();
    await submitLogin(container);

    const expectedMessage =
      'Tài khoản admin của bạn chưa active. Vui lòng liên hệ quản trị viên để kích hoạt.';
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(message.error).toHaveBeenCalledWith(expectedMessage);
  });

  it('clears token and reports invalid session when admin preflight returns 401', async () => {
    loginMock.mockResolvedValue({ accessToken: 'expired-token' });
    getCurrentAdminMock.mockRejectedValue(buildAxiosError(401));

    const { container } = renderLoginPage();
    await submitLogin(container);

    const expectedMessage = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(message.error).toHaveBeenCalledWith(expectedMessage);
  });
});
