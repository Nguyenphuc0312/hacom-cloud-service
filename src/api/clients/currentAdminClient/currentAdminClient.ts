import { adminAxiosInstance } from '@/api/axios/axios';
import type { ApiRequestConfig } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { CurrentAdmin, MeResponseWithConfig } from '@/api/types/auth/auth';

interface CurrentAdminPayload {
  admin: CurrentAdmin;
  config?: MeResponseWithConfig['config'];
}

export const currentAdminClient = {
  async getCurrentAdmin(config?: ApiRequestConfig): Promise<CurrentAdmin> {
    const response = await adminAxiosInstance.get('/me', config);
    const data = unwrapApiEnvelope<CurrentAdminPayload>(response);
    return data.admin;
  },

  async getCurrentAdminWithConfig(
    config?: ApiRequestConfig,
  ): Promise<MeResponseWithConfig> {
    const response = await adminAxiosInstance.get('/me', config);
    const data = unwrapApiEnvelope<CurrentAdminPayload>(response);
    return {
      admin: data.admin,
      config: data.config ?? {
        environment: 'unknown',
        allowlistConfigured: false,
        ipApprovalEnabled: false,
        writeActionsEnabled: false,
      },
    };
  },
};
