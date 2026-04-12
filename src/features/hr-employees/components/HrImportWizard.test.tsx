import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/store/authStore';

const validateMutateAsyncMock = vi.fn();
const commitMutateAsyncMock = vi.fn();

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

    render(<HrImportWizard open onClose={vi.fn()} />);

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
      expect(
        screen.getAllByText((_, element) =>
          element?.textContent?.includes('Commit result is normalized defensively') ?? false,
        ).length,
      ).toBeGreaterThan(0);
    });
  });
});
