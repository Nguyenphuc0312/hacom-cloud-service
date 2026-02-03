/**
 * @fileoverview Cấu hình Axios client
 * Xử lý interceptors, token refresh, error handling
 */

import axios, { AxiosError } from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, AUTH_CONFIG } from "../config";

// Tạo axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Flag để tránh multiple refresh requests
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Xử lý queue các request failed trong khi đang refresh token
 */
const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

/**
 * Lấy token từ storage
 */
const getStoredToken = (): string | null => {
  return (
    localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
    sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)
  );
};

/**
 * Lấy refresh token từ storage
 */
const getStoredRefreshToken = (): string | null => {
  return (
    localStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY) ||
    sessionStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY)
  );
};

/**
 * Lưu tokens vào storage
 */
export const storeTokens = (
  accessToken: string,
  refreshToken: string,
  rememberMe: boolean = false,
) => {
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem(AUTH_CONFIG.ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
  if (rememberMe) {
    localStorage.setItem(AUTH_CONFIG.REMEMBER_ME_KEY, "true");
  }
};

/**
 * Xóa tokens khỏi storage
 */
export const clearTokens = () => {
  localStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
};

/**
 * Request interceptor - Thêm token vào header
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor - Xử lý token refresh và errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Nếu lỗi 401 và chưa retry
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Nếu đang refresh, thêm vào queue
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getStoredRefreshToken();

      if (!refreshToken) {
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        // Gọi API refresh token
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } =
          response.data.data;
        const rememberMe =
          localStorage.getItem(AUTH_CONFIG.REMEMBER_ME_KEY) === "true";

        storeTokens(accessToken, newRefreshToken, rememberMe);
        processQueue(null, accessToken);

        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        }

        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;

/**
 * Type cho API Response
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Type cho API Error
 */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
