import { adminAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type { CurrentAdmin } from '@/api/types';

interface CurrentAdminPayload {
  admin: CurrentAdmin;
}

export const currentAdminClient = {
  async getCurrentAdmin(): Promise<CurrentAdmin> {
    const response = await adminAxiosInstance.get('/me');
    const data = unwrapApiEnvelope<CurrentAdminPayload>(response);
    return data.admin;
  },
};
