export type AccessIpStatus =
  | 'unknown'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked'
  | 'expired';

export type AccessIpSource = 'manual' | 'auto_detected' | 'imported';

export interface AccessStatus {
  scope: string;
  ipAddress: string | null;
  normalizedIp: string | null;
  status: AccessIpStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string | null;
  note: string | null;
  reason: string | null;
  requestExists: boolean;
  pollAfterMs: number;
  canResubmit: boolean;
  source?: AccessIpSource | null;
  matchedRuleLabel?: string | null;
}

export interface RequestCurrentIpAccessResponse {
  access: AccessStatus;
  created: boolean;
}

export interface AccessRequestListItem {
  id: string;
  scope: string;
  ipAddress: string;
  normalizedIp: string;
  status: Exclude<AccessIpStatus, 'unknown'>;
  source: AccessIpSource;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  note: string | null;
  reason: string | null;
  lastUserAgent: string | null;
  requestUserCount: number;
  linkedUsers: Array<{
    userId: string;
    email?: string | null;
    username?: string | null;
    lastSeenAt: string;
  }>;
  risk: {
    sharedIp: boolean;
    expiringSoon: boolean;
  };
}

export interface AccessRequestDetail extends AccessRequestListItem {
  firstRequestedByUserId: string | null;
  lastRequestedByUserId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  lastRequestedAt: string | null;
  lastForwardedChain: string[];
  lastHeaderSnapshot: Record<string, unknown> | null;
}

export interface AccessRequestHistoryItem {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorUserId: string | null;
  subjectUserId: string | null;
  reason: string | null;
  note: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
