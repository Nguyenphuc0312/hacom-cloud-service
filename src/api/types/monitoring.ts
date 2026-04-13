import type { TimeRange } from './metrics';

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

export interface MonitoringOverviewResponse {
  range: TimeRange;
  generatedAt: string;
  freshness: 'live' | 'partial' | 'unavailable';
  warnings: string[];
  links: {
    realtime: string | null;
    correctness: string | null;
    redis: string | null;
    server: string | null;
    serviceHealth: string;
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
      status: 'healthy' | 'degraded' | 'down';
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
