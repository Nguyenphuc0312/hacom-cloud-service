export type SystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'MAINTENANCE' | 'UNKNOWN';
export type DataFreshnessStatus = 'FRESH' | 'STALE' | 'EXPIRED' | 'UNKNOWN';
export type ServiceStatus = 'up' | 'down' | 'degraded' | 'unknown';

export interface ServiceHealthItem {
  name: string;
  serviceId: string;
  displayName: string;
  status: ServiceStatus;
  canonicalStatus: SystemHealthStatus;
  freshness: DataFreshnessStatus;
  required: boolean;
  checkedAt: string;
  lastSuccessfulCheckAt: string | null;
  latencyMs: number | null;
  summary: string;
  version?: string;
  build?: string;
  env?: string;
}

export interface ServiceHealthSummary {
  total: number;
  up: number;
  down: number;
  degraded: number;
  critical: number;
  unknown: number;
  stale: number;
}

export interface ServiceHealthResponse {
  checkedAt: string;
  overallStatus: SystemHealthStatus;
  freshness: DataFreshnessStatus;
  partial: boolean;
  summary: ServiceHealthSummary;
  items: ServiceHealthItem[];
}
