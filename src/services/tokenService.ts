import { AUTH_CONFIG } from "../config";

const isBrowser = (): boolean =>
  typeof window !== "undefined" &&
  typeof localStorage !== "undefined" &&
  typeof sessionStorage !== "undefined";

const REFRESH_TOKEN_STORAGE_MODE =
  import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE === "cookie"
    ? "cookie"
    : "session";

let inMemoryAccessToken: string | null = null;

const getCookieValue = (name: string): string | null => {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(`${name}=`));

  if (!match) return null;
  return decodeURIComponent(match.substring(name.length + 1));
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

  // Always persist refresh token to localStorage so the session survives
  // browser close/reopen. Product requirement: stay logged in until explicit logout.
  localStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
};

export const clearTokens = (): void => {
  inMemoryAccessToken = null;

  if (!isBrowser()) return;

  clearPersistedAccessTokenKeys();
  clearPersistedRefreshTokenKeys();
  setAuthSessionActive(false);
  localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
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
