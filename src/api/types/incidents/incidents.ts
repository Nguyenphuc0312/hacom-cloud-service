/**
 * Types for incident export functionality
 */

export interface IncidentMetadata {
  exportedAt: string;
  exportType: 'full' | 'partial';
  reason: string;
  exportedBy: string;
}

export interface MetricSnapshot {
  name: string;
  value: number | null;
  threshold?: number;
  status: 'ok' | 'warning' | 'critical';
}

export interface TimelineEvent {
  timestamp: string;
  type: 'alert' | 'metric_spike' | 'service_down' | 'recovery';
  service?: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface SystemLogItem {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  host?: string | null;
  summary?: string;
  message: string;
  requestId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface IncidentSummary {
  systemStatus: 'healthy' | 'degraded' | 'down' | 'unknown';
  affectedServices: string[];
  activeAlerts: number;
  criticalMetrics: MetricSnapshot[];
}

export interface IncidentExport {
  metadata: IncidentMetadata;
  summary: IncidentSummary;
  timeline: TimelineEvent[];
  relatedLogs: SystemLogItem[];
  recommendations: string[];
}

export interface ExportIncidentRequest {
  reason: string;
  services?: string[];
  timeRange?: '15m' | '1h' | '6h' | '24h';
  includeLogs?: boolean;
}

export interface SystemStatus {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  summary: string;
  criticalMetrics: MetricSnapshot[];
  affectedServices: string[];
  activeAlerts: number;
}
