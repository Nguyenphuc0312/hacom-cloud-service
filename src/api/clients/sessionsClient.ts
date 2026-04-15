import { adminAxiosInstance } from '@/api/axios';
import { asPaginationMeta, unwrapApiEnvelope } from '@/api/envelope';
import type {
  UserDevice,
  UserDevicesQuery,
  UserDevicesResponse,
  UserSession,
  UserSessionsQuery,
  UserSessionsResponse,
} from '@/api/types';

interface SessionsPayload {
  items: UserSession[];
  pagination: unknown;
}

interface DevicesPayload {
  items: UserDevice[];
  pagination: unknown;
}

export const sessionsClient = {
  async listByUserId(userId: string, params: UserSessionsQuery): Promise<UserSessionsResponse> {
    const response = await adminAxiosInstance.get(`/users/${userId}/sessions`, { params });
    const data = unwrapApiEnvelope<SessionsPayload>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: asPaginationMeta(data.pagination),
    };
  },

  async listDevicesByUserId(
    userId: string,
    params: UserDevicesQuery,
  ): Promise<UserDevicesResponse> {
    const response = await adminAxiosInstance.get(`/users/${userId}/devices`, { params });
    const data = unwrapApiEnvelope<DevicesPayload>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: asPaginationMeta(data.pagination),
    };
  },
};
