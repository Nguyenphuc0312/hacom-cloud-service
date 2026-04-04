import type { ServiceHealthSummary } from './service-health';

export interface DashboardSummary {
  totalUsers: number;
  activeUsers: number;
  lockedUsers: number;
  pendingVerificationUsers: number;
  estimatedActiveSessions: number;
  services: ServiceHealthSummary;
  checkedAt: string;
}
