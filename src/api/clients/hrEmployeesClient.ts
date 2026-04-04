import { axiosInstance } from '@/api/axios';
import { asPaginationMeta, unwrapApiEnvelope } from '@/api/envelope';
import type {
  CreateHrEmployeePayload,
  HrEmployee,
  HrEmployeeListQuery,
  HrEmployeeListResponse,
  HrEmployeeMutationResult,
  UpdateHrEmployeePayload,
} from '@/api/types';

interface HrListPayload {
  items: HrEmployee[];
  pagination: unknown;
}

interface HrMutationPayload {
  action: 'created' | 'updated' | 'deleted';
  mode: 'auth_service';
  semantics?: 'deactivate_or_soft_delete';
  employee: HrEmployee;
}

export const hrEmployeesClient = {
  async list(params: HrEmployeeListQuery): Promise<HrEmployeeListResponse> {
    const response = await axiosInstance.get('/admin/hr-employees', { params });
    const data = unwrapApiEnvelope<HrListPayload>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: asPaginationMeta(data.pagination),
    };
  },

  async getById(id: string): Promise<HrEmployee> {
    const response = await axiosInstance.get(`/admin/hr-employees/${id}`);
    return unwrapApiEnvelope<HrEmployee>(response);
  },

  async create(payload: CreateHrEmployeePayload): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.post('/admin/hr-employees', payload);
    const data = unwrapApiEnvelope<HrMutationPayload>(response);
    return data;
  },

  async update(id: string, payload: UpdateHrEmployeePayload): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.patch(`/admin/hr-employees/${id}`, payload);
    const data = unwrapApiEnvelope<HrMutationPayload>(response);
    return data;
  },

  async remove(id: string): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.delete(`/admin/hr-employees/${id}`);
    const data = unwrapApiEnvelope<HrMutationPayload>(response);
    return data;
  },
};
