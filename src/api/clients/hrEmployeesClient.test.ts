import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosInstanceMock } = vi.hoisted(() => ({
  axiosInstanceMock: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/api/axios', () => ({
  axiosInstance: axiosInstanceMock,
}));

import { hrEmployeesClient } from './hrEmployeesClient';

describe('hrEmployeesClient', () => {
  beforeEach(() => {
    axiosInstanceMock.get.mockReset();
    axiosInstanceMock.post.mockReset();
    axiosInstanceMock.patch.mockReset();
    axiosInstanceMock.delete.mockReset();
  });

  it('calls validate import endpoint and returns normalized result', async () => {
    axiosInstanceMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          batchId: 'batch-1',
          summary: {
            totalRows: 1,
            validRows: 1,
            invalidRows: 0,
            warningCount: 0,
          },
          previewRows: [],
          errors: [],
          warnings: [],
        },
      },
    });

    await expect(
      hrEmployeesClient.validateHrImport({
        fileName: 'employees.xlsx',
        fileBase64: 'ZmFrZS1iYXNlNjQ=',
      }),
    ).resolves.toMatchObject({
      batchId: 'batch-1',
      summary: {
        totalRows: 1,
      },
    });

    expect(axiosInstanceMock.post).toHaveBeenCalledWith('/admin/hr-imports/validate', {
      fileName: 'employees.xlsx',
      fileBase64: 'ZmFrZS1iYXNlNjQ=',
    });
  });

  it('calls provision endpoint and returns normalized result', async () => {
    axiosInstanceMock.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          userId: 'user-1',
          hrEmployeeId: 'hr-1',
          accountState: 'INACTIVE',
          activationTicket: 'ticket-1',
          loginIdentifier: 'user@company.test',
        },
      },
    });

    await expect(
      hrEmployeesClient.provisionHrEmployeeAccount('hr-1', {
        actorEmail: 'admin@company.test',
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      hrEmployeeId: 'hr-1',
      accountState: 'INACTIVE',
      activationTicket: 'ticket-1',
      loginIdentifier: 'user@company.test',
    });

    expect(axiosInstanceMock.post).toHaveBeenCalledWith(
      '/admin/hr-employees/hr-1/provision-account',
      {
        actorEmail: 'admin@company.test',
      },
    );
  });
});
