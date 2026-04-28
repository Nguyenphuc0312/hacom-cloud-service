export type SmtpSettingStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface SmtpSettingRecord {
  id: string;
  status: SmtpSettingStatus;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passMasked?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SmtpSettingsPayload {
  active: SmtpSettingRecord | null;
  draft: SmtpSettingRecord | null;
}

export interface UpdateSmtpSettingsRequest {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
}

export interface SendTestEmailRequest {
  to: string;
  subject?: string;
  text?: string;
}
