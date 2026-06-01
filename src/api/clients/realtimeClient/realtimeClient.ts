/**
 * API client for realtime monitoring endpoints
 */
import { adminAxiosInstance } from '@/api/axios/axios';
import type {
  RealtimeOverview,
  OnlineUsersResponse,
  TypingUsersResponse,
  ActiveRoomsResponse,
  UserLiveState,
  RoomLiveState,
  MessageTrafficResponse,
  ApiTrafficResponse,
  ObservabilityStatus,
} from '@/api/types/realtime/realtime';
import type { TimeRange } from '@/api/types/metrics/metrics';

export interface RealtimeApiEnvelope<T> {
  success: boolean;
  data?: T;
  meta?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
  };
}

export const realtimeClient = {
  /**
   * Get realtime overview summary
   */
  async getOverview(): Promise<RealtimeOverview> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<RealtimeOverview>>(
      '/admin/realtime/overview',
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Realtime overview unavailable');
  },

  /**
   * Get online users list with pagination
   */
  async getOnlineUsers(params?: {
    page?: number;
    pageSize?: number;
    q?: string;
    departmentId?: string;
    device?: string;
    order?: 'asc' | 'desc';
  }): Promise<OnlineUsersResponse> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<OnlineUsersResponse>>(
      '/admin/realtime/online-users',
      { params },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Online users list unavailable');
  },

  /**
   * Get typing users list
   */
  async getTypingUsers(params?: {
    page?: number;
    pageSize?: number;
    roomId?: string;
    userId?: string;
  }): Promise<TypingUsersResponse> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<TypingUsersResponse>>(
      '/admin/realtime/typing-users',
      { params },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Typing users list unavailable');
  },

  /**
   * Get active rooms list
   */
  async getActiveRooms(params?: {
    page?: number;
    pageSize?: number;
    sortBy?: 'onlineMembers' | 'lastActivity' | 'messages';
    order?: 'asc' | 'desc';
  }): Promise<ActiveRoomsResponse> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<ActiveRoomsResponse>>(
      '/admin/realtime/active-rooms',
      { params },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Active rooms list unavailable');
  },

  /**
   * Get detailed user live state
   * Requires audit reason
   */
  async getUserLiveState(
    userId: string,
    reason: string,
  ): Promise<UserLiveState> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<UserLiveState>>(
      `/admin/realtime/users/${userId}/live-state`,
      {
        params: { reason },
        headers: { 'X-Audit-Reason': reason },
      },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'User live state unavailable');
  },

  /**
   * Get detailed room live state
   * Requires audit reason
   */
  async getRoomLiveState(
    roomId: string,
    reason: string,
  ): Promise<RoomLiveState> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<RoomLiveState>>(
      `/admin/realtime/rooms/${roomId}/live-state`,
      {
        params: { reason },
        headers: { 'X-Audit-Reason': reason },
      },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Room live state unavailable');
  },

  /**
   * Get message traffic over time
   */
  async getMessageTraffic(params?: {
    range?: TimeRange;
    bucket?: string;
  }): Promise<MessageTrafficResponse> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<MessageTrafficResponse>>(
      '/admin/traffic/messages',
      { params },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Message traffic unavailable');
  },

  /**
   * Get API traffic metrics
   */
  async getApiTraffic(params?: {
    range?: TimeRange;
    service?: string;
  }): Promise<ApiTrafficResponse> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<ApiTrafficResponse>>(
      '/admin/traffic/api',
      { params },
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'API traffic unavailable');
  },

  /**
   * Get observability infrastructure status
   */
  async getObservabilityStatus(): Promise<ObservabilityStatus> {
    const response = await adminAxiosInstance.get<RealtimeApiEnvelope<ObservabilityStatus>>(
      '/admin/observability/status',
    );

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    if (payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Observability status unavailable');
  },
};
