import { axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { asPaginationMeta, unwrapApiEnvelope } from '@/api/envelope';
import type {
  UserActionPayload,
  UserActionResponse,
  UserDetail,
  UserListItem,
  UsersListQuery,
  UsersListResponse,
} from '@/api/types';

interface UsersListPayload {
  items: UserListItem[];
  pagination: unknown;
  filters: UsersListResponse['filters'];
}

export const usersClient = {
  async list(params: UsersListQuery): Promise<UsersListResponse> {
    const response = await axiosInstance.get(adminApiPath('/users'), { params });
    const data = unwrapApiEnvelope<UsersListPayload>(response);

    return {
      items: Array.isArray(data.items) ? data.items : [],
      pagination: asPaginationMeta(data.pagination),
      filters: data.filters ?? {},
    };
  },

  async getById(id: string): Promise<UserDetail> {
    const response = await axiosInstance.get(adminApiPath(`/users/${id}`));
    return unwrapApiEnvelope<UserDetail>(response);
  },

  async lock(id: string, payload?: UserActionPayload): Promise<UserActionResponse> {
    const response = await axiosInstance.post(adminApiPath(`/users/${id}/lock`), payload ?? {});
    return unwrapApiEnvelope<UserActionResponse>(response);
  },

  async unlock(id: string, payload?: UserActionPayload): Promise<UserActionResponse> {
    const response = await axiosInstance.post(adminApiPath(`/users/${id}/unlock`), payload ?? {});
    return unwrapApiEnvelope<UserActionResponse>(response);
  },

  async revokeSessions(id: string, payload?: UserActionPayload): Promise<UserActionResponse> {
    const response = await axiosInstance.post(
      adminApiPath(`/users/${id}/revoke-sessions`),
      payload ?? {},
    );
    return unwrapApiEnvelope<UserActionResponse>(response);
  },
};
