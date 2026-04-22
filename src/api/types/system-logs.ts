export type SystemLogLevel = 'info' | 'warning' | 'error' | 'success';
export type SystemLogRange = '15m' | '1h' | '24h' | 'all';

export interface SystemLogItem {
  id: string;
  timestamp: string;
  level: SystemLogLevel;
  service: string;
  host: string | null;
  summary: string;
  message: string;
  requestId: string | null;
  traceId: string | null;
  spanId: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
}

export interface SystemLogQuery {
  keyword?: string;
  level?: SystemLogLevel;
  service?: string;
  range?: SystemLogRange;
  limit?: number;
}

export interface SystemLogsResponse {
  items: SystemLogItem[];
}
