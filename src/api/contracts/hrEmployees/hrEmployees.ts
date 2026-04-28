import { asPaginationMeta } from '@/api/envelope/envelope';
import type { HrEmployee, HrEmployeeListResponse, HrEmployeeMutationResult, HrImportCommitResult, HrImportErrorReport, HrImportPreviewRow, HrImportSummary, HrImportValidationResult, ProvisionHrEmployeeAccountResult } from '@/api/types/hr-employees/hr-employees';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) as string[] : [];

const normalizeHrImportSummary = (value: unknown): HrImportSummary => {
  const record = asRecord(value) || {};

  return {
    totalRows: asNumber(record.totalRows),
    validRows: asNumber(record.validRows),
    invalidRows: asNumber(record.invalidRows),
    warningCount: asNumber(record.warningCount),
  };
};

const normalizeHrImportPreviewRow = (value: unknown, index: number): HrImportPreviewRow => {
  const record = asRecord(value) || {};

  return {
    rowNumber: asNumber(record.rowNumber, index + 1),
    employeeCode:
      asString(record.employeeCode) ||
      asString(record.employee_code) ||
      asString(record.employeeId),
    fullName: asString(record.fullName) || asString(record.full_name),
    email: asString(record.email),
    departmentName: asString(record.departmentName) || asString(record.department_name),
    unitCode: asString(record.unitCode) || asString(record.unit_code),
    errors: asStringArray(record.errors),
    warnings: asStringArray(record.warnings),
  };
};

export const normalizeHrEmployee = (value: unknown): HrEmployee => {
  const record = asRecord(value) || {};
  const linkedUserRecord =
    asRecord(record.linkedUser) || asRecord(record.linked_user) || asRecord(record.account);
  const importMetadataRecord =
    asRecord(record.importMetadata) ||
    asRecord(record.import_metadata) ||
    asRecord(record.importContext);

  return {
    id: asString(record.id) || '',
    employeeCode:
      asString(record.employeeCode) ||
      asString(record.employee_code) ||
      asString(record.employeeId) ||
      '-',
    email: asString(record.email) || asString(record.emailFromHr) || asString(record.email_from_hr) || '',
    phone: asString(record.phone),
    fullName:
      asString(record.fullName) ||
      asString(record.full_name) ||
      asString(record.fullNameFromHr) ||
      asString(record.full_name_from_hr) ||
      '-',
    orgUnit:
      asString(record.orgUnit) ||
      asString(record.org_unit) ||
      asString(record.departmentName) ||
      asString(record.department_name),
    title: asString(record.title),
    status:
      (asString(record.status) as HrEmployee['status']) ||
      'ACTIVE',
    createdAt: asString(record.createdAt) || asString(record.created_at),
    updatedAt: asString(record.updatedAt) || asString(record.updated_at),
    fullNameFromHr:
      asString(record.fullNameFromHr) ||
      asString(record.full_name_from_hr) ||
      asString(record.hrFullName),
    emailFromHr: asString(record.emailFromHr) || asString(record.email_from_hr),
    departmentName:
      asString(record.departmentName) ||
      asString(record.department_name) ||
      asString(record.orgUnit) ||
      asString(record.org_unit),
    unitCode: asString(record.unitCode) || asString(record.unit_code),
    provisioningStatus:
      asString(record.provisioningStatus) || asString(record.provisioning_status),
    activationStatus:
      asString(record.activationStatus) || asString(record.activation_status),
    linkedUser: linkedUserRecord
      ? {
          id: asString(linkedUserRecord.id),
          loginIdentifier:
            asString(linkedUserRecord.loginIdentifier) ||
            asString(linkedUserRecord.login_identifier) ||
            asString(linkedUserRecord.email),
          displayName:
            asString(linkedUserRecord.displayName) || asString(linkedUserRecord.display_name),
          accountState:
            asString(linkedUserRecord.accountState) ||
            asString(linkedUserRecord.account_state) ||
            asString(linkedUserRecord.status),
        }
      : null,
    importMetadata: importMetadataRecord
      ? {
          batchId: asString(importMetadataRecord.batchId) || asString(importMetadataRecord.batch_id),
          sourceFileName:
            asString(importMetadataRecord.sourceFileName) ||
            asString(importMetadataRecord.source_file_name),
          importedAt:
            asString(importMetadataRecord.importedAt) ||
            asString(importMetadataRecord.imported_at),
          importedBy:
            asString(importMetadataRecord.importedBy) ||
            asString(importMetadataRecord.imported_by),
        }
      : null,
  };
};

export const normalizeHrEmployeeListResponse = (value: unknown): HrEmployeeListResponse => {
  const record = asRecord(value) || {};
  const items = Array.isArray(record.items) ? record.items : [];

  return {
    items: items.map((item) => normalizeHrEmployee(item)),
    pagination: asPaginationMeta(record.pagination),
  };
};

export const normalizeHrEmployeeMutationResult = (value: unknown): HrEmployeeMutationResult => {
  const record = asRecord(value) || {};

  return {
    action: (asString(record.action) as HrEmployeeMutationResult['action']) || 'updated',
    mode: 'auth_service',
    semantics: asString(record.semantics) as HrEmployeeMutationResult['semantics'],
    employee: normalizeHrEmployee(record.employee),
  };
};

export const normalizeHrImportValidationResult = (value: unknown): HrImportValidationResult => {
  const record = asRecord(value) || {};
  const previewRows = Array.isArray(record.previewRows) ? record.previewRows : [];

  return {
    batchId: asString(record.batchId) || '',
    summary: normalizeHrImportSummary(record.summary),
    previewRows: previewRows.map((row, index) => normalizeHrImportPreviewRow(row, index)),
    errors: asStringArray(record.errors),
    warnings: asStringArray(record.warnings),
  };
};

export const normalizeHrImportCommitResult = (value: unknown): HrImportCommitResult => {
  const record = asRecord(value) || {};

  return {
    batchId: asString(record.batchId) || '',
    committed: asBoolean(record.committed),
    importedRows: asNumber(record.importedRows),
    invalidRowCount: asNumber(record.invalidRowCount),
    inserted: asNumber(record.inserted, asNumber(record.importedRows)) || 0,
    updated: asNumber(record.updated),
    skipped: asNumber(record.skipped),
    failed: asNumber(record.failed, asNumber(record.invalidRowCount)) || 0,
  };
};

export const normalizeHrImportErrorReport = (value: unknown): HrImportErrorReport => {
  const record = asRecord(value) || {};
  const errors = Array.isArray(record.errors)
    ? record.errors.filter((item): item is Record<string, unknown> => Boolean(asRecord(item)))
    : [];

  return {
    batchId: asString(record.batchId) || '',
    sourceFileName: asString(record.sourceFileName) || asString(record.source_file_name),
    errors,
  };
};

export const normalizeProvisionHrEmployeeAccountResult = (
  value: unknown,
): ProvisionHrEmployeeAccountResult => {
  const record = asRecord(value) || {};

  return {
    userId: asString(record.userId) || asString(record.user_id),
    hrEmployeeId:
      asString(record.hrEmployeeId) || asString(record.hr_employee_id) || '',
    accountState: asString(record.accountState) || asString(record.account_state),
    activationTicket:
      asString(record.activationTicket) || asString(record.activation_ticket),
    loginIdentifier:
      asString(record.loginIdentifier) || asString(record.login_identifier),
  };
};
