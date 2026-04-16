import axios from 'axios';
import type { AxiosInstance } from 'axios';

import { adminApiBaseUrl, authApiBaseUrl } from '@/api/routes';
import { getAccessToken, useAuthStore } from '@/store/authStore';

const rawBasePath = import.meta.env.BASE_URL || '/';
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;
const loginPath = `${normalizedBasePath}login`;
const loginPathname = new URL(loginPath, window.location.origin).pathname;

const createJsonClient = (baseURL: string): AxiosInstance =>
  axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

export const adminAxiosInstance = createJsonClient(adminApiBaseUrl);
export const authAxiosInstance = createJsonClient(authApiBaseUrl);

const buildRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `rid-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const attachRequestId = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    if (!config.headers['x-request-id']) {
      config.headers['x-request-id'] = buildRequestId();
    }

    return config;
  });
};

const attachAuthHeader = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });
};

const attachUnauthorizedRedirect = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const requestUrl = `${error?.config?.url ?? ''}`;

      if (status === 401 && !requestUrl.includes('/auth/login')) {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== loginPathname) {
          window.location.replace(loginPath);
        }
      }

      return Promise.reject(error);
    },
  );
};

[adminAxiosInstance].forEach((client) => {
  attachRequestId(client);
  attachAuthHeader(client);
  attachUnauthorizedRedirect(client);
});

attachRequestId(authAxiosInstance);
