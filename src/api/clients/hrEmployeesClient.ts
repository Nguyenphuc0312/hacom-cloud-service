import { axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { unwrapApiEnvelope } from '@/api/envelope';
import {
  normalizeHrEmployee,
  normalizeHrEmployeeListResponse,
  normalizeHrEmployeeMutationResult,
  normalizeHrImportCommitResult,
  normalizeHrImportErrorReport,
  normalizeHrImportValidationResult,
  normalizeProvisionHrEmployeeAccountResult,
} from '@/api/contracts/hrEmployees';
import type {
  CommitHrImportPayload,
  CreateHrEmployeePayload,
  HrEmployee,
  HrEmployeeListQuery,
  HrEmployeeListResponse,
  HrEmployeeMutationResult,
  HrImportCommitResult,
  HrImportErrorReport,
  HrImportValidationResult,
  ProvisionHrEmployeeAccountPayload,
  ProvisionHrEmployeeAccountResult,
  UpdateHrEmployeePayload,
  ValidateHrImportPayload,
} from '@/api/types';

export const hrEmployeesClient = {
  async list(params: HrEmployeeListQuery): Promise<HrEmployeeListResponse> {
    const response = await axiosInstance.get(adminApiPath('/hr-employees'), { params });
    return normalizeHrEmployeeListResponse(unwrapApiEnvelope<unknown>(response));
  },

  async getById(id: string): Promise<HrEmployee> {
    const response = await axiosInstance.get(adminApiPath(`/hr-employees/${id}`));
    return normalizeHrEmployee(unwrapApiEnvelope<unknown>(response));
  },

  async create(payload: CreateHrEmployeePayload): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.post(adminApiPath('/hr-employees'), payload);
    return normalizeHrEmployeeMutationResult(unwrapApiEnvelope<unknown>(response));
  },

  async update(id: string, payload: UpdateHrEmployeePayload): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.patch(adminApiPath(`/hr-employees/${id}`), payload);
    return normalizeHrEmployeeMutationResult(unwrapApiEnvelope<unknown>(response));
  },

  async remove(id: string): Promise<HrEmployeeMutationResult> {
    const response = await axiosInstance.delete(adminApiPath(`/hr-employees/${id}`));
    return normalizeHrEmployeeMutationResult(unwrapApiEnvelope<unknown>(response));
  },

  async validateHrImport(payload: ValidateHrImportPayload): Promise<HrImportValidationResult> {
    const response = await axiosInstance.post(adminApiPath('/hr-imports/validate'), payload);
    return normalizeHrImportValidationResult(unwrapApiEnvelope<unknown>(response));
  },

  async commitHrImport(
    batchId: string,
    payload: CommitHrImportPayload = {},
  ): Promise<HrImportCommitResult> {
    const response = await axiosInstance.post(adminApiPath(`/hr-imports/${batchId}/commit`), payload);
    return normalizeHrImportCommitResult(unwrapApiEnvelope<unknown>(response));
  },

  async downloadHrImportReport(batchId: string): Promise<HrImportErrorReport> {
    const response = await axiosInstance.get(adminApiPath(`/hr-imports/${batchId}/report`));
    return normalizeHrImportErrorReport(unwrapApiEnvelope<unknown>(response));
  },

  async provisionHrEmployeeAccount(
    id: string,
    payload: ProvisionHrEmployeeAccountPayload = {},
  ): Promise<ProvisionHrEmployeeAccountResult> {
    const response = await axiosInstance.post(
      adminApiPath(`/hr-employees/${id}/provision-account`),
      payload,
    );
    return normalizeProvisionHrEmployeeAccountResult(unwrapApiEnvelope<unknown>(response));
  },
};
