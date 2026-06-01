import type { AxiosResponse } from 'axios';
import { adminAxiosInstance } from '@/api/axios/axios';
import type { ApiEnvelope } from '@/api/envelope/envelope';
import type { BackupStatusResponse } from '@/api/types/backup/backup';

export const backupClient = {
  async getStatus(): Promise<BackupStatusResponse> {
    const response: AxiosResponse<ApiEnvelope<BackupStatusResponse>> = await adminAxiosInstance.get('/api/v1/admin/backup/status');
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
