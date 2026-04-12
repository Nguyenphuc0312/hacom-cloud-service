import type { PaginationMeta } from '@/api/envelope';

export type HrEmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'LEFT' | 'SUSPENDED';
export type HrProvisioningStatus =
  | 'NOT_PROVISIONED'
  | 'READY'
  | 'PENDING'
  | 'PROVISIONED'
  | 'FAILED'
  | string;
export type HrActivationStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'ACTIVE'
  | 'LOCKED'
  | 'DISABLED'
  | string;

export interface LinkedHrUser {
  id: string | null;
  loginIdentifier?: string | null;
  displayName?: string | null;
  accountState?: string | null;
}

export interface HrImportMetadata {
  batchId?: string | null;
  sourceFileName?: string | null;
  importedAt?: string | null;
  importedBy?: string | null;
}

export interface HrEmployee {
  id: string;
  employeeCode: string;
  email: string;
  phone: string | null;
  fullName: string;
  orgUnit: string | null;
  title: string | null;
  status: HrEmployeeStatus;
  createdAt: string | null;
  updatedAt: string | null;
  fullNameFromHr?: string | null;
  emailFromHr?: string | null;
  departmentName?: string | null;
  unitCode?: string | null;
  provisioningStatus?: HrProvisioningStatus | null;
  activationStatus?: HrActivationStatus | null;
  linkedUser?: LinkedHrUser | null;
  importMetadata?: HrImportMetadata | null;
}

export interface HrEmployeeListQuery {
  page?: number;
  limit?: number;
  keyword?: string;
  status?: HrEmployeeStatus;
}

export interface HrEmployeeListResponse {
  items: HrEmployee[];
  pagination: PaginationMeta;
}

export interface AuditActorPayload {
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
  reason?: string;
}

export interface CreateHrEmployeePayload extends AuditActorPayload {
  employeeCode: string;
  email: string;
  fullName: string;
  phone?: string;
  orgUnit?: string;
  title?: string;
  status?: HrEmployeeStatus;
}

export interface UpdateHrEmployeePayload extends AuditActorPayload {
  employeeCode?: string;
  email?: string;
  fullName?: string;
  phone?: string;
  orgUnit?: string;
  title?: string;
  status?: HrEmployeeStatus;
}

export interface HrEmployeeMutationResult {
  action: 'created' | 'updated' | 'deleted';
  mode: 'auth_service';
  semantics?: 'deactivate_or_soft_delete';
  employee: HrEmployee;
}

export interface ValidateHrImportPayload extends AuditActorPayload {
  fileName: string;
  fileBase64: string;
}

export interface HrImportPreviewRow {
  rowNumber: number;
  employeeCode: string | null;
  fullName: string | null;
  email: string | null;
  departmentName: string | null;
  unitCode: string | null;
  errors: string[];
  warnings: string[];
}

export interface HrImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
}

export interface HrImportValidationResult {
  batchId: string;
  summary: HrImportSummary;
  previewRows: HrImportPreviewRow[];
  errors: string[];
  warnings: string[];
}

export type CommitHrImportPayload = AuditActorPayload;

export interface HrImportCommitResult {
  batchId: string;
  committed: boolean;
  importedRows: number;
  invalidRowCount: number;
}

export interface HrImportErrorReport {
  batchId: string;
  sourceFileName: string | null;
  errors: Array<Record<string, unknown>>;
}

export type ProvisionHrEmployeeAccountPayload = AuditActorPayload;

export interface ProvisionHrEmployeeAccountResult {
  userId: string | null;
  hrEmployeeId: string;
  accountState: string | null;
  activationTicket: string | null;
  loginIdentifier: string | null;
}
