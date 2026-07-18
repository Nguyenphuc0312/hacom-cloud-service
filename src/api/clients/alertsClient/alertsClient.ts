import { useQuery } from '@tanstack/react-query';

import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import { assertAdminApiPath } from '@/api/routes/routes';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  description: string;
  source: string;
  service?: string;
  metric?: string;
  value?: string;
  threshold?: string;
  suggestedAction?: string;
  occurredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
}

export interface AlertsResponse {
  alerts: Alert[];
  total: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  activeCount: number;
}

export interface AlertFilters {
  severity?: AlertSeverity;
  status?: AlertStatus;
  service?: string;
  range?: '1h' | '6h' | '24h' | '7d' | 'all';
}

export const alertsClient = {
  async getAlerts(filters?: AlertFilters): Promise<AlertsResponse> {
    const params: Record<string, string> = {};
    if (filters?.severity) params.severity = filters.severity;
    if (filters?.status) params.status = filters.status;
    if (filters?.service) params.service = filters.service;
    if (filters?.range) params.range = filters.range;

    const path = '/alerts';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get(path, { params });
    return unwrapApiEnvelope<AlertsResponse>(response);
  },

  async acknowledgeAlert(alertId: string): Promise<void> {
    const path = `/alerts/${alertId}/acknowledge`;
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.post(path);
    return unwrapApiEnvelope<void>(response);
  },

  async resolveAlert(alertId: string): Promise<void> {
    const path = `/alerts/${alertId}/resolve`;
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.post(path);
    return unwrapApiEnvelope<void>(response);
  },
};

/**
 * React Query hook for fetching alerts
 */
export const useAlertsQuery = (filters?: AlertFilters) => {
  return useQuery({
    queryKey: ['admin-alerts', filters],
    queryFn: () => alertsClient.getAlerts(filters),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
};
