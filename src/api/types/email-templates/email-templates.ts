export type EmailTemplateVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK' | 'ARCHIVED';

export interface EmailTemplateVersionRecord {
  id: string;
  version: number;
  status: EmailTemplateVersionStatus;
  subjectTemplate: string;
  htmlTemplate: string | null;
  textTemplate: string | null;
  variablesSchema: Record<string, unknown> | null;
  sampleData: Record<string, unknown> | null;
  publishedAt: string | null;
  rollbackOfVersion: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  activeVersionId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  draft: EmailTemplateVersionRecord | null;
  published: EmailTemplateVersionRecord | null;
}

export interface EmailTemplateListPayload {
  items: EmailTemplateRecord[];
}

export interface UpsertEmailTemplateDraftRequest {
  name: string;
  description?: string;
  subjectTemplate: string;
  htmlTemplate?: string;
  textTemplate?: string;
  variablesSchema?: Record<string, unknown>;
  sampleData?: Record<string, unknown>;
}

export interface PreviewEmailTemplateRequest {
  sampleData?: Record<string, unknown>;
}

export interface EmailTemplatePreviewResponse {
  code: string;
  version: number;
  subject: string;
  html: string | null;
  text: string | null;
}

export interface RollbackEmailTemplateRequest {
  version: number;
}
