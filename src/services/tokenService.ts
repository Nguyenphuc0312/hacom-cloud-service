import { AUTH_CONFIG } from "../config";
import { logger } from "../utils/logger";

const isBrowser = (): boolean =>
  typeof window !== "undefined" &&
  typeof localStorage !== "undefined" &&
  typeof sessionStorage !== "undefined";

// Production LUÔN dùng HttpOnly cookie, bất kể env truyền vào. Refresh token
// nằm trong localStorage biến một XSS đơn lẻ thành chiếm tài khoản lâu dài:
// kẻ tấn công đổi lấy access token mới mãi mãi từ máy của chính họ.
// Chế độ "session" chỉ còn dùng được ở dev, cho backend local chưa bật
// AUTH_REFRESH_COOKIE_ENABLED.
const REFRESH_TOKEN_STORAGE_MODE: "cookie" | "session" = import.meta.env.PROD
  ? "cookie"
  : import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE === "session"
    ? "session"
    : "cookie";

if (
  import.meta.env.PROD &&
  import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE === "session"
) {
  // Build prod với cấu hình sai phải thấy ngay, không im lặng nuốt.
  logger.error("security", "refresh_token_session_mode_ignored_in_production", {
    requestedMode: import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE,
  });
}

let inMemoryAccessToken: string | null = null;

const getCookieValue = (name: string): string | null => {
  if (typeof document === "undefined") return null;

  // document.cookie lists cookies visible at the current page path.
  // When the server migrates cookie paths (e.g. /api/v1/auth → /) there can
  // temporarily be duplicate cookies with the same name but different paths.
  // Browsers expose cookies by path-specificity order in document.cookie, but
  // only cookies whose path matches the current page path are visible here.
  // Take the LAST matching value: when duplicates exist the root-path (/) cookie
  // appears last, matching what the backend sets via setAuthCookies after the
  // path migration.
  let lastValue: string | null = null;
  for (const chunk of document.cookie.split(";")) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith(`${name}=`)) {
      lastValue = decodeURIComponent(trimmed.substring(name.length + 1));
    }
  }
  return lastValue;
};

const getAuthSessionMarker = (): string | null => {
  if (!isBrowser()) return null;
  return localStorage.getItem(AUTH_CONFIG.AUTH_SESSION_ACTIVE_KEY);
};

const setAuthSessionActive = (active: boolean): void => {
  if (!isBrowser()) return;
  localStorage.setItem(
    AUTH_CONFIG.AUTH_SESSION_ACTIVE_KEY,
    active ? "true" : "false",
  );
};

const clearPersistedAccessTokenKeys = (): void => {
  if (!isBrowser()) return;

  localStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
};

const clearPersistedRefreshTokenKeys = (): void => {
  if (!isBrowser()) return;

  localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
};

const readLegacyPersistedAccessToken = (): string | null => {
  if (!isBrowser()) return null;

  return (
    sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
    localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)
  );
};

export const isRefreshTokenCookieMode = (): boolean =>
  REFRESH_TOKEN_STORAGE_MODE === "cookie";

export const getCsrfToken = (): string | null =>
  isBrowser() ? getCookieValue("csrfToken") : null;

export const isRememberMeEnabled = (): boolean =>
  isBrowser() && localStorage.getItem(AUTH_CONFIG.REMEMBER_ME_KEY) === "true";

export const getAccessToken = (): string | null => {
  if (inMemoryAccessToken) {
    return inMemoryAccessToken;
  }

  const legacyAccessToken = readLegacyPersistedAccessToken();
  if (!legacyAccessToken) {
    return null;
  }

  inMemoryAccessToken = legacyAccessToken;
  clearPersistedAccessTokenKeys();
  return inMemoryAccessToken;
};

export const getRefreshToken = (): string | null => {
  if (!isBrowser()) return null;

  return (
    sessionStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY) ||
    localStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY)
  );
};

export const isAuthSessionActive = (): boolean => {
  if (!isBrowser()) return false;

  if (inMemoryAccessToken) {
    return true;
  }

  const marker = getAuthSessionMarker();
  if (marker === "true") return true;
  if (marker === "false") return false;

  return Boolean(
    getRefreshToken() || readLegacyPersistedAccessToken(),
  );
};

export const updateAccessToken = (accessToken: string): void => {
  if (!accessToken) return;

  inMemoryAccessToken = accessToken;
  clearPersistedAccessTokenKeys();
  setAuthSessionActive(true);
};

export const storeTokens = (
  accessToken: string,
  refreshToken?: string,
  rememberMe: boolean = false,
): void => {
  if (!isBrowser()) {
    inMemoryAccessToken = accessToken;
    return;
  }

  inMemoryAccessToken = accessToken;
  clearPersistedAccessTokenKeys();
  clearPersistedRefreshTokenKeys();
  setAuthSessionActive(true);

  if (rememberMe) {
    localStorage.setItem(AUTH_CONFIG.REMEMBER_ME_KEY, "true");
  } else {
    localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  }

  if (!refreshToken) {
    return;
  }

  if (REFRESH_TOKEN_STORAGE_MODE === "cookie") {
    return;
  }

  // Tôn trọng lựa chọn của người dùng:
  // - Có tick "ghi nhớ đăng nhập" → localStorage, phiên sống qua đóng/mở trình duyệt.
  // - Không tick → sessionStorage, đóng tab là mất phiên.
  //
  // Trước đây luôn ghi vào localStorage bất kể cờ rememberMe, khiến ô "ghi nhớ"
  // chỉ còn ý nghĩa hiển thị và token của máy dùng chung vẫn sống sau khi đóng
  // trình duyệt. `getRefreshToken()` đọc cả hai storage nên cả hai nhánh đều
  // hoạt động bình thường.
  if (rememberMe) {
    localStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  } else {
    sessionStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  }
};

export const clearTokens = (): void => {
  inMemoryAccessToken = null;

  if (!isBrowser()) return;

  clearPersistedAccessTokenKeys();
  clearPersistedRefreshTokenKeys();
  setAuthSessionActive(false);
  localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  localStorage.removeItem(AUTH_CONFIG.AUTH_SESSION_IDENTITY_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.AUTH_SESSION_IDENTITY_KEY);
};

/**
 * Drop only this document's credentials after a cross-account mismatch.
 * Shared cookie markers/localStorage may belong to a newer login in another
 * tab and must remain untouched.
 */
export const clearCurrentTabTokens = (): void => {
  inMemoryAccessToken = null;
  if (!isBrowser()) return;

  sessionStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
  // Keep this tab fail-closed across another F5. A later explicit login
  // replaces the sentinel with its validated principal binding.
  sessionStorage.setItem(
    AUTH_CONFIG.AUTH_SESSION_IDENTITY_KEY,
    AUTH_CONFIG.AUTH_SESSION_MISMATCH_SENTINEL,
  );
};

export const parseMustChangePasswordFromToken = (token: string): boolean => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(payload)) as Record<string, unknown>;
    return decoded.mustChangePassword === true;
  } catch {
    return false;
  }
};
