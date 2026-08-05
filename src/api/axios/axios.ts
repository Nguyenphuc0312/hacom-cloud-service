import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

import { adminApiBaseUrl, authApiBaseUrl, chatApiBaseUrl } from '@/api/routes/routes';
import { getAccessToken, useAuthStore } from '@/store/authStore/authStore';

/**
 * Extended Axios config with custom retry properties
 */
export interface ApiRequestConfig extends AxiosRequestConfig {
  skipAuthRedirect?: boolean;
  skipTabVisibilityPause?: boolean;
  retryOnVisibilityChange?: boolean;
  retry?: number;
  retryCount?: number;
  authRecoveryAttempted?: boolean;
  skipAuthRecovery?: boolean;
}

const rawBasePath = import.meta.env.BASE_URL || '/';
const normalizedBasePath = rawBasePath.endsWith('/') ? rawBasePath : `${rawBasePath}/`;
const loginPath = `${normalizedBasePath}login`;
const loginPathname = new URL(loginPath, window.location.origin).pathname;

// Tab visibility state
let isTabVisible = true;
const visibilityChangeListeners = new Set<(visible: boolean) => void>();

// Initialize tab visibility detection
if (typeof document !== 'undefined') {
  const handleVisibilityChange = () => {
    isTabVisible = !document.hidden;

    // Notify listeners about visibility change
    visibilityChangeListeners.forEach((listener) => {
      listener(isTabVisible);
    });
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Hook to get current tab visibility state
 */
export const isTabActive = (): boolean => isTabVisible;

/**
 * Subscribe to tab visibility changes
 */
export const onTabVisibilityChange = (callback: (visible: boolean) => void): (() => void) => {
  visibilityChangeListeners.add(callback);
  return () => {
    visibilityChangeListeners.delete(callback);
  };
};

const DEFAULT_RETRY_COUNT = 3;

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
// Auth owns the HttpOnly refresh cookie. Browser requests to that API must
// explicitly opt in to credentials; without this, a successful login response
// cannot establish or rotate the server-side browser session.
authAxiosInstance.defaults.withCredentials = true;
// Ticket báo cáo sự cố nằm ở chat-api-service, cùng cơ chế Bearer token với admin.
export const chatApiAxiosInstance = createJsonClient(chatApiBaseUrl);

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

const readBrowserCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;

  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  if (!entry) return undefined;

  return decodeURIComponent(entry.slice(prefix.length));
};

const attachAuthCsrfHeader = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    const method = config.method?.toLowerCase();
    if (method && !['get', 'head', 'options'].includes(method)) {
      const csrfToken = readBrowserCookie('csrfToken');
      if (csrfToken && !config.headers['x-csrf-token']) {
        config.headers['x-csrf-token'] = csrfToken;
      }
    }
    return config;
  });
};

const attachAuthHeader = (client: AxiosInstance) => {
  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  });
};

let refreshInFlight: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  if (!refreshInFlight) {
    refreshInFlight = authAxiosInstance
      .post('/refresh', {}, {
        skipAuthRedirect: true,
        skipAuthRecovery: true,
      } as ApiRequestConfig)
      .then((response) => {
        const payload = response.data as { success?: boolean; data?: { accessToken?: unknown; user?: unknown } };
        const accessToken = payload?.data?.accessToken;
        if (!payload?.success || typeof accessToken !== 'string' || !accessToken) {
          throw new Error('AUTH_REFRESH_RESPONSE_INVALID');
        }

        useAuthStore.getState().setAuth({
          accessToken,
          user: payload.data?.user as ReturnType<typeof useAuthStore.getState>['user'],
        });
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
};

const attachSessionRecovery = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error?.config as ApiRequestConfig | undefined;
      if (
        error?.response?.status !== 401 ||
        !config ||
        config.authRecoveryAttempted ||
        config.skipAuthRecovery
      ) {
        return Promise.reject(error);
      }

      config.authRecoveryAttempted = true;
      try {
        const accessToken = await refreshAccessToken();
        config.headers = config.headers ?? {};
        config.headers.Authorization = `Bearer ${accessToken}`;
        return client(config);
      } catch (refreshError) {
        // A transport or upstream failure is not proof that the refresh session
        // is invalid. Preserve local state so the caller can present/retry it.
        if (!refreshError || typeof refreshError !== 'object' || !('response' in refreshError)) {
          config.skipAuthRedirect = true;
          return Promise.reject(error);
        }
        const refreshStatus = (refreshError as { response?: { status?: number } }).response?.status;
        if (refreshStatus !== 401 && refreshStatus !== 403) {
          config.skipAuthRedirect = true;
          return Promise.reject(error);
        }
        return Promise.reject(error);
      }
    },
  );
};

const attachUnauthorizedRedirect = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const skipAuthRedirect = Boolean(
        (error?.config as { skipAuthRedirect?: boolean } | undefined)?.skipAuthRedirect,
      );
      const requestUrl = `${error?.config?.url ?? ''}`;
      const isLoginRequest =
        requestUrl.endsWith('/login') || requestUrl.includes('/auth/login');
      const isRefreshRequest =
        requestUrl.endsWith('/refresh') || requestUrl.includes('/auth/refresh');

      if (status === 401 && !isLoginRequest && !isRefreshRequest && !skipAuthRedirect) {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== loginPathname) {
          window.location.replace(loginPath);
        }
      }

      return Promise.reject(error);
    },
  );
};

/**
 * Attach retry logic for failed requests
 * Only retries on network errors or 5xx errors, not on 4xx
 */
const attachRetryLogic = (client: AxiosInstance) => {
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config as ApiRequestConfig | undefined;

      if (!config) {
        return Promise.reject(error);
      }

      const retryLimit = config.retry ?? DEFAULT_RETRY_COUNT;
      const retryCount = config.retryCount ?? 0;

      const shouldRetry =
        retryCount < retryLimit &&
        (!error.response || (error.response.status >= 500 && error.response.status < 600));

      if (shouldRetry) {
        // Check if we should pause retry when tab is hidden
        if (!config.skipTabVisibilityPause && !isTabVisible && !config.retryOnVisibilityChange) {
          // Wait for tab to become visible again before retrying
          return new Promise((resolve, reject) => {
            const handleVisibilityChange = () => {
              if (isTabVisible) {
                document.removeEventListener('visibilitychange', handleVisibilityChange);
                config.retryCount = retryCount + 1;

                // Exponential backoff before retry
                const retryDelay = Math.pow(2, retryCount + 1) * 1000;
                setTimeout(() => {
                  resolve(client(config));
                }, retryDelay);
              }
            };

            document.addEventListener('visibilitychange', handleVisibilityChange);

            // Also timeout after 60 seconds
            setTimeout(() => {
              document.removeEventListener('visibilitychange', handleVisibilityChange);
              reject(error);
            }, 60000);
          });
        }

        config.retryCount = retryCount + 1;

        // Exponential backoff
        const retryDelay = Math.pow(2, retryCount + 1) * 1000;

        await new Promise((resolve) => setTimeout(resolve, retryDelay));

        return client(config);
      }

      return Promise.reject(error);
    },
  );
};

[adminAxiosInstance, authAxiosInstance, chatApiAxiosInstance].forEach((client) => {
  attachRequestId(client);
  attachAuthHeader(client);
  if (client !== authAxiosInstance) attachSessionRecovery(client);
  attachUnauthorizedRedirect(client);
  attachRetryLogic(client);
});

attachAuthCsrfHeader(authAxiosInstance);

/**
 * Create a cancellable request using AbortController
 */
export const createCancellableRequest = () => {
  const abortController = new AbortController();

  return {
    signal: abortController.signal,
    cancel: () => abortController.abort(),
  };
};

/**
 * API connection status tracking
 */
export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

let currentConnectionStatus: ConnectionStatus = 'connecting';
const connectionStatusListeners = new Set<(status: ConnectionStatus) => void>();

export const getConnectionStatus = (): ConnectionStatus => currentConnectionStatus;

export const setConnectionStatus = (status: ConnectionStatus) => {
  currentConnectionStatus = status;
  connectionStatusListeners.forEach((listener) => listener(status));
};

export const onConnectionStatusChange = (callback: (status: ConnectionStatus) => void): (() => void) => {
  connectionStatusListeners.add(callback);
  return () => {
    connectionStatusListeners.delete(callback);
  };
};

// Track successful requests to update connection status
adminAxiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    setConnectionStatus('connected');
    return response;
  },
  (error) => {
    if (!error.response || error.response.status >= 500) {
      setConnectionStatus('error');
    }
    return Promise.reject(error);
  },
);
