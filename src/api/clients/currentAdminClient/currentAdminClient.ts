import { adminAxiosInstance } from '@/api/axios/axios';
import type { ApiRequestConfig } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { CurrentAdmin } from '@/api/types/auth/auth';

interface CurrentAdminPayload {
  admin: CurrentAdmin;
}

export const currentAdminClient = {
  async getCurrentAdmin(config?: ApiRequestConfig): Promise<CurrentAdmin> {
    const response = await adminAxiosInstance.get('/me', config);
    const data = unwrapApiEnvelope<CurrentAdminPayload>(response);
    return data.admin;
  },
};
