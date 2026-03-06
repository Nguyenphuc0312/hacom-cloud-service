export interface AuditEntry {
  id: string;
  time: string;
  actor: string;
  action: string;
  resource: string;
  ip?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  actor?: string;
  action?: string;
  resource?: string;
}

export interface AuditListResponse {
  items: AuditEntry[];
}
