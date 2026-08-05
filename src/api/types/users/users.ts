import type { PaginationMeta } from '@/api/envelope/envelope';

export type UserPresenceStatus = 'online' | 'offline' | 'away' | 'dnd';
export type UserAccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';

export interface UserListItem {
  id: string;
  username: string | null;
  email: string;
  phone: string | null;
  employeeId: string | null;
  status: string | null;
  accountStatus: string | null;
  isActive: boolean | null;
  lastSeen: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UserDetail extends UserListItem {
  orgUnit: string | null;
  title: string | null;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  activeSessionCount: number | null;
  deviceCount: number | null;
}

export interface UsersListQuery {
  page?: number;
  limit?: number;
  keyword?: string;
  status?: UserPresenceStatus;
  accountStatus?: UserAccountStatus;
  isActive?: boolean;
  sortBy?: 'created_at' | 'updated_at' | 'email' | 'username';
  sortOrder?: 'asc' | 'desc';
}

export interface UsersListResponse {
  items: UserListItem[];
  pagination: PaginationMeta;
  filters: {
    keyword?: string;
    status?: string;
    accountStatus?: string;
    isActive?: boolean;
  };
}

export interface UserActionPayload {
  reason: string;
}

export interface UserActionResponse {
  userId: string;
  action: 'locked' | 'unlocked' | 'revoked_sessions';
  mode: 'auth_service';
  result?: Record<string, unknown>;
}
