import { logger } from "../utils/logger";
import { MESSAGE_HARD_LIMIT } from "../utils/messageLengthPolicy";
import {
  DEFAULT_ALLOWED_UPLOAD_MIME_TYPES,
  UPLOAD_INPUT_ACCEPT,
  UPLOAD_LIMITS,
} from "../utils/uploadPolicy";

/**
 * @fileoverview Cấu hình ứng dụng
 * Quản lý tất cả các biến môi trường và cấu hình
 */

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, "");

const AUTH_CANONICAL_BASE_PATH = "/api/v1/auth";

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

const toAbsoluteOrigin = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
};

const isLocalHostUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value, "http://placeholder.local");
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsedUrl.hostname);
  } catch {
    return false;
  }
};

const resolvePathname = (value: string): string => {
  try {
    const fallbackBase =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://placeholder.local";
    const pathname = new URL(value, fallbackBase).pathname.replace(/\/+$/, "");
    return pathname || "/";
  } catch {
    return "/";
  }
};

const WS_SCHEME_REGEX = /^wss?:\/\//i;
const HTTP_SCHEME_REGEX = /^https?:\/\//i;
const RELATIVE_PATH_REGEX = /^\//;
const HOST_WITH_OPTIONAL_PORT_REGEX = /^[a-z0-9.-]+(?::\d{1,5})?(?:\/.*)?$/i;

const ensureWebSocketScheme = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "/ws";
  }

  const deDuplicatedScheme = trimmed.replace(
    /^(wss?:\/\/)(https?:\/\/)/i,
    "$2",
  );

  if (WS_SCHEME_REGEX.test(deDuplicatedScheme)) {
    return deDuplicatedScheme;
  }

  if (HTTP_SCHEME_REGEX.test(deDuplicatedScheme)) {
    return deDuplicatedScheme.replace(/^http/i, "ws");
  }

  if (RELATIVE_PATH_REGEX.test(deDuplicatedScheme)) {
    return deDuplicatedScheme;
  }

  if (HOST_WITH_OPTIONAL_PORT_REGEX.test(deDuplicatedScheme)) {
    const scheme =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "wss://"
        : "ws://";
    return `${scheme}${deDuplicatedScheme}`;
  }

  return "/ws";
};

const resolveFileBaseUrl = (): string => {
  const explicit = import.meta.env.VITE_FILE_BASE_URL?.trim();
  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  const apiOrigin = toAbsoluteOrigin(API_BASE_URL);
  return apiOrigin ?? "";
};

const resolveWithAbsoluteBase = (
  value: string,
  absoluteBase: string,
): string => {
  try {
    return new URL(value, absoluteBase).toString();
  } catch {
    return value;
  }
};

export type PublicResourceContext = "generic" | "image" | "media" | "download";

export type PublicResourceUrlOptions = {
  context?: PublicResourceContext;
  allowBlob?: boolean;
  allowDataImage?: boolean;
};

const SAFE_DATA_IMAGE_URL_REGEX =
  /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export const resolvePublicResourceUrl = (
  value: string | undefined,
  options: PublicResourceUrlOptions = {},
): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:/i.test(trimmed)) {
    return trimmed;
  }

  if (/^blob:/i.test(trimmed)) {
    return options.allowBlob === true ? trimmed : undefined;
  }

  if (/^data:/i.test(trimmed)) {
    const isSafeImageDataUrl =
      options.context === "image" &&
      options.allowDataImage === true &&
      SAFE_DATA_IMAGE_URL_REGEX.test(trimmed);
    return isSafeImageDataUrl ? trimmed : undefined;
  }

  if (/^wss?:/i.test(trimmed)) {
    return undefined;
  }

  if (trimmed.startsWith("//")) {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}${trimmed}`;
    }
    return `https:${trimmed}`;
  }

  if (FILE_BASE_URL && HTTP_SCHEME_REGEX.test(FILE_BASE_URL)) {
    return resolveWithAbsoluteBase(trimmed, FILE_BASE_URL);
  }

  return trimmed;
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
 * HR API base URL for attendance and HRM data
 */
export const HR_API_BASE_URL = resolveHttpBaseUrl(
  import.meta.env.VITE_HR_API_BASE_URL,
  import.meta.env.DEV ? "/hr-api" : "",
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

/**
 * Feature flag: màn "Công & Phép" (/timesheet, /leave, /timesheet/team).
 *
 * Mặc định BẬT nên local/dev vẫn vào test bình thường; `.env.production` đặt
 * "false" để tạm ẩn trên bản deploy cho tới khi nghiệm thu xong. Tắt thì rail
 * bỏ mục đó và route hiện trang "đang phát triển" — không xoá code.
 */
const rawWorkModuleEnabled = import.meta.env.VITE_WORK_MODULE_ENABLED;
export const WORK_MODULE_ENABLED =
  rawWorkModuleEnabled === undefined || rawWorkModuleEnabled === ""
    ? true
    : rawWorkModuleEnabled === "true";

const normalizedApiBaseUrl = normalizeBaseUrl(API_BASE_URL);
const normalizedAuthBaseUrl = normalizeBaseUrl(AUTH_BASE_URL);

export const FILE_BASE_URL = resolveFileBaseUrl();

if (import.meta.env.DEV) {
  logger.info("auth-config", "resolved", {
    VITE_APP_BASE_PATH: APP_BASE_PATH,
    VITE_USE_AUTH_SERVICE: rawUseAuthService ?? "(unset -> true)",
    USE_AUTH_SERVICE,
    API_BASE_URL: normalizedApiBaseUrl,
    AUTH_BASE_URL: normalizedAuthBaseUrl,
    FILE_BASE_URL: FILE_BASE_URL || "(unset)",
  });
}

if (USE_AUTH_SERVICE && normalizedApiBaseUrl === normalizedAuthBaseUrl) {
  throw new Error(
    "Invalid auth routing: USE_AUTH_SERVICE=true but AUTH_BASE_URL equals API_BASE_URL. Check VITE_AUTH_BASE_URL and restart dev server.",
  );
}

if (
  USE_AUTH_SERVICE &&
  resolvePathname(normalizedAuthBaseUrl) !== AUTH_CANONICAL_BASE_PATH
) {
  throw new Error(
    `Invalid auth routing: AUTH_BASE_URL must resolve to ${AUTH_CANONICAL_BASE_PATH}. Configure VITE_AUTH_BASE_URL accordingly.`,
  );
}

if (import.meta.env.DEV && !USE_AUTH_SERVICE) {
  logger.warn("auth-config", "auth_service_disabled", {
    reason: "auth requests will fallback to API_BASE_URL",
  });
}

// VITE_WS_URL là biến duy nhất cho WS base — trùng tên với repo variable mà
// deploy-production.yml + Dockerfile truyền vào lúc build.
const rawWebSocketBaseUrl = import.meta.env.VITE_WS_URL || "/ws";

const resolveWebSocketUrl = (value: string): string => {
  const normalizedValue = ensureWebSocketScheme(value);

  if (!normalizedValue.startsWith("/")) {
    return normalizedValue;
  }

  if (typeof window === "undefined") {
    return `ws://localhost:8001${normalizedValue}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${window.location.host}${normalizedValue}`;
};

export const WEBSOCKET_URL = resolveWebSocketUrl(rawWebSocketBaseUrl);

if (import.meta.env.PROD) {
  const localhostTargets = [API_BASE_URL, AUTH_BASE_URL, WEBSOCKET_URL].filter(
    (value) => isLocalHostUrl(value),
  );

  if (localhostTargets.length > 0) {
    logger.warn("runtime-config", "localhost_url_in_production", {
      localhostTargets,
    });
  }
}

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
  MAX_FILE_SIZE: UPLOAD_LIMITS.maxBytesByCategory.video,
  MAX_IMAGE_SIZE: UPLOAD_LIMITS.maxBytesByCategory.image,
  MAX_TOTAL_MESSAGE_SIZE: UPLOAD_LIMITS.maxTotalSizePerMessage,
  MAX_FILES_PER_MESSAGE: UPLOAD_LIMITS.maxFilesPerMessage,
  MAX_FILE_SIZE_BY_CATEGORY: UPLOAD_LIMITS.maxBytesByCategory,
  ALLOWED_IMAGE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ],
  ALLOWED_FILE_TYPES: [...DEFAULT_ALLOWED_UPLOAD_MIME_TYPES],
  ACCEPT: UPLOAD_INPUT_ACCEPT,
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
  MESSAGE_MAX_LENGTH: MESSAGE_HARD_LIMIT,
};
