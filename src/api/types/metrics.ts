export type MetricTemplate =
  | 'latency_p95'
  | 'error_rate'
  | 'ws_connections'
  | 'msgs_per_sec'
  | 'redis_memory'
  | 'db_connections';

export type TimeRange = '15m' | '1h' | '6h' | '24h';

export interface TimeseriesPoint {
  timestamp: string;
  value: number | null;
}

export interface TimeseriesRequest {
  query: string;
  range: TimeRange;
  step?: string;
  service?: string;
}

export interface TimeseriesResponse {
  query: string;
  range: TimeRange;
  step: string;
  points: TimeseriesPoint[];
}

export interface SloResponse {
  status: 'OK' | 'WARN' | 'ALERT';
  p95Ms: number;
  errorPercent: number;
  uptimePercent: number;
}
