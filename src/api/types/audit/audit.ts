import type { PaginationMeta } from '@/api/envelope/envelope';

export interface AuditEntry {
  id: string;
  time: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  source: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  actorEmail?: string;
  action?: string;
  entityType?: string;
  source?: string;
}

export interface AuditListResponse {
  items: AuditEntry[];
  pagination: PaginationMeta;
}
