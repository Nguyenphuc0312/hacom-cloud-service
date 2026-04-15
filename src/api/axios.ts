import axios from 'axios';

import { apiBaseUrl, authApiBaseUrl } from '@/api/routes';
import { getAccessToken, useAuthStore } from '@/store/authStore';

const rawBasePath = import.meta.env.BASE_URL || '/';
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;
const loginPath = `${normalizedBasePath}login`;
const loginPathname = new URL(loginPath, window.location.origin).pathname;

export const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

export const authAxiosInstance = axios.create({
  baseURL: authApiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

const buildRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `rid-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (!config.headers['x-request-id']) {
    config.headers['x-request-id'] = buildRequestId();
  }

  return config;
});

authAxiosInstance.interceptors.request.use((config) => {
  if (!config.headers['x-request-id']) {
    config.headers['x-request-id'] = buildRequestId();
  }

  return config;
});

axiosInstance.interceptors.response.use(
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
