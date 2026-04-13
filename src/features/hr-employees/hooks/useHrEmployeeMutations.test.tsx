import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { commitHrImportMock, provisionHrEmployeeAccountMock, invalidateMock } = vi.hoisted(() => ({
  commitHrImportMock: vi.fn(),
  provisionHrEmployeeAccountMock: vi.fn(),
  invalidateMock: vi.fn(),
}));

vi.mock('@/api/clients', () => ({
  hrEmployeesClient: {
    commitHrImport: commitHrImportMock,
    provisionHrEmployeeAccount: provisionHrEmployeeAccountMock,
  },
}));

vi.mock('../queryUtils', () => ({
  invalidateHrEmployeeQueries: invalidateMock,
}));

import {
  useCommitHrImportMutation,
  useProvisionHrEmployeeAccountMutation,
} from './useHrEmployeeMutations';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useHrEmployeeMutations', () => {
  beforeEach(() => {
    commitHrImportMock.mockReset();
    provisionHrEmployeeAccountMock.mockReset();
    invalidateMock.mockReset();
    invalidateMock.mockResolvedValue(undefined);
  });

  it('invalidates HR queries after commit import succeeds', async () => {
    commitHrImportMock.mockResolvedValue({
      batchId: 'batch-1',
      committed: true,
      importedRows: 2,
      invalidRowCount: 0,
    });

    const { result } = renderHook(() => useCommitHrImportMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        batchId: 'batch-1',
        payload: { actorEmail: 'admin@company.test' },
      });
    });

    expect(commitHrImportMock).toHaveBeenCalledWith('batch-1', {
      actorEmail: 'admin@company.test',
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('invalidates list and detail after provision succeeds', async () => {
    provisionHrEmployeeAccountMock.mockResolvedValue({
      userId: 'user-1',
      hrEmployeeId: 'hr-1',
      accountState: 'INACTIVE',
      activationTicket: null,
      loginIdentifier: 'employee@company.test',
    });

    const { result } = renderHook(() => useProvisionHrEmployeeAccountMutation(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        employeeId: 'hr-1',
        payload: { actorEmail: 'admin@company.test' },
      });
    });

    expect(provisionHrEmployeeAccountMock).toHaveBeenCalledWith('hr-1', {
      actorEmail: 'admin@company.test',
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock.mock.calls[0]?.[1]).toBe('hr-1');
  });
});
