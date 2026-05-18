/**
 * JWT token utilities for admin panel
 */

export interface TokenPayload {
  sub?: string;
  userId?: string;
  email?: string;
  exp?: number;
  iat?: number;
  sid?: string;
  type?: string;
  jti?: string;
}

export interface TokenExpiryInfo {
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiresAt: Date | null;
  expiresInSeconds: number | null;
  expiresInMinutes: number | null;
}

const parseJwtPayload = (token: string): TokenPayload | null => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
};

const EXPIRY_WARNING_THRESHOLD_SECONDS = 5 * 60; // 5 minutes before expiry

export const getTokenExpiryInfo = (token: string | null): TokenExpiryInfo => {
  if (!token) {
    return {
      isExpired: false,
      isExpiringSoon: false,
      expiresAt: null,
      expiresInSeconds: null,
      expiresInMinutes: null,
    };
  }

  const payload = parseJwtPayload(token);
  if (!payload?.exp) {
    return {
      isExpired: false,
      isExpiringSoon: false,
      expiresAt: null,
      expiresInSeconds: null,
      expiresInMinutes: null,
    };
  }

  const expiresAt = new Date(payload.exp * 1000);
  const now = new Date();
  const expiresInSeconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  const expiresInMinutes = Math.floor(expiresInSeconds / 60);

  return {
    isExpired: expiresInSeconds <= 0,
    isExpiringSoon: expiresInSeconds > 0 && expiresInSeconds <= EXPIRY_WARNING_THRESHOLD_SECONDS,
    expiresAt,
    expiresInSeconds,
    expiresInMinutes,
  };
};

export const isTokenExpired = (token: string | null): boolean => {
  return getTokenExpiryInfo(token).isExpired;
};

export const isTokenExpiringSoon = (token: string | null): boolean => {
  return getTokenExpiryInfo(token).isExpiringSoon;
};
