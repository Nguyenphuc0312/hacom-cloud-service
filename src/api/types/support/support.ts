import type { PaginationMeta } from '@/api/envelope/envelope';

export type SupportIssuePriority = 'low' | 'medium' | 'high';
export type SupportIssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportIssueReporter {
  id: string;
  displayName: string | null;
  username: string | null;
  avatar: string | null;
}

export interface SupportIssueAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  downloadUrl?: string | null;
}

export interface SupportIssueEnvironment {
  userAgent?: string | null;
  url?: string | null;
  viewport?: string | null;
  appVersion?: string | null;
  locale?: string | null;
}

export interface SupportIssueSummary {
  id: string;
  ticketCode: string;
  title: string;
  priority: SupportIssuePriority;
  status: SupportIssueStatus;
  reporter: SupportIssueReporter;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportIssueDetail extends SupportIssueSummary {
  stepsToReproduce: string;
  expectedResult: string | null;
  actualResult: string | null;
  environment: SupportIssueEnvironment;
  attachments: SupportIssueAttachment[];
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface SupportIssueQuery {
  page?: number;
  limit?: number;
  status?: SupportIssueStatus;
  priority?: SupportIssuePriority;
}

export interface SupportIssueListResponse {
  items: SupportIssueSummary[];
  pagination: PaginationMeta;
}
