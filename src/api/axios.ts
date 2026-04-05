import axios from 'axios';

import { getAccessToken, useAuthStore } from '@/store/authStore';

const baseURL = import.meta.env.VITE_ADMIN_API_BASE_URL;
const rawBasePath = import.meta.env.BASE_URL || '/';
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;
const loginPath = `${normalizedBasePath}login`;
const loginPathname = new URL(loginPath, window.location.origin).pathname;

if (!baseURL) {
  // Fail fast for missing env setup.
  throw new Error('Missing VITE_ADMIN_API_BASE_URL in environment variables.');
}

export const axiosInstance = axios.create({
  baseURL,
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
