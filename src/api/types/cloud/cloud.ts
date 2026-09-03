export type CloudQuotaRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CloudQuotaRequest {
  id: string;
  status: CloudQuotaRequestStatus;
  currentQuotaBytes: number;
  requestedQuotaBytes: number;
  reason?: string;
  createdAt: string;
  updatedAt: string;
  applied?: boolean;
}

export interface CloudQuotaRequestListParams {
  status?: CloudQuotaRequestStatus;
  limit?: number;
  cursor?: string;
}

export interface CloudQuotaRequestListResponse {
  items: CloudQuotaRequest[];
  nextCursor: string | null;
}

export interface CloudQuotaReviewParams {
  requestId: string;
  decision: 'approve' | 'reject';
  note?: string;
  /** Keep this value unchanged when retrying the same mutation intent. */
  idempotencyKey: string;
}

export type CloudQuotaReviewResponse = CloudQuotaRequest;
