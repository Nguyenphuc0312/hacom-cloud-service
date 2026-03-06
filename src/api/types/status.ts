export type HealthStatus = 'up' | 'down' | 'degraded' | 'unknown';

export interface RecentIncident {
  fingerprint: string;
  summary: string;
  status: 'firing' | 'resolved';
  startsAt: string;
  severity?: string;
}

export interface OverviewResponse {
  services: {
    up: number;
    down: number;
    degraded: number;
    total: number;
  };
  wsActiveConnections?: number;
  messagesPerSec: number;
  errorRatePercent: number;
  latencyP95Ms: number;
  recentIncidents: RecentIncident[];
  checkedAt?: string;
}

export interface ServiceStatusItem {
  name: string;
  health: HealthStatus;
  ready: boolean;
  checkedAt: string;
  latencyMs?: number;
  error?: string;
}

export interface ServicesResponse {
  items: ServiceStatusItem[];
}
