export type ServiceStatus = 'up' | 'down' | 'degraded' | 'unknown';

export interface ServiceHealthItem {
  name: string;
  status: ServiceStatus;
  checkedAt: string;
  latencyMs: number;
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
}

export interface ServiceHealthResponse {
  checkedAt: string;
  summary: ServiceHealthSummary;
  items: ServiceHealthItem[];
}
