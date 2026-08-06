import axios from 'axios';
import { API_BASE_URL } from '../../../config';
import { getAccessToken } from '../../../services/tokenService';

export type CloudAsset = {
  id: string;
  originalFilename: string;
  mimeType: string;
  mediaType: string;
  sizeBytes: string;
  status: 'available' | 'trashed' | 'deleting' | 'deleted' | 'failed';
  createdAt: string;
  attachmentId: string | null;
  messageId: string | null;
};

const client = axios.create({ baseURL: `${API_BASE_URL}/cloud`, timeout: 30_000 });
client.interceptors.request.use((request) => {
  const token = getAccessToken();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

const data = <T>(response: { data: { data: T } }): T => response.data.data;

export const cloudApi = {
  ensure: () => client.post('/ensure').then(data<{ conversationId: string; quota: { limitBytes: string; usedBytes: string; reservedBytes: string } }>),
  list: (params: { cursor?: string; limit?: number; q?: string; type?: string; includeTrashed?: boolean }) => client.get('/assets', { params }).then(data<{ items: CloudAsset[]; nextCursor: string | null }>),
  note: (content: string) => client.post('/notes', { content }).then(data),
  reserveUpload: (file: File) => client.post('/uploads', { filename: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }).then(data<{
    uploadId: string; uploadUrl: string; uploadMethod?: string; uploadHeaders?: Record<string, string>;
  }>),
  completeUpload: (uploadId: string) => client.post(`/uploads/${uploadId}/complete`).then(data<CloudAsset>),
  trash: (assetId: string) => client.delete(`/assets/${assetId}`).then(data<CloudAsset>),
  download: (assetId: string) => client.get(`/assets/${assetId}/download`).then(data<{ url: string }>),
  forward: (assetId: string, targetConversationId: string) =>
    client.post(`/assets/${assetId}/forward`, { targetConversationId }).then(data),
};
