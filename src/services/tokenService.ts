import { AUTH_CONFIG } from "../config";

type StorageArea = "local" | "session";

const isBrowser = (): boolean =>
  typeof window !== "undefined" &&
  typeof localStorage !== "undefined" &&
  typeof sessionStorage !== "undefined";

const REFRESH_TOKEN_STORAGE_MODE =
  import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE === "cookie"
    ? "cookie"
    : "session";

const getStorageByArea = (area: StorageArea): Storage =>
  area === "local" ? localStorage : sessionStorage;

const getAuthSessionMarker = (): string | null => {
  if (!isBrowser()) return null;
  return localStorage.getItem(AUTH_CONFIG.AUTH_SESSION_ACTIVE_KEY);
};

const setAuthSessionActive = (active: boolean): void => {
  if (!isBrowser()) return;
  localStorage.setItem(AUTH_CONFIG.AUTH_SESSION_ACTIVE_KEY, active ? "true" : "false");
};

const getPreferredAccessStorage = (): Storage => {
  const rememberMe = isRememberMeEnabled();
  return rememberMe ? localStorage : sessionStorage;
};

const clearTokenKeys = (): void => {
  if (!isBrowser()) return;

  localStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
};

export const isRefreshTokenCookieMode = (): boolean =>
  REFRESH_TOKEN_STORAGE_MODE === "cookie";

export const isRememberMeEnabled = (): boolean =>
  isBrowser() && localStorage.getItem(AUTH_CONFIG.REMEMBER_ME_KEY) === "true";

export const getAccessToken = (): string | null => {
  if (!isBrowser()) return null;

  return (
    sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
    localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY)
  );
};

export const getRefreshToken = (): string | null => {
  if (!isBrowser()) return null;

  // Session storage is preferred when client-side refresh token is enabled.
  return (
    sessionStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY) ||
    localStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY)
  );
};

export const isAuthSessionActive = (): boolean => {
  if (!isBrowser()) return false;

  const marker = getAuthSessionMarker();
  if (marker === "true") return true;
  if (marker === "false") return false;

  // Backward compatibility: if marker is missing, infer from existing tokens.
  return Boolean(
    sessionStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
      localStorage.getItem(AUTH_CONFIG.ACCESS_TOKEN_KEY) ||
      sessionStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY) ||
      localStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY),
  );
};

export const updateAccessToken = (accessToken: string): void => {
  if (!isBrowser() || !accessToken) return;

  localStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.ACCESS_TOKEN_KEY);
  getPreferredAccessStorage().setItem(AUTH_CONFIG.ACCESS_TOKEN_KEY, accessToken);
  setAuthSessionActive(true);
};

export const storeTokens = (
  accessToken: string,
  refreshToken?: string,
  rememberMe: boolean = false,
): void => {
  if (!isBrowser()) return;

  clearTokenKeys();

  const accessStorage = getStorageByArea(rememberMe ? "local" : "session");
  accessStorage.setItem(AUTH_CONFIG.ACCESS_TOKEN_KEY, accessToken);
  setAuthSessionActive(true);

  if (rememberMe) {
    localStorage.setItem(AUTH_CONFIG.REMEMBER_ME_KEY, "true");
  } else {
    localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  }

  if (!refreshToken) {
    return;
  }

  // Avoid exposing refresh token in localStorage by default.
  if (REFRESH_TOKEN_STORAGE_MODE === "session") {
    sessionStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
    return;
  }

  // Cookie mode expects refresh token in HttpOnly cookie.
  sessionStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
};

export const clearTokens = (): void => {
  if (!isBrowser()) return;

  clearTokenKeys();
  setAuthSessionActive(false);
  localStorage.removeItem(AUTH_CONFIG.USER_KEY);
  localStorage.removeItem(AUTH_CONFIG.REMEMBER_ME_KEY);
  sessionStorage.removeItem(AUTH_CONFIG.USER_KEY);
};
