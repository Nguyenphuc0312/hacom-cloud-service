export type Role = 'super_admin' | 'operator' | 'viewer' | 'hr_admin' | 'superadmin' | 'admin';

export interface CurrentAdmin {
  id: string;
  email: string;
  username?: string;
  displayName?: string | null;
  fullName?: string | null;
  employeeCode?: string | null;
  hrLinked?: boolean;
  accountType?: 'employee' | 'exception' | 'bot';
  status?: string;
  isVerified?: boolean;
  role?: Role;
  authoritySource?: 'db' | 'break_glass';
  permissions?: string[];
}

export interface LoginRequest {
  email?: string;
  loginIdentifier?: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user?: CurrentAdmin;
}

export type MeResponse = CurrentAdmin;

export interface MeResponseWithConfig {
  admin: CurrentAdmin;
  config: {
    environment: string;
    allowlistConfigured: boolean;
    ipApprovalEnabled: boolean;
    writeActionsEnabled: boolean;
  };
}
