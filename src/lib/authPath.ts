import { API_BASE_URL, AUTH_BASE_URL, USE_AUTH_SERVICE } from "../config";
import { logger } from "../utils/logger";

const resolveBasePathname = (baseUrl: string): string => {
  try {
    const fallbackBase =
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost";
    const pathname = new URL(baseUrl, fallbackBase).pathname.replace(
      /\/+$/,
      "",
    );
    return pathname || "/";
  } catch {
    return "/";
  }
};

export const authBaseUrl = USE_AUTH_SERVICE ? AUTH_BASE_URL : API_BASE_URL;

const authBaseOwnsCanonicalPath =
  USE_AUTH_SERVICE &&
  /\/api\/v1\/auth$/i.test(resolveBasePathname(authBaseUrl));

export const normalizeAuthRequestPath = (url?: string): string | undefined => {
  if (!url) {
    return url;
  }

  const [path, query = ""] = url.split("?");
  const normalizedPath =
    path
      .replace(/^\/api\/v1\/auth(?=\/|$)/i, "")
      .replace(/^\/auth(?=\/|$)/i, "") || "/";
  return query ? `${normalizedPath}?${query}` : normalizedPath;
};

export const buildAuthEndpoint = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!authBaseOwnsCanonicalPath && USE_AUTH_SERVICE && import.meta.env.DEV) {
    logger.warn("auth-config", "auth_base_path_unexpected", { authBaseUrl });
  }

  return `${authBaseUrl}${normalizedPath}`;
};
