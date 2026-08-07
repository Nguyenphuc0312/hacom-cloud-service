import axios from 'axios';
import { useCallback, useRef, useState } from 'react';
import type { AttachmentDraft } from '../../../types/attachmentDraft';
import { createAttachmentDraft } from '../../../types/attachmentDraft';
import { cloudApi, type CloudQuota } from '../api/cloudApi';

type CloudUploadQueue = {
  drafts: AttachmentDraft[];
  addFiles: (files: File[]) => { errors?: string[] };
  removeDraft: (localId: string) => void;
  cancelUpload: (localId: string) => void;
  retryUpload: (localId: string) => void;
  clearAll: () => void;
  hasUploadingDrafts: boolean;
  hasFailedDrafts: boolean;
};

const putObject = (input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  file: File;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}) => new Promise<void>((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open(input.method ?? 'PUT', input.url);
  Object.entries(input.headers ?? {}).forEach(([key, value]) => request.setRequestHeader(key, value));
  request.upload.onprogress = (event) => {
    if (event.lengthComputable) input.onProgress(Math.round(event.loaded / event.total * 100));
  };
  request.onerror = () => reject(new Error('CLOUD_UPLOAD_FAILED'));
  request.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
  input.signal.addEventListener('abort', () => request.abort(), { once: true });
  request.onload = () => request.status >= 200 && request.status < 300
    ? resolve()
    : reject(new Error(`CLOUD_UPLOAD_STATUS_${request.status}`));
  request.send(input.file);
});

const formatFileSize = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;

const errorDetails = (error: unknown, file: File) => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as {
      code?: unknown;
      details?: { maxBytes?: unknown };
      error?: { code?: unknown; details?: { maxBytes?: unknown } };
    } | undefined;
    const code = body?.error?.code ?? body?.code;
    const maxBytes = body?.error?.details?.maxBytes ?? body?.details?.maxBytes;
    if (code === 'CLOUD_FILE_TOO_LARGE' && typeof maxBytes === 'number') {
      return {
        errorCode: code,
        errorMessage: `Tệp ${file.name} có dung lượng ${formatFileSize(file.size)}, vượt quá giới hạn ${formatFileSize(maxBytes)}.`,
      };
    }
    if (code === 'CLOUD_STORAGE_QUOTA_EXCEEDED') {
      return { errorCode: code, errorMessage: 'Dung lượng Hacom Cloud không còn đủ cho tệp này.' };
    }
    if (error.response?.status === 413) {
      return { errorCode: 'CLOUD_UPLOAD_PROXY_413', errorMessage: 'Máy chủ hiện chưa chấp nhận tệp có dung lượng này. Vui lòng thử lại sau.' };
    }
  }
  return { errorCode: 'CLOUD_UPLOAD_FAILED', errorMessage: 'Không thể tải tệp lên Cloud. Hãy thử lại.' };
};

export const useCloudUploadQueue = (
  onCompleted: (quota?: CloudQuota) => void,
  maxUploadBytes?: number,
  onQuotaChanged?: (quota: CloudQuota) => void,
): CloudUploadQueue => {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const filesRef = useRef(new Map<string, File>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const uploadIdsRef = useRef(new Map<string, string>());
  const uploadedObjectsRef = useRef(new Set<string>());

  const patch = useCallback((localId: string, update: Partial<AttachmentDraft>) => {
    setDrafts((current) => current.map((draft) => draft.localId === localId ? { ...draft, ...update } : draft));
  }, []);

  const finish = useCallback((localId: string, quota?: CloudQuota) => {
    filesRef.current.delete(localId);
    uploadIdsRef.current.delete(localId);
    uploadedObjectsRef.current.delete(localId);
    setDrafts((current) => current.filter((item) => item.localId !== localId));
    if (quota) onQuotaChanged?.(quota);
    onCompleted(quota);
  }, [onCompleted, onQuotaChanged]);

  const upload = useCallback(async (draft: AttachmentDraft, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(draft.localId, controller);
    try {
      let uploadId = uploadIdsRef.current.get(draft.localId);
      if (!uploadId || !uploadedObjectsRef.current.has(draft.localId)) {
        patch(draft.localId, { status: 'reserving', progress: 0, errorCode: undefined, errorMessage: undefined });
        const reservation = await cloudApi.reserveUpload(file, draft.localId);
        if (reservation.status === 'completed') {
          finish(draft.localId, reservation.asset.quota);
          return;
        }
        uploadId = reservation.uploadId;
        uploadIdsRef.current.set(draft.localId, uploadId);
        onQuotaChanged?.(reservation.quota);
        patch(draft.localId, { uploadId, status: 'uploading' });
        await putObject({
          url: reservation.uploadUrl,
          method: reservation.uploadMethod,
          headers: reservation.uploadHeaders,
          file,
          signal: controller.signal,
          onProgress: (progress) => patch(draft.localId, { progress, status: 'uploading' }),
        });
        uploadedObjectsRef.current.add(draft.localId);
      }

      patch(draft.localId, { uploadId, status: 'completing', progress: 100 });
      const completed = await cloudApi.completeUpload(uploadId);
      finish(draft.localId, completed.quota);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      const failure = errorDetails(error, file);
      patch(draft.localId, {
        status: cancelled ? 'cancelled' : 'failed',
        progress: cancelled ? 0 : uploadedObjectsRef.current.has(draft.localId) ? 100 : 0,
        errorCode: cancelled ? 'CLOUD_UPLOAD_CANCELLED' : failure.errorCode,
        errorMessage: cancelled ? 'Đã hủy tải tệp.' : failure.errorMessage,
      });
    } finally {
      controllersRef.current.delete(draft.localId);
    }
  }, [finish, onQuotaChanged, patch]);

  const addFiles = useCallback((files: File[]) => {
    const eligible = maxUploadBytes
      ? files.filter((file) => file.size <= maxUploadBytes)
      : files;
    const rejected = files.filter((file) => !eligible.includes(file));
    const accepted = eligible.slice(0, 10);
    const next = accepted.map((file) => createAttachmentDraft(file, { purpose: 'message_attachment' }));
    next.forEach((draft, index) => filesRef.current.set(draft.localId, accepted[index]));
    setDrafts((current) => [...current, ...next]);
    next.forEach((draft, index) => void upload(draft, accepted[index]));
    const errors: string[] = [];
    if (rejected.length && maxUploadBytes) errors.push(`Tệp vượt quá giới hạn ${formatFileSize(maxUploadBytes)}: ${rejected.map((file) => file.name).join(', ')}`);
    if (eligible.length > accepted.length) errors.push('Chỉ có thể tải tối đa 10 tệp mỗi lần.');
    return errors.length ? { errors } : {};
  }, [maxUploadBytes, upload]);

  const removeDraft = useCallback((localId: string) => {
    controllersRef.current.get(localId)?.abort();
    controllersRef.current.delete(localId);
    const uploadId = uploadIdsRef.current.get(localId);
    if (uploadId) {
      void cloudApi.cancelUpload(uploadId)
        .then((result) => onQuotaChanged?.(result.quota))
        .catch(() => undefined);
    }
    uploadIdsRef.current.delete(localId);
    uploadedObjectsRef.current.delete(localId);
    filesRef.current.delete(localId);
    setDrafts((current) => current.filter((draft) => draft.localId !== localId));
  }, [onQuotaChanged]);

  const retryUpload = useCallback((localId: string) => {
    const file = filesRef.current.get(localId);
    const draft = drafts.find((item) => item.localId === localId);
    if (
      file && draft &&
      draft.errorCode !== 'CLOUD_FILE_TOO_LARGE' &&
      draft.errorCode !== 'CLOUD_STORAGE_QUOTA_EXCEEDED' &&
      draft.errorCode !== 'CLOUD_UPLOAD_PROXY_413'
    ) {
      void upload(draft, file);
    }
  }, [drafts, upload]);

  const clearAll = useCallback(() => drafts.forEach((draft) => removeDraft(draft.localId)), [drafts, removeDraft]);
  const hasUploadingDrafts = drafts.some((draft) => ['reserving', 'uploading', 'completing'].includes(draft.status));
  const hasFailedDrafts = drafts.some((draft) => ['failed', 'cancelled'].includes(draft.status));

  return {
    drafts,
    addFiles,
    removeDraft,
    cancelUpload: removeDraft,
    retryUpload,
    clearAll,
    hasUploadingDrafts,
    hasFailedDrafts,
  };
};

export default useCloudUploadQueue;
