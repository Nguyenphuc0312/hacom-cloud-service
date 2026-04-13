import type { TimeRange } from './metrics';

export type MonitoringAvailability = 'available' | 'partial' | 'unavailable';

export interface MonitoringPoint {
  timestamp: string;
  value: number | null;
}

export interface MonitoringSeries {
  key: string;
  label: string;
  points: MonitoringPoint[];
}

export interface MonitoringTopResource {
  instance: string;
  value: number | null;
}

export interface MonitoringStatusSummary {
  total: number;
  healthy: number;
  degraded: number;
  down: number;
}

export interface MonitoringServiceItem {
  name: string;
  status: 'up' | 'down' | 'degraded' | 'unknown';
  checkedAt: string;
  latencyMs: number;
  summary: string;
  version?: string;
  build?: string;
  env?: string;
}

export interface MonitoringWarning {
  code:
    | 'datasource_unreachable'
    | 'datasource_http_error'
    | 'query_error'
    | 'metric_not_found'
    | 'parse_error'
    | 'exporter_down'
    | 'redis_down'
    | 'service_health_unavailable';
  source: 'prometheus' | 'service_health' | 'redis' | 'node_exporter';
  key: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface MonitoringAvailabilitySummary {
  status: MonitoringAvailability;
  available: number;
  unavailable: number;
}

export interface MonitoringSourceStatus {
  status: MonitoringAvailability;
  checkedAt: string;
  message: string;
  baseUrl?: string | null;
}

export interface MonitoringOverviewResponse {
  range: TimeRange;
  generatedAt: string;
  freshness: 'live' | 'partial' | 'unavailable';
  warnings: MonitoringWarning[];
  links: {
    realtime: string | null;
    correctness: string | null;
    redis: string | null;
    server: string | null;
    serviceHealth: string;
  };
  sources: {
    serviceHealth: MonitoringSourceStatus;
    prometheus: MonitoringSourceStatus;
  };
  dataQuality: {
    systemOverview: MonitoringAvailabilitySummary;
    realtimeHealth: MonitoringAvailabilitySummary;
    messageCorrectness: MonitoringAvailabilitySummary;
    dependencySnapshot: MonitoringAvailabilitySummary;
  };
  systemOverview: {
    services: MonitoringStatusSummary;
    activeConnections: number | null;
    onlineUsers: number | null;
    messagesPerSecond: number | null;
    senderAckP95Ms: number | null;
    resyncsPerMinute: number | null;
    partialFailuresPerMinute: number | null;
    topCpuServer: MonitoringTopResource | null;
    topMemoryServer: MonitoringTopResource | null;
  };
  realtimeHealth: {
    wsToApiP95Ms: number | null;
    senderAckP95Ms: number | null;
    deliveryFailuresPerMinute: number | null;
    resyncsPerMinute: number | null;
    connectionsTrend: MonitoringSeries[];
    latencyTrend: MonitoringSeries[];
    reliabilityTrend: MonitoringSeries[];
  };
  messageCorrectness: {
    messageSuccessTotal: number | null;
    partialFailureTotal: number | null;
    terminalFailureTotal: number | null;
    reconcileRequiredCurrent: number | null;
    reconcileSuccessTotal: number | null;
    reconcileFailureTotal: number | null;
    orphanMongoCurrent: number | null;
    projectionMissingCurrent: number | null;
    topFailureReasons: Array<{ reason: string; ratePerMinute: number | null }>;
    outcomeTrend: MonitoringSeries[];
    reconcileTrend: MonitoringSeries[];
  };
  dependencySnapshot: {
    redis: {
      status: 'healthy' | 'degraded' | 'down' | 'unknown';
      metricsStatus: MonitoringAvailability;
      exporterStatus: 'up' | 'down' | 'unknown';
      diagnosticCode?: MonitoringWarning['code'];
      diagnosticMessage?: string;
      connectedClients: number | null;
      memoryUsedBytes: number | null;
      opsPerSecond: number | null;
      blockedClients: number | null;
    };
    api: {
      status: 'healthy' | 'degraded' | 'down' | 'unknown';
      latencyMs: number | null;
      summary: string;
      messageWriteP95Ms: number | null;
    };
    infrastructure: {
      aggregateCpuPercent: number | null;
      aggregateMemoryPercent: number | null;
      networkReceiveBytesPerSecond: number | null;
      networkTransmitBytesPerSecond: number | null;
      topCpuServer: MonitoringTopResource | null;
      topMemoryServer: MonitoringTopResource | null;
    };
    services: MonitoringServiceItem[];
  };
}
