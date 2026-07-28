import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { adminAxiosInstance } from '@/api/axios/axios';
import { assertAdminApiPath } from '@/api/routes/routes';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';

/**
 * Contracts live in `@/api/types/realtime` — the single mirror of the backend
 * response shapes. Re-exported here for existing import sites; do not redeclare
 * them in this file.
 *
 * Presence truth comes from Redis (written by chat-websocket-service) and
 * carries no device/browser/IP: it reports `presenceState`, and real device data
 * is loaded per user from the auth-owned devices/sessions endpoints. Do not add
 * device columns fed by presence.
 */
export type {
  ActiveRoom,
  ActiveRoomsResponse,
  ApiTrafficResponse,
  MessageTrafficResponse,
  OnlineUser,
  OnlineUsersResponse,
  RealtimeOverview,
  TypingUser,
  TypingUsersResponse,
} from '@/api/types/realtime/realtime';

import type {
  ActiveRoomsResponse,
  ApiTrafficResponse,
  MessageTrafficResponse,
  OnlineUsersResponse,
  RealtimeOverview,
  TypingUsersResponse,
} from '@/api/types/realtime/realtime';

export interface OnlineUsersQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  departmentId?: string;
  /** Presence state filter, applied by the backend so pagination stays correct. */
  state?: string;
}

export const realtimeClient = {
  async getOverview(): Promise<RealtimeOverview> {
    const path = '/realtime/overview';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path);
    return unwrapApiEnvelope<RealtimeOverview>(response);
  },

  async getOnlineUsers(query: OnlineUsersQuery = {}): Promise<OnlineUsersResponse> {
    const { page = 1, pageSize = 50, search, departmentId, state } = query;
    const params: Record<string, string | number> = { page, pageSize };
    if (search) params.q = search;
    if (departmentId) params.departmentId = departmentId;
    if (state) params.state = state;

    const path = '/realtime/online-users';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<OnlineUsersResponse>(response);
  },

  async getTypingUsers(
    page: number = 1,
    pageSize: number = 50,
    roomId?: string,
    userId?: string,
  ): Promise<TypingUsersResponse> {
    const params: Record<string, string | number> = { page, pageSize };
    if (roomId) params.roomId = roomId;
    if (userId) params.userId = userId;

    const path = '/realtime/typing-users';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<TypingUsersResponse>(response);
  },

  async getActiveRooms(
    page: number = 1,
    pageSize: number = 50,
    sortBy: 'onlineMembers' | 'lastActivity' = 'onlineMembers',
    order: 'asc' | 'desc' = 'desc',
  ): Promise<ActiveRoomsResponse> {
    const params: Record<string, string | number> = { page, pageSize, sortBy, order };
    const path = '/realtime/active-rooms';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<ActiveRoomsResponse>(response);
  },

  async getMessageTraffic(
    range: '15m' | '1h' | '6h' | '24h' = '1h',
    bucket: '1m' | '5m' | '15m' = '1m',
  ): Promise<MessageTrafficResponse> {
    const params = { range, bucket };
    const path = '/traffic/messages';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<MessageTrafficResponse>(response);
  },

  async getApiTraffic(
    range: '15m' | '1h' | '6h' | '24h' = '1h',
    service: string = 'chat-api-service',
  ): Promise<ApiTrafficResponse> {
    const params = { range, service };
    const path = '/traffic/api';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<ApiTrafficResponse>(response);
  },
};

/**
 * React Query hook for message traffic
 */
export const useMessageTrafficQuery = (
  range: '15m' | '1h' | '6h' | '24h' = '1h',
  bucket: '1m' | '5m' | '15m' = '1m',
) => {
  return useQuery({
    queryKey: ['message-traffic', range, bucket],
    queryFn: () => realtimeClient.getMessageTraffic(range, bucket),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 1,
  });
};

/**
 * React Query hook for API traffic
 */
export const useApiTrafficQuery = (
  range: '15m' | '1h' | '6h' | '24h' = '1h',
  service: string = 'chat-api-service',
) => {
  return useQuery({
    queryKey: ['api-traffic', range, service],
    queryFn: () => realtimeClient.getApiTraffic(range, service),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    retry: 1,
  });
};
