import type { PaginationMeta } from '@/api/envelope/envelope';

export interface UserSession {
  id: string;
  userId: string;
  deviceId: string | null;
  deviceName: string | null;
  devicePlatform: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isRevoked: boolean;
  rotatedFromSessionId: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
}

export interface UserDevice {
  id: string;
  userId: string;
  deviceName: string | null;
  platform: string | null;
  hasDeviceToken: boolean | null;
  pushEnabled: boolean | null;
  userAgent: string | null;
  lastActiveAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UserSessionsQuery {
  page?: number;
  limit?: number;
  revoked?: boolean;
}

export interface UserDevicesQuery {
  page?: number;
  limit?: number;
}

export interface UserSessionsResponse {
  items: UserSession[];
  pagination: PaginationMeta;
}

export interface UserDevicesResponse {
  items: UserDevice[];
  pagination: PaginationMeta;
}
