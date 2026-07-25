import { adminAxiosInstance } from '@/api/axios/axios';
import { unwrapApiEnvelope } from '@/api/envelope/envelope';
import type { ServiceHealthResponse } from '@/api/types/service-health/service-health';

type CanonicalResponse = { status: ServiceHealthResponse['overallStatus']; freshness: ServiceHealthResponse['freshness']; generatedAt: string; partial: boolean; summary: { total: number; healthy: number; degraded: number; critical: number; unknown: number; maintenance: number; stale: number }; services: Array<{ serviceId: string; displayName: string; status: ServiceHealthResponse['overallStatus']; freshness: ServiceHealthResponse['freshness']; checkedAt: string; lastSuccessfulCheckAt: string | null; responseTimeMs: number | null; version: string | null; environment: string | null; metadata: Record<string, unknown>; warnings: Array<{ message: string }>; errors: Array<{ message: string }> }> };
const toLegacyStatus = (status: CanonicalResponse['services'][number]['status']): ServiceHealthResponse['items'][number]['status'] => status === 'HEALTHY' ? 'up' : status === 'CRITICAL' ? 'down' : status === 'UNKNOWN' ? 'unknown' : 'degraded';

export const serviceHealthClient = {
  async getServiceHealth(): Promise<ServiceHealthResponse> {
    const response = await adminAxiosInstance.get('/system/health');
    const data = unwrapApiEnvelope<CanonicalResponse>(response);
    return { checkedAt: data.generatedAt, overallStatus: data.status, freshness: data.freshness, partial: data.partial, summary: { total: data.summary.total, up: data.summary.healthy, down: data.summary.critical, degraded: data.summary.degraded, critical: data.summary.critical, unknown: data.summary.unknown, stale: data.summary.stale }, items: data.services.map((service) => ({ name: service.serviceId, serviceId: service.serviceId, displayName: service.displayName, status: toLegacyStatus(service.status), canonicalStatus: service.status, freshness: service.freshness, required: service.metadata.required !== false, checkedAt: service.checkedAt, lastSuccessfulCheckAt: service.lastSuccessfulCheckAt, latencyMs: service.responseTimeMs, summary: service.errors[0]?.message ?? service.warnings[0]?.message ?? 'No issues observed', ...(service.version ? { version: service.version } : {}), ...(service.environment ? { env: service.environment } : {}) })) };
  },
};
