import type { AxiosResponse } from 'axios';
import { adminAxiosInstance } from '@/api/axios/axios';
import type { ApiEnvelope } from '@/api/envelope/envelope';
import type { BackupStatusResponse } from '@/api/types/backup/backup';

export const backupClient = {
  async getStatus(): Promise<BackupStatusResponse> {
    // NOTE: adminAxiosInstance already has baseURL '/api/v1/admin'
    // Do NOT include the prefix in the path
    const response: AxiosResponse<ApiEnvelope<BackupStatusResponse>> = await adminAxiosInstance.get('/backup/status');
    const payload = response.data;

    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success) {
        return payload.data;
      }
      throw new Error((payload as { error?: { message?: string } }).error?.message ?? 'Request failed');
    }

    return payload as BackupStatusResponse;
  },
};
