import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { adminAxiosInstance } from '@/api/axios/axios';
import { assertAdminApiPath } from '@/api/routes/routes';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';

export interface OnlineUser {
  userId: string;
  displayName: string;
  email: string;
  department?: string;
  device?: string;
  browser?: string;
  ip?: string;
  lastActive: string;
  status: 'online' | 'idle' | 'disconnected';
  currentRoom?: string;
}

export interface OnlineUsersResponse {
  users: OnlineUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RealtimeOverview {
  onlineUsers: number;
  activeConnections: number;
  messagesPerMinute: number;
  apiRequestsPerMinute: number;
  errorRate: number;
  avgLatencyMs: number;
  wsDeliveryFailures: number;
  redisStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  databaseStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  systemUptime: string;
  lastUpdated: string;
}

export interface TypingUser {
  userId: string;
  displayName: string;
  roomId: string;
  roomName?: string;
  startedAt: string;
}

export interface TypingUsersResponse {
  users: TypingUser[];
  total: number;
}

export interface ActiveRoom {
  roomId: string;
  roomName?: string;
  type: 'dm' | 'group';
  onlineMembers: number;
  totalMembers: number;
  lastActivity: string;
}

export interface ActiveRoomsResponse {
  rooms: ActiveRoom[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MessageTrafficPoint {
  timestamp: string;
  sent: number;
  delivered: number;
  failed: number;
}

export interface MessageTrafficResponse {
  points: MessageTrafficPoint[];
  range: string;
  bucket: string;
}

export interface ApiTrafficPoint {
  timestamp: string;
  requests: number;
  errors: number;
  avgLatencyMs: number;
}

export interface ApiTrafficResponse {
  points: ApiTrafficPoint[];
  range: string;
  service: string;
}

export const realtimeClient = {
  async getOverview(): Promise<RealtimeOverview> {
    const path = '/realtime/overview';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path);
    return unwrapApiEnvelope<RealtimeOverview>(response);
  },

  async getOnlineUsers(
    page: number = 1,
    pageSize: number = 50,
    search?: string,
    departmentId?: string,
  ): Promise<OnlineUsersResponse> {
    const params: Record<string, string | number> = { page, pageSize };
    if (search) params.q = search;
    if (departmentId) params.departmentId = departmentId;

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
