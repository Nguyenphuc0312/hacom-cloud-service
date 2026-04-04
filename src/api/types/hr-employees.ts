import type { PaginationMeta } from '@/api/envelope';

export type HrEmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'LEFT' | 'SUSPENDED';

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

export interface CreateHrEmployeePayload {
  employeeCode: string;
  email: string;
  fullName: string;
  phone?: string;
  orgUnit?: string;
  title?: string;
  status?: HrEmployeeStatus;
}

export interface UpdateHrEmployeePayload {
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
