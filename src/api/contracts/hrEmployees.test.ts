import { describe, expect, it } from 'vitest';

import {
  normalizeHrEmployee,
  normalizeHrImportValidationResult,
  normalizeProvisionHrEmployeeAccountResult,
} from './hrEmployees';

describe('hrEmployees contract normalization', () => {
  it('normalizes legacy hr employee payload into stable frontend shape', () => {
    expect(
      normalizeHrEmployee({
        id: 'hr-1',
        employeeId: 'EMP001',
        email: 'user@company.test',
        full_name: 'Nguyen Van A',
        org_unit: 'Engineering',
        provisioning_status: 'PROVISIONED',
        activation_status: 'PENDING',
        linked_user: {
          id: 'user-1',
          login_identifier: 'user@company.test',
        },
      }),
    ).toMatchObject({
      id: 'hr-1',
      employeeCode: 'EMP001',
      email: 'user@company.test',
      fullName: 'Nguyen Van A',
      orgUnit: 'Engineering',
      provisioningStatus: 'PROVISIONED',
      activationStatus: 'PENDING',
      linkedUser: {
        id: 'user-1',
        loginIdentifier: 'user@company.test',
      },
    });
  });

  it('normalizes import validation preview rows and summary', () => {
    expect(
      normalizeHrImportValidationResult({
        batchId: 'batch-1',
        summary: {
          totalRows: 10,
          validRows: 8,
          invalidRows: 2,
          warningCount: 1,
        },
        previewRows: [
          {
            rowNumber: 3,
            employee_code: 'EMP003',
            full_name: 'Nguyen Van B',
            email: 'invalid-email',
            department_name: 'Finance',
            unit_code: 'FIN',
            errors: ['Invalid email'],
          },
        ],
        errors: ['Validation failed'],
        warnings: [],
      }),
    ).toEqual({
      batchId: 'batch-1',
      summary: {
        totalRows: 10,
        validRows: 8,
        invalidRows: 2,
        warningCount: 1,
      },
      previewRows: [
        {
          rowNumber: 3,
          employeeCode: 'EMP003',
          fullName: 'Nguyen Van B',
          email: 'invalid-email',
          departmentName: 'Finance',
          unitCode: 'FIN',
          errors: ['Invalid email'],
          warnings: [],
        },
      ],
      errors: ['Validation failed'],
      warnings: [],
    });
  });

  it('normalizes provisioning result fields', () => {
    expect(
      normalizeProvisionHrEmployeeAccountResult({
        user_id: 'user-1',
        hr_employee_id: 'hr-1',
        account_state: 'INACTIVE',
        activation_ticket: 'ticket-1',
        login_identifier: 'user@company.test',
      }),
    ).toEqual({
      userId: 'user-1',
      hrEmployeeId: 'hr-1',
      accountState: 'INACTIVE',
      activationTicket: 'ticket-1',
      loginIdentifier: 'user@company.test',
    });
  });

  it('normalizes partial HR employee payload without throwing', () => {
    expect(
      normalizeHrEmployee({
        id: 'hr-2',
        employee_code: null,
        status: null,
        linked_user: {
          id: null,
        },
      }),
    ).toEqual({
      id: 'hr-2',
      employeeCode: '-',
      email: '',
      phone: null,
      fullName: '-',
      orgUnit: null,
      title: null,
      status: 'ACTIVE',
      createdAt: null,
      updatedAt: null,
      fullNameFromHr: null,
      emailFromHr: null,
      departmentName: null,
      unitCode: null,
      provisioningStatus: null,
      activationStatus: null,
      linkedUser: {
        id: null,
        loginIdentifier: null,
        displayName: null,
        accountState: null,
      },
      importMetadata: null,
    });
  });
});
