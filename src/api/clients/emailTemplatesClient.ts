import { adminAxiosInstance } from '@/api/axios';
import { unwrapApiEnvelope } from '@/api/envelope';
import type {
  EmailTemplateListPayload,
  EmailTemplatePreviewResponse,
  EmailTemplateRecord,
  PreviewEmailTemplateRequest,
  RollbackEmailTemplateRequest,
  UpsertEmailTemplateDraftRequest,
} from '@/api/types';

export const emailTemplatesClient = {
  async list(): Promise<EmailTemplateListPayload> {
    const response = await adminAxiosInstance.get('/settings/email-templates');
    return unwrapApiEnvelope<EmailTemplateListPayload>(response);
  },

  async getByCode(code: string): Promise<EmailTemplateRecord> {
    const response = await adminAxiosInstance.get(
      `/settings/email-templates/${encodeURIComponent(code)}`,
    );
    return unwrapApiEnvelope<EmailTemplateRecord>(response);
  },

  async upsertDraft(
    code: string,
    payload: UpsertEmailTemplateDraftRequest,
  ): Promise<EmailTemplateRecord> {
    const response = await adminAxiosInstance.put(
      `/settings/email-templates/${encodeURIComponent(code)}/draft`,
      payload,
    );
    return unwrapApiEnvelope<EmailTemplateRecord>(response);
  },

  async preview(
    code: string,
    payload?: PreviewEmailTemplateRequest,
  ): Promise<EmailTemplatePreviewResponse> {
    const response = await adminAxiosInstance.post(
      `/settings/email-templates/${encodeURIComponent(code)}/preview`,
      payload ?? {},
    );
    return unwrapApiEnvelope<EmailTemplatePreviewResponse>(response);
  },

  async publish(code: string): Promise<EmailTemplateRecord> {
    const response = await adminAxiosInstance.post(
      `/settings/email-templates/${encodeURIComponent(code)}/publish`,
    );
    return unwrapApiEnvelope<EmailTemplateRecord>(response);
  },

  async rollback(
    code: string,
    payload: RollbackEmailTemplateRequest,
  ): Promise<EmailTemplateRecord> {
    const response = await adminAxiosInstance.post(
      `/settings/email-templates/${encodeURIComponent(code)}/rollback`,
      payload,
    );
    return unwrapApiEnvelope<EmailTemplateRecord>(response);
  },
};
