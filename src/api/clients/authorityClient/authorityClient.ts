import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { AuthorityDetailResponse, AuthorityListResponse, ReplaceAuthorityOverridesPayload, UpdateAuthorityRolePayload } from '@/api/types/authority/authority';

export const authorityClient = {
  async listUsers(params: {
    page?: number;
    limit?: number;
    keyword?: string;
  }): Promise<AuthorityListResponse> {
    const response = await adminAxiosInstance.get('/authority/users', {
      params,
    });
    return unwrapApiEnvelope<AuthorityListResponse>(response);
  },

  async getUser(userId: string): Promise<AuthorityDetailResponse> {
    const response = await adminAxiosInstance.get(`/authority/users/${userId}`);
    return unwrapApiEnvelope<AuthorityDetailResponse>(response);
  },

  async updateRole(
    userId: string,
    payload: UpdateAuthorityRolePayload,
  ): Promise<AuthorityDetailResponse> {
    const response = await adminAxiosInstance.put(`/authority/users/${userId}/role`, payload);
    return unwrapApiEnvelope<AuthorityDetailResponse>(response);
  },

  async deleteRole(userId: string, reason?: string): Promise<AuthorityDetailResponse> {
    const response = await adminAxiosInstance.delete(`/authority/users/${userId}/role`, {
      data: { reason },
    });
    return unwrapApiEnvelope<AuthorityDetailResponse>(response);
  },

  async replaceOverrides(
    userId: string,
    payload: ReplaceAuthorityOverridesPayload,
  ): Promise<AuthorityDetailResponse> {
    const response = await adminAxiosInstance.put(`/authority/users/${userId}/overrides`, payload);
    return unwrapApiEnvelope<AuthorityDetailResponse>(response);
  },
};
