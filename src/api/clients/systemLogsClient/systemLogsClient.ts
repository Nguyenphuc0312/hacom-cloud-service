import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { SystemLogQuery, SystemLogsResponse } from '@/api/types/system-logs/system-logs';

export const systemLogsClient = {
  async list(params?: SystemLogQuery): Promise<SystemLogsResponse> {
    const response = await adminAxiosInstance.get('/system-logs', { params });
    const data = unwrapApiEnvelope<SystemLogsResponse>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  },

  /**
   * Get logs by requestId for correlation tracing
   */
  async getByRequestId(requestId: string): Promise<SystemLogsResponse> {
    const response = await adminAxiosInstance.get(
      '/system-logs/request/' + encodeURIComponent(requestId),
    );
    const data = unwrapApiEnvelope<SystemLogsResponse>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  },

  /**
   * Get logs for a specific user
   * Requires admin.logs.user_data permission
   */
  async getByUserId(
    userId: string,
    params?: {
      level?: string;
      range?: string;
      limit?: number;
    },
    headers?: Record<string, string>,
  ): Promise<SystemLogsResponse> {
    const response = await adminAxiosInstance.get(
      '/system-logs/user/' + encodeURIComponent(userId),
      { params, headers },
    );
    const data = unwrapApiEnvelope<SystemLogsResponse>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  },

  /**
   * Get logs for a specific room
   * Requires admin.logs.user_data permission
   */
  async getByRoomId(
    roomId: string,
    params?: {
      level?: string;
      range?: string;
      limit?: number;
    },
    headers?: Record<string, string>,
  ): Promise<SystemLogsResponse> {
    const response = await adminAxiosInstance.get(
      '/system-logs/room/' + encodeURIComponent(roomId),
      { params, headers },
    );
    const data = unwrapApiEnvelope<SystemLogsResponse>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
    };
  },
};
