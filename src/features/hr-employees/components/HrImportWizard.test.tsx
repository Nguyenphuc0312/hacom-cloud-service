import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AntdModule from 'antd';

import { useAuthStore } from '@/store/authStore';

const validateMutateAsyncMock = vi.fn();
const commitMutateAsyncMock = vi.fn();

vi.mock('antd', async () => {
  const actual = (await vi.importActual('antd')) as typeof AntdModule;
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      loading: vi.fn(),
      open: vi.fn(),
      destroy: vi.fn(),
    },
  };
});

vi.mock('../hooks/useHrEmployeeMutations', () => ({
  useValidateHrImportMutation: () => ({
    mutateAsync: validateMutateAsyncMock,
    isPending: false,
  }),
  useCommitHrImportMutation: () => ({
    mutateAsync: commitMutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('@/api/clients', () => ({
  hrEmployeesClient: {
    downloadHrImportReport: vi.fn(),
  },
}));

import { HrImportWizard } from './HrImportWizard';

class MockFileReader {
  public result: string | null = 'data:application/octet-stream;base64,ZmFrZQ==';
  public onload: null | (() => void) = null;
  public onerror: null | (() => void) = null;

  readAsDataURL(): void {
    this.onload?.();
  }
}

describe('HrImportWizard', () => {
  beforeEach(() => {
    validateMutateAsyncMock.mockReset();
    commitMutateAsyncMock.mockReset();
    vi.stubGlobal('FileReader', MockFileReader);
    useAuthStore.setState({
      accessToken: 'token',
      user: {
        id: 'admin-1',
        email: 'admin@company.test',
        role: 'hr_admin',
      },
    });
  });

  it('uploads, validates, and commits an HR import through the 3-step wizard', async () => {
    const onCommitted = vi.fn();

    validateMutateAsyncMock.mockResolvedValue({
      batchId: 'batch-1',
      summary: {
        totalRows: 3,
        validRows: 2,
        invalidRows: 1,
        warningCount: 1,
      },
      previewRows: [
        {
          rowNumber: 2,
          employeeCode: 'EMP002',
          fullName: 'Nguyen Van B',
          email: 'employee@company.test',
          departmentName: 'Finance',
          unitCode: 'FIN',
          errors: [],
          warnings: [],
        },
      ],
      errors: [],
      warnings: ['Header normalized'],
    });
    commitMutateAsyncMock.mockResolvedValue({
      batchId: 'batch-1',
      inserted: 2,
      updated: 1,
      skipped: 0,
      failed: 0,
      committed: true,
      importedRows: 3,
      invalidRowCount: 0,
    });

    render(<HrImportWizard open onClose={vi.fn()} onCommitted={onCommitted} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['demo'], 'employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByRole('button', { name: /Validate preview/i }));

    await waitFor(() => {
      expect(validateMutateAsyncMock).toHaveBeenCalled();
    });

    expect(screen.getByText('Step 2: Validate preview')).toBeInTheDocument();
    expect(screen.getByText('Nguyen Van B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Commit import' }));

    await waitFor(() => {
      expect(commitMutateAsyncMock).toHaveBeenCalledWith({
        batchId: 'batch-1',
        payload: expect.objectContaining({
          actorEmail: 'admin@company.test',
        }),
      });
    });

    await waitFor(() => {
      expect(onCommitted).toHaveBeenCalledWith({
        batchId: 'batch-1',
        inserted: 2,
        updated: 1,
        skipped: 0,
        failed: 0,
      });
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(
          (_, element) =>
            element?.textContent?.includes('Commit result is normalized defensively') ?? false,
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  it('prevents duplicate validate submit while validation is in flight', async () => {
    let resolveValidate: (value: unknown) => void = () => {
      throw new Error('resolveValidate not initialized');
    };
    validateMutateAsyncMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveValidate = resolve;
        }),
    );

    render(<HrImportWizard open onClose={vi.fn()} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['demo'], 'employees.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, {
      target: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText(/Selected file:/i)).toBeInTheDocument();
    });

    const validateButton = screen.getByRole('button', { name: /Validate preview/i });
    fireEvent.click(validateButton);
    fireEvent.click(validateButton);

    await waitFor(() => {
      expect(validateMutateAsyncMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveValidate({
        batchId: 'batch-2',
        summary: {
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          warningCount: 0,
        },
        previewRows: [],
        errors: [],
        warnings: [],
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Step 2: Validate preview')).toBeInTheDocument();
    });
  });
});
