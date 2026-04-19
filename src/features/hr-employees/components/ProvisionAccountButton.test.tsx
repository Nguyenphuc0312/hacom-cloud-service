import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AntdModule from 'antd';

import { useAuthStore } from '@/store/authStore';

const { confirmMock, mutateAsyncMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
}));

vi.mock('antd', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof AntdModule;
  return {
    ...actual,
    Modal: {
      ...actual.Modal,
      confirm: confirmMock,
    },
    message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock('../hooks/useHrEmployeeMutations', () => ({
  useProvisionHrEmployeeAccountMutation: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

import { ProvisionAccountButton } from './ProvisionAccountButton';

describe('ProvisionAccountButton', () => {
  beforeEach(() => {
    confirmMock.mockReset();
    mutateAsyncMock.mockReset();
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin-1',
        email: 'admin@company.test',
        role: 'hr_admin',
      },
    });
  });

  it('disables the button when provisioning is not allowed', () => {
    render(
      <ProvisionAccountButton
        employee={{
          id: 'hr-1',
          employeeCode: 'EMP001',
          email: '',
          phone: null,
          fullName: 'Employee 1',
          orgUnit: null,
          title: null,
          status: 'ACTIVE',
          createdAt: null,
          updatedAt: null,
        }}
        canWrite
      />,
    );

    expect(screen.getByRole('button', { name: 'Cấp tài khoản' })).toBeDisabled();
  });

  it('opens confirm flow when provisioning is allowed', () => {
    render(
      <ProvisionAccountButton
        employee={{
          id: 'hr-1',
          employeeCode: 'EMP001',
          email: 'employee@company.test',
          phone: null,
          fullName: 'Employee 1',
          orgUnit: null,
          title: null,
          status: 'ACTIVE',
          createdAt: null,
          updatedAt: null,
        }}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cấp tài khoản' }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate provision submit inside confirm onOk', async () => {
    let resolveMutation: () => void = () => {
      throw new Error('resolveMutation not initialized');
    };
    mutateAsyncMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({});
        }),
    );

    render(
      <ProvisionAccountButton
        employee={{
          id: 'hr-1',
          employeeCode: 'EMP001',
          email: 'employee@company.test',
          phone: null,
          fullName: 'Employee 1',
          orgUnit: null,
          title: null,
          status: 'ACTIVE',
          createdAt: null,
          updatedAt: null,
        }}
        canWrite
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cấp tài khoản' }));

    const confirmConfig = confirmMock.mock.calls[0]?.[0] as {
      onOk?: () => Promise<void>;
    };
    expect(confirmConfig?.onOk).toBeDefined();

    const onOk = confirmConfig.onOk!;
    void onOk();
    void onOk();

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);

    resolveMutation();
  });
});
