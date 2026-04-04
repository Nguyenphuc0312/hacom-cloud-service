/**
 * @fileoverview Cấu hình ứng dụng
 * Quản lý tất cả các biến môi trường và cấu hình
 */

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

const normalizeAppBasePath = (value?: string): string => {
  const rawValue = value?.trim();
  if (!rawValue || rawValue === "/") {
    return "/";
  }

  const withLeadingSlash = rawValue.startsWith("/") ? rawValue : `/${rawValue}`;
  return withLeadingSlash.replace(/\/+$/, "");
};

const resolveHttpBaseUrl = (
  configuredValue: string | undefined,
  fallbackPath: string,
): string => {
  const trimmedValue = configuredValue?.trim();
  if (trimmedValue) {
    return normalizeBaseUrl(trimmedValue);
  }

  return fallbackPath;
};

const isLocalHostUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value, "http://placeholder.local");
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsedUrl.hostname);
  } catch {
    return false;
  }
};

export const APP_BASE_PATH = normalizeAppBasePath(
  import.meta.env.VITE_APP_BASE_PATH,
);

// API Base URLs
export const API_BASE_URL = resolveHttpBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  "/api/v1",
);

/**
 * Auth service base URL (Stage 1 – body mode).
 * When USE_AUTH_SERVICE is true, auth calls (login/refresh/logout/me/…) go
 * directly to AUTH_BASE_URL instead of through API_BASE_URL.
 * Rollback: set VITE_USE_AUTH_SERVICE=false to route back through api-service.
 */
export const AUTH_BASE_URL = resolveHttpBaseUrl(
  import.meta.env.VITE_AUTH_BASE_URL,
  "/api/v1/auth",
);

/**
 * Feature flag: redirect auth traffic to the dedicated auth-service.
 * true  → FE calls AUTH_BASE_URL for /auth/* endpoints.
 * false → FE calls API_BASE_URL (legacy, rollback).
 */
const rawUseAuthService = import.meta.env.VITE_USE_AUTH_SERVICE;
export const USE_AUTH_SERVICE =
  rawUseAuthService === undefined || rawUseAuthService === ""
    ? true
    : rawUseAuthService === "true";

const normalizedApiBaseUrl = normalizeBaseUrl(API_BASE_URL);
const normalizedAuthBaseUrl = normalizeBaseUrl(AUTH_BASE_URL);

if (import.meta.env.DEV) {
  console.info("[auth-config]", {
    VITE_APP_BASE_PATH: APP_BASE_PATH,
    VITE_USE_AUTH_SERVICE: rawUseAuthService ?? "(unset -> true)",
    USE_AUTH_SERVICE,
    API_BASE_URL: normalizedApiBaseUrl,
    AUTH_BASE_URL: normalizedAuthBaseUrl,
  });
}

if (USE_AUTH_SERVICE && normalizedApiBaseUrl === normalizedAuthBaseUrl) {
  throw new Error(
    "Invalid auth routing: USE_AUTH_SERVICE=true but AUTH_BASE_URL equals API_BASE_URL. Check VITE_AUTH_BASE_URL and restart dev server.",
  );
}

if (import.meta.env.DEV && !USE_AUTH_SERVICE) {
  console.warn(
    "[auth-config] USE_AUTH_SERVICE=false: auth requests will fallback to API_BASE_URL.",
  );
}

const rawWebSocketUrl =
  import.meta.env.VITE_WS_URL || import.meta.env.VITE_WEBSOCKET_URL || "/ws";

const resolveWebSocketUrl = (value: string): string => {
  if (!value.startsWith("/")) {
    return value;
  }

  if (typeof window === "undefined") {
    return `ws://localhost:8001${value}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${value}`;
};

export const WEBSOCKET_URL = resolveWebSocketUrl(rawWebSocketUrl);

if (import.meta.env.PROD) {
  const localhostTargets = [API_BASE_URL, AUTH_BASE_URL, WEBSOCKET_URL].filter(
    (value) => isLocalHostUrl(value),
  );

  if (localhostTargets.length > 0) {
    console.warn(
      "[runtime-config] Localhost URL detected in production bundle.",
      localhostTargets,
    );
  }
}

export const WEBSOCKET_AUTH_CONFIG = {
  // Compatibility mode for backends that require token during handshake (/ws?token=...).
  // Keep disabled by default to avoid exposing tokens in URL unless explicitly needed.
  USE_QUERY_TOKEN: import.meta.env.VITE_WS_USE_QUERY_TOKEN === "true",
  // Auto-retry with query-token when the first handshake closes before onopen.
  AUTO_QUERY_TOKEN_FALLBACK:
    import.meta.env.VITE_WS_AUTO_QUERY_TOKEN_FALLBACK !== "false",
};

// Authentication
export const AUTH_CONFIG = {
  // Token refresh threshold (in ms) - refresh 1 minute before expiry
  TOKEN_REFRESH_THRESHOLD: 60 * 1000,
  // Remember me expiry (in days)
  REMEMBER_ME_DAYS: 30,
  // Session storage keys
  ACCESS_TOKEN_KEY: "accessToken",
  REFRESH_TOKEN_KEY: "refreshToken",
  USER_KEY: "user",
  REMEMBER_ME_KEY: "rememberMe",
  AUTH_SESSION_ACTIVE_KEY: "authSessionActive",
};

// Pagination
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MESSAGES_PAGE_SIZE: 50,
};

// File Upload
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  ALLOWED_FILE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
  ],
};

// WebSocket
export const WEBSOCKET_CONFIG = {
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 1000, // Base delay in ms
  RECONNECT_DELAY_MAX: 30000, // Max delay in ms
  PING_INTERVAL: 30000, // 30 seconds
  PONG_TIMEOUT: 5000, // 5 seconds
};

// UI
export const UI_CONFIG = {
  DEBOUNCE_DELAY: 300, // Search debounce
  TYPING_TIMEOUT: 3000, // Typing indicator timeout
  TOAST_DURATION: 3000, // Toast notification duration
  ANIMATION_DURATION: 200, // Default animation duration
};

// Validation
export const VALIDATION_CONFIG = {
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  BIO_MAX_LENGTH: 500,
  MESSAGE_MAX_LENGTH: 4000,
};
