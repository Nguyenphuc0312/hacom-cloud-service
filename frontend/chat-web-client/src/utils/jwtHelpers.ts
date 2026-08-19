export const isJwtLike = (t: unknown): t is string => {
  if (typeof t !== "string") return false;
  const s = t.trim();
  if (!s) return false;
  return s.split(".").length === 3;
};

export const normalizeToken = (t: string) =>
  t.trim().replace(/^Bearer\s+/i, "");

const decodeBase64Url = (value: string): string | null => {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );

    if (typeof atob === "function") {
      return atob(padded);
    }
  } catch {
    return null;
  }

  return null;
};

export const parseJwtPayload = <T extends Record<string, unknown>>(
  token: string | null | undefined,
): T | null => {
  if (!isJwtLike(token)) {
    return null;
  }

  const normalizedToken = normalizeToken(token);
  const segments = normalizedToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const decoded = decodeBase64Url(segments[1]);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
};

export const getJwtExpirationMs = (
  token: string | null | undefined,
): number | null => {
  const payload = parseJwtPayload<{ exp?: number }>(token);
  if (!payload || typeof payload.exp !== "number") {
    return null;
  }

  return payload.exp * 1000;
};

export const isTokenExpired = (
  token: string | null | undefined,
  skewMs: number = 0,
): boolean => {
  const expiresAtMs = getJwtExpirationMs(token);
  if (!expiresAtMs) {
    return true;
  }

  return expiresAtMs <= Date.now() + skewMs;
};

export const isTokenExpiringSoon = (
  token: string | null | undefined,
  thresholdMs: number = 0,
): boolean => {
  const expiresAtMs = getJwtExpirationMs(token);
  if (!expiresAtMs) {
    return true;
  }

  return expiresAtMs <= Date.now() + thresholdMs;
};
