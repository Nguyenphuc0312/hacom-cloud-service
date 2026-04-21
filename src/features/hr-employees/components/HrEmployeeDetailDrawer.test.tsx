import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getByIdMock } = vi.hoisted(() => ({
  getByIdMock: vi.fn(),
}));

vi.mock('@/api/clients', () => ({
  hrEmployeesClient: {
    getById: getByIdMock,
  },
}));

vi.mock('./ProvisionAccountButton', () => ({
  ProvisionAccountButton: () => <button type="button">Cấp tài khoản</button>,
}));

import { HrEmployeeDetailDrawer } from './HrEmployeeDetailDrawer';

const renderWithQuery = (ui: React.ReactNode) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('HrEmployeeDetailDrawer', () => {
  beforeEach(() => {
    getByIdMock.mockReset();
  });

  it('renders HR, account, and action sections from detail data', async () => {
    getByIdMock.mockResolvedValue({
      id: 'hr-1',
      employeeCode: 'EMP001',
      email: 'employee@company.test',
      phone: null,
      fullName: 'Employee 1',
      fullNameFromHr: 'Nguyen Van A',
      emailFromHr: 'employee@company.test',
      departmentName: 'Engineering',
      unitCode: 'ENG',
      orgUnit: 'Engineering',
      title: null,
      status: 'ACTIVE',
      provisioningStatus: 'PROVISIONED',
      activationStatus: 'PENDING',
      linkedUser: {
        id: 'user-1',
        loginIdentifier: 'employee@company.test',
        displayName: 'Nguyen Van A',
        accountState: 'INACTIVE',
      },
      createdAt: null,
      updatedAt: null,
    });

    renderWithQuery(<HrEmployeeDetailDrawer employeeId="hr-1" open canWrite onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ HR')).toBeInTheDocument();
    });

    expect(screen.getByText('Liên kết tài khoản')).toBeInTheDocument();
    expect(screen.getByText('Tác vụ nhanh')).toBeInTheDocument();
    expect(screen.getAllByText('Cấp tài khoản').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Drawer này chỉ để inspect nhanh và cấp tài khoản khi đủ điều kiện.'),
    ).toBeInTheDocument();
  });

  it('prevents duplicate refresh action while refresh is pending', async () => {
    let resolveRefresh: () => void = () => {
      throw new Error('resolveRefresh not initialized');
    };
    const detailPayload = {
      id: 'hr-1',
      employeeCode: 'EMP001',
      email: 'employee@company.test',
      phone: null,
      fullName: 'Employee 1',
      fullNameFromHr: 'Nguyen Van A',
      emailFromHr: 'employee@company.test',
      departmentName: 'Engineering',
      unitCode: 'ENG',
      orgUnit: 'Engineering',
      title: null,
      status: 'ACTIVE',
      provisioningStatus: 'PROVISIONED',
      activationStatus: 'PENDING',
      linkedUser: {
        id: 'user-1',
        loginIdentifier: 'employee@company.test',
        displayName: 'Nguyen Van A',
        accountState: 'INACTIVE',
      },
      createdAt: null,
      updatedAt: null,
    };

    getByIdMock.mockResolvedValueOnce(detailPayload).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = () => resolve(detailPayload);
        }),
    );

    renderWithQuery(<HrEmployeeDetailDrawer employeeId="hr-1" open canWrite onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Hồ sơ HR')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /Làm mới/i });
    fireEvent.click(refreshButton);
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(getByIdMock).toHaveBeenCalledTimes(2);
    });

    resolveRefresh();
  });
});
