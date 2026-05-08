import { AUTH_CONFIG } from "../config";

const isBrowser = (): boolean =>
  typeof window !== "undefined" &&
  typeof localStorage !== "undefined" &&
  typeof sessionStorage !== "undefined";

const REFRESH_TOKEN_STORAGE_MODE =
  import.meta.env.VITE_REFRESH_TOKEN_STORAGE_MODE === "cookie"
    ? "cookie"
    : "session";

const ACCESS_TOKEN_STORAGE_MODE =
  import.meta.env.VITE_ACCESS_TOKEN_STORAGE_MODE === "local"
    ? "local"
    : "session";

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
  localStorage.setItem(AUTH_CONFIG.AUTH_SESSION_ACTIVE_KEY, active ? "true" : "false");
};

const getPreferredAccessStorage = (rememberMe = isRememberMeEnabled()): Storage => {
  return ACCESS_TOKEN_STORAGE_MODE === "local" && rememberMe
    ? localStorage
    : sessionStorage;
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

export const isAccessTokenLocalStorageMode = (): boolean =>
  ACCESS_TOKEN_STORAGE_MODE === "local";

export const getCsrfToken = (): string | null =>
  isBrowser() ? getCookieValue("csrfToken") : null;

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

  // Safer default: access token stays in sessionStorage even when remember-me
  // is enabled. Persisting access tokens in localStorage is legacy opt-in via
  // VITE_ACCESS_TOKEN_STORAGE_MODE=local.
  const accessStorage = getPreferredAccessStorage(rememberMe);
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
