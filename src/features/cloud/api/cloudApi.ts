import axios from 'axios';
import type {
  CancelCloudUploadDto,
  CloudAssetDto,
  CloudQuotaDto,
  CloudSpaceDto,
  CloudUploadInitiationDto,
} from '@hacom/chat-shared-types';
import { API_BASE_URL } from '../../../config';
import { getAccessToken } from '../../../services/tokenService';

export type CloudAsset = CloudAssetDto;
export type CloudQuota = CloudQuotaDto;

const client = axios.create({ baseURL: `${API_BASE_URL}/cloud`, timeout: 30_000 });
client.interceptors.request.use((request) => {
  const token = getAccessToken();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

const data = <T>(response: { data: { data: T } }): T => response.data.data;

/**
 * ensure() được gọi từ nhiều nơi gần như cùng lúc (CloudPage giải id, ChatPage nhận
 * diện route, Cloud surface lấy quota). Gộp các lời gọi trùng nhau trong cùng một
 * nhịp thành một request — trước đây mở /cloud bắn tới 4 lần ensure liên tiếp.
 */
let inFlightEnsure: Promise<CloudSpaceDto> | null = null;

export const cloudApi = {
  ensure: (): Promise<CloudSpaceDto> => {
    if (inFlightEnsure) return inFlightEnsure;
    inFlightEnsure = client
      .post('/ensure')
      .then(data<CloudSpaceDto>)
      .finally(() => { inFlightEnsure = null; });
    return inFlightEnsure;
  },
  list: (params: { cursor?: string; limit?: number; q?: string; type?: string; includeTrashed?: boolean }) =>
    client.get('/assets', { params }).then(data<{ items: CloudAsset[]; nextCursor: string | null }>),
  note: (content: string) => client.post('/notes', { content }).then(data),
  reserveUpload: (file: File, clientUploadId: string) => client.post('/uploads', {
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    clientUploadId,
  }, { headers: { 'Idempotency-Key': clientUploadId } }).then(data<CloudUploadInitiationDto>),
  completeUpload: (uploadId: string) =>
    client.post(`/uploads/${uploadId}/complete`).then(data<CloudAsset>),
  cancelUpload: (uploadId: string) =>
    client.post(`/uploads/${uploadId}/cancel`).then(data<CancelCloudUploadDto>),
  trash: (assetId: string) => client.delete(`/assets/${assetId}`).then(data<CloudAsset>),
  trashByMessage: (messageId: string) =>
    client.delete(`/assets/by-message/${encodeURIComponent(messageId)}`).then(data<CloudAsset>),
  restore: (assetId: string) => client.post(`/assets/${assetId}/restore`).then(data<CloudAsset>),
  emptyTrash: () =>
    client.post('/trash/empty').then(data<{ claimed: number; purged: number; failed: number }>),
  download: (assetId: string) => client.get(`/assets/${assetId}/download`).then(data<{ url: string }>),
  forward: (assetId: string, targetConversationId: string) =>
    client.post(`/assets/${assetId}/forward`, { targetConversationId }).then(data),
};

export const deleteCloudAssetForMessage = (
  messageId: string,
  assets: readonly CloudAsset[],
  gateway: Pick<typeof cloudApi, 'trash' | 'trashByMessage'> = cloudApi,
): Promise<CloudAsset> => {
  const loaded = assets.find((asset) => asset.messageId === messageId && asset.status === 'available');
  return loaded ? gateway.trash(loaded.id) : gateway.trashByMessage(messageId);
};
