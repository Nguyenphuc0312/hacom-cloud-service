export type IncidentStatus = 'firing' | 'resolved';

export interface Incident {
  fingerprint: string;
  status: IncidentStatus;
  severity?: string;
  title: string;
  summary?: string;
  startsAt: string;
  endsAt?: string;
  ackedBy?: string;
  ackedAt?: string;
}

export interface IncidentListResponse {
  items: Incident[];
}

export interface AckIncidentRequest {
  note?: string;
}

export interface SilenceIncidentRequest {
  durationMinutes: number;
  comment?: string;
}
