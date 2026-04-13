import { axiosInstance } from '@/api/axios';
import { adminApiPath } from '@/api/routes';
import { unwrapApiEnvelope } from '@/api/envelope';
import type {
  SendTestEmailRequest,
  SmtpSettingsPayload,
  TestConnectionResponse,
  UpdateSmtpSettingsRequest,
} from '@/api/types';

export const smtpClient = {
  async getSettings(): Promise<SmtpSettingsPayload> {
    const response = await axiosInstance.get(adminApiPath('/settings/smtp'));
    return unwrapApiEnvelope<SmtpSettingsPayload>(response);
  },

  async updateSettings(payload: UpdateSmtpSettingsRequest): Promise<SmtpSettingsPayload> {
    const response = await axiosInstance.put(adminApiPath('/settings/smtp'), payload);
    return unwrapApiEnvelope<SmtpSettingsPayload>(response);
  },

  async activateDraft(): Promise<SmtpSettingsPayload> {
    const response = await axiosInstance.post(adminApiPath('/settings/smtp/activate'));
    return unwrapApiEnvelope<SmtpSettingsPayload>(response);
  },

  async deactivateActive(): Promise<SmtpSettingsPayload> {
    const response = await axiosInstance.post(adminApiPath('/settings/smtp/deactivate'));
    return unwrapApiEnvelope<SmtpSettingsPayload>(response);
  },

  async testConnection(payload?: UpdateSmtpSettingsRequest): Promise<TestConnectionResponse> {
    const response = await axiosInstance.post(adminApiPath('/settings/smtp/test-connection'), payload);
    return unwrapApiEnvelope<TestConnectionResponse>(response);
  },

  async sendTestEmail(payload: SendTestEmailRequest): Promise<TestConnectionResponse> {
    const response = await axiosInstance.post(adminApiPath('/settings/smtp/send-test-email'), payload);
    return unwrapApiEnvelope<TestConnectionResponse>(response);
  },
};
