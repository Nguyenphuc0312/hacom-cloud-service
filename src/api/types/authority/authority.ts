import type { Role } from '../auth/auth';

export type AuthoritySource = 'db' | 'break_glass' | null;
export type AuthorityOverrideEffect = 'grant' | 'deny';

export interface AuthorityListItem {
  userId: string;
  email: string;
  username?: string;
  role: Role | null;
  authoritySource: AuthoritySource;
  effectivePermissions: string[];
  overrideCount: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
}

export interface AuthorityListResponse {
  items: AuthorityListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    keyword: string | null;
  };
}

export interface AuthorityOverrideItem {
  id: string;
  permission: string;
  effect: AuthorityOverrideEffect;
  grantedBy: string | null;
  grantedReason: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityDetailResponse {
  user: {
    id: string;
    email: string;
    username?: string;
  };
  role: Role | null;
  authoritySource: AuthoritySource;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  breakGlassEligible: boolean;
  basePermissions: string[];
  effectivePermissions: string[];
  overrides: AuthorityOverrideItem[];
}

export interface UpdateAuthorityRolePayload {
  role: Exclude<Role, 'superadmin' | 'admin'>;
  reason?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
}

export interface ReplaceAuthorityOverridesPayload {
  reason?: string;
  overrides: Array<{
    permission: string;
    effect: AuthorityOverrideEffect;
    effectiveFrom?: string;
    effectiveUntil?: string;
  }>;
}
