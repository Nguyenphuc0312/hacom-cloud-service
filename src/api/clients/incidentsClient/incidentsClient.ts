/**
 * API client for incident export and system status
 */
import { adminAxiosInstance } from '@/api/axios/axios';
import type { IncidentExport, SystemStatus } from '@/api/types/incidents/incidents';

export const incidentsClient = {
  /**
   * Export full incident report
   * Creates comprehensive report with metrics, logs, and recommendations
   */
  async exportIncident(
    request: {
      reason: string;
      timeRange?: '15m' | '1h' | '6h' | '24h';
      includeLogs?: boolean;
    },
    headers?: Record<string, string>,
  ): Promise<IncidentExport> {
    const response = await adminAxiosInstance.post<{
      success: boolean;
      data?: IncidentExport;
      error?: { code?: string; message?: string };
    }>('/admin/incidents/export', request, { headers });

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Export failed');
  },

  /**
   * Get current system health status
   * Quick status check without full export
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const response = await adminAxiosInstance.get<{
      success: boolean;
      data?: SystemStatus;
      error?: { code?: string; message?: string };
    }>('/admin/incidents/status');

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Status check failed');
  },

  /**
   * Export logs for a specific service
   */
  async exportServiceLogs(
    service: string,
    range?: '15m' | '1h' | '6h' | '24h',
  ): Promise<{
    service: string;
    timeRange: string;
    exportedAt: string;
    logs: Array<{
      id: string;
      timestamp: string;
      level: string;
      service: string;
      message: string;
      requestId?: string;
    }>;
  }> {
    const response = await adminAxiosInstance.get<{
      success: boolean;
      data?: {
        service: string;
        timeRange: string;
        exportedAt: string;
        logs: Array<{
          id: string;
          timestamp: string;
          level: string;
          service: string;
          message: string;
          requestId?: string;
        }>;
      };
      error?: { code?: string; message?: string };
    }>('/admin/incidents/export/service/' + encodeURIComponent(service), {
      params: { range },
    });

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Service logs export failed');
  },
};
