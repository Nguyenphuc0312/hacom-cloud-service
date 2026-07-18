import { chatApiAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type {
  SupportIssueDetail,
  SupportIssueListResponse,
  SupportIssueQuery,
  SupportIssueStatus,
  SupportIssueSummary,
} from '@/api/types/support/support';

/** Shape thô từ chat-api: dùng offset/limit/total, không phải page/pagination. */
interface SupportListPayload {
  issues: SupportIssueSummary[];
  total: number;
  limit: number;
  offset: number;
}

export const supportClient = {
  async list(params?: SupportIssueQuery): Promise<SupportIssueListResponse> {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;

    // chat-api nhận offset; admin UI nghĩ theo page → quy đổi tại biên client.
    const response = await chatApiAxiosInstance.get('/support/issues', {
      params: {
        limit,
        offset: (page - 1) * limit,
        status: params?.status,
        priority: params?.priority,
      },
    });
    const data = unwrapApiEnvelope<SupportListPayload>(response);

    const total = typeof data.total === 'number' ? data.total : 0;
    return {
      items: Array.isArray(data.issues) ? data.issues : [],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async detail(id: string): Promise<SupportIssueDetail> {
    const response = await chatApiAxiosInstance.get(`/support/issues/${id}`);
    return unwrapApiEnvelope<SupportIssueDetail>(response);
  },

  async updateStatus(
    id: string,
    input: { status: SupportIssueStatus; resolutionNote?: string | null },
  ): Promise<SupportIssueDetail> {
    const response = await chatApiAxiosInstance.patch(`/support/issues/${id}/status`, input);
    return unwrapApiEnvelope<SupportIssueDetail>(response);
  },
};
