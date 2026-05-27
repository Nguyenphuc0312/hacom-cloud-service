/**
 * Projection status types for admin panel
 */

export type ProjectionStatus = 'healthy' | 'stale' | 'error' | 'unknown';

export interface ProjectionStatusItem {
  name: string;
  status: ProjectionStatus;
  lastSuccessAt: string | null;
  lastError: string | null;
  staleMinutes: number | null;
  maxStalenessSeconds: number;
}

export interface ProjectionStatusResponse {
  projections: ProjectionStatusItem[];
  checkedAt: string;
}
