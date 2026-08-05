import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/store/authStore/authStore';
import { adminAxiosInstance, authAxiosInstance } from './axios';

const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({
  config,
  data,
  headers: {},
  status,
  statusText: status === 200 ? 'OK' : 'Unauthorized',
});

const unauthorized = (config: InternalAxiosRequestConfig) =>
  new AxiosError('Unauthorized', undefined, config, undefined, response(config, {}, 401));

describe('protected request session recovery', () => {
  let originalAdminAdapter: AxiosAdapter | AxiosAdapter[] | undefined;
  let originalAuthAdapter: AxiosAdapter | AxiosAdapter[] | undefined;

  beforeEach(() => {
    originalAdminAdapter = adminAxiosInstance.defaults.adapter;
    originalAuthAdapter = authAxiosInstance.defaults.adapter;
    useAuthStore.setState({
      accessToken: 'expired-access-token',
      user: null,
      rememberMe: true,
      isInitialized: true,
    });
  });

  afterEach(() => {
    adminAxiosInstance.defaults.adapter = originalAdminAdapter;
    authAxiosInstance.defaults.adapter = originalAuthAdapter;
  });

  it('single-flights simultaneous 401 responses through one cookie refresh', async () => {
    let refreshRequests = 0;
    authAxiosInstance.defaults.adapter = async (config) => {
      refreshRequests += 1;
      return response(config, {
        success: true,
        data: { accessToken: 'renewed-access-token' },
      });
    };

    adminAxiosInstance.defaults.adapter = async (config) => {
      const authorization = new AxiosHeaders(config.headers).get('Authorization');
      if (authorization !== 'Bearer renewed-access-token') {
        throw unauthorized(config);
      }
      return response(config, { success: true, data: { ok: true } });
    };

    await expect(
      Promise.all([adminAxiosInstance.get('/first'), adminAxiosInstance.get('/second')]),
    ).resolves.toHaveLength(2);

    expect(refreshRequests).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('renewed-access-token');
  });
});
