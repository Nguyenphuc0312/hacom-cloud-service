/**
 * Hook to fetch and monitor projection status
 */
import { useQuery } from '@tanstack/react-query';

import { projectionStatusClient } from '@/api/clients/projectionStatusClient/projectionStatusClient';
import { queryKeys } from '@/api/queryKeys/queryKeys';

const REFRESH_INTERVAL_MS = 60 * 1000; // Refresh every minute

export const useProjectionStatus = () => {
  return useQuery({
    queryKey: queryKeys.projectionStatus,
    queryFn: projectionStatusClient.getProjectionStatus,
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: 30 * 1000,
    retry: 2,
  });
};

/**
 * Get a human-readable label for projection status
 */
export const getProjectionStatusLabel = (status: string): string => {
  switch (status) {
    case 'healthy':
      return 'Đồng bộ';
    case 'stale':
      return 'Có thể cũ';
    case 'error':
      return 'Lỗi';
    case 'unknown':
      return 'Chưa rõ';
    default:
      return status;
  }
};

/**
 * Check if any projection has issues (stale or error)
 */
export const hasProjectionIssues = (
  projections: Array<{ status: string }> | undefined,
): boolean => {
  if (!projections) return false;
  return projections.some((p) => p.status === 'stale' || p.status === 'error');
};

/**
 * Get count of projections by status
 */
export const getProjectionCounts = (
  projections: Array<{ status: string }> | undefined,
) => {
  if (!projections) {
    return { healthy: 0, stale: 0, error: 0, unknown: 0 };
  }

  return projections.reduce(
    (acc, p) => {
      if (p.status in acc) {
        acc[p.status as keyof typeof acc]++;
      }
      return acc;
    },
    { healthy: 0, stale: 0, error: 0, unknown: 0 },
  );
};
