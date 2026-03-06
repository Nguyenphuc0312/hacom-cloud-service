export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passMasked?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  updatedAt?: string;
  updatedBy?: string;
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
  subject: string;
  text: string;
}
