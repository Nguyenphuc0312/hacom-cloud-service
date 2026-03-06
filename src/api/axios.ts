import axios from 'axios';

import { getAccessToken, useAuthStore } from '@/store/authStore';

const baseURL = import.meta.env.VITE_ADMIN_API_BASE_URL;

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

axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      if (window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }

    return Promise.reject(error);
  },
);
