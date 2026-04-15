import { adminAxiosInstance } from '@/api/axios';
import { asPaginationMeta, unwrapApiEnvelope } from '@/api/envelope';
import type { AuditListResponse, AuditQuery } from '@/api/types';

interface AuditListPayload {
  items: AuditListResponse['items'];
  pagination: unknown;
}

export const auditClient = {
  async list(params?: AuditQuery): Promise<AuditListResponse> {
    const response = await adminAxiosInstance.get('/audit-logs', { params });
    const data = unwrapApiEnvelope<AuditListPayload>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: asPaginationMeta(data.pagination),
    };
  },
};
