/**
 * API client for incident export and system status
 */
import { adminAxiosInstance } from '@/api/axios/axios';
import { assertAdminApiPath } from '@/api/routes/routes';
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
    const path = '/incidents/export';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.post<{
      success: boolean;
      data?: IncidentExport;
      error?: { code?: string; message?: string };
    }>(path, request, { headers });

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
    const path = '/incidents/status';
    assertAdminApiPath(path);
    const response = await adminAxiosInstance.get<{
      success: boolean;
      data?: SystemStatus;
      error?: { code?: string; message?: string };
    }>(path);

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
    const path = '/incidents/export/service/' + encodeURIComponent(service);
    assertAdminApiPath(path);
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
    }>(path, {
      params: { range },
    });

    const payload = response.data;

    if (payload.success && payload.data) {
      return payload.data;
    }

    throw new Error(payload.error?.message ?? 'Service logs export failed');
  },
};
