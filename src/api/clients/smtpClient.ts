import { axiosInstance } from '@/api/axios';
import type {
  SendTestEmailRequest,
  SmtpSettings,
  TestConnectionResponse,
  UpdateSmtpSettingsRequest,
} from '@/api/types';

export const smtpClient = {
  async getSettings(): Promise<SmtpSettings> {
    const { data } = await axiosInstance.get<SmtpSettings>('/settings/smtp');
    return data;
  },

  async updateSettings(payload: UpdateSmtpSettingsRequest): Promise<SmtpSettings> {
    const { data } = await axiosInstance.put<SmtpSettings>('/settings/smtp', payload);
    return data;
  },

  async testConnection(): Promise<TestConnectionResponse> {
    const { data } = await axiosInstance.post<TestConnectionResponse>('/settings/smtp/test-connection');
    return data;
  },

  async sendTestEmail(payload: SendTestEmailRequest): Promise<TestConnectionResponse> {
    const { data } = await axiosInstance.post<TestConnectionResponse>(
      '/settings/smtp/send-test-email',
      payload,
    );
    return data;
  },
};
