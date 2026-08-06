import { useCallback, useRef, useState } from 'react';
import type { AttachmentDraft } from '../../../types/attachmentDraft';
import { createAttachmentDraft } from '../../../types/attachmentDraft';
import { cloudApi } from '../api/cloudApi';

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

export const useCloudUploadQueue = (onCompleted: () => void): CloudUploadQueue => {
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  const filesRef = useRef(new Map<string, File>());
  const controllersRef = useRef(new Map<string, AbortController>());

  const patch = useCallback((localId: string, update: Partial<AttachmentDraft>) => {
    setDrafts((current) => current.map((draft) => draft.localId === localId ? { ...draft, ...update } : draft));
  }, []);

  const upload = useCallback(async (draft: AttachmentDraft, file: File) => {
    const controller = new AbortController();
    controllersRef.current.set(draft.localId, controller);
    try {
      patch(draft.localId, { status: 'reserving', progress: 0, errorCode: undefined, errorMessage: undefined });
      const reservation = await cloudApi.reserveUpload(file);
      patch(draft.localId, { uploadId: reservation.uploadId, status: 'uploading' });
      await putObject({
        url: reservation.uploadUrl,
        method: reservation.uploadMethod,
        headers: reservation.uploadHeaders,
        file,
        signal: controller.signal,
        onProgress: (progress) => patch(draft.localId, { progress, status: 'uploading' }),
      });
      patch(draft.localId, { status: 'completing', progress: 100 });
      await cloudApi.completeUpload(reservation.uploadId);
      filesRef.current.delete(draft.localId);
      setDrafts((current) => current.filter((item) => item.localId !== draft.localId));
      onCompleted();
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      patch(draft.localId, {
        status: cancelled ? 'cancelled' : 'failed',
        progress: 0,
        errorCode: cancelled ? 'CLOUD_UPLOAD_CANCELLED' : 'CLOUD_UPLOAD_FAILED',
        errorMessage: cancelled ? 'Đã hủy tải tệp.' : 'Không thể tải tệp lên Cloud. Hãy thử lại.',
      });
    } finally {
      controllersRef.current.delete(draft.localId);
    }
  }, [onCompleted, patch]);

  const addFiles = useCallback((files: File[]) => {
    const accepted = files.slice(0, 10);
    const next = accepted.map((file) => createAttachmentDraft(file, { purpose: 'message_attachment' }));
    next.forEach((draft, index) => filesRef.current.set(draft.localId, accepted[index]));
    setDrafts((current) => [...current, ...next]);
    next.forEach((draft, index) => void upload(draft, accepted[index]));
    return files.length > accepted.length ? { errors: ['Chỉ có thể tải tối đa 10 tệp mỗi lần.'] } : {};
  }, [upload]);

  const removeDraft = useCallback((localId: string) => {
    controllersRef.current.get(localId)?.abort();
    controllersRef.current.delete(localId);
    filesRef.current.delete(localId);
    setDrafts((current) => current.filter((draft) => draft.localId !== localId));
  }, []);

  const retryUpload = useCallback((localId: string) => {
    const file = filesRef.current.get(localId);
    const draft = drafts.find((item) => item.localId === localId);
    if (file && draft) void upload(draft, file);
  }, [drafts, upload]);

  const clearAll = useCallback(() => drafts.forEach((draft) => removeDraft(draft.localId)), [drafts, removeDraft]);
  const hasUploadingDrafts = drafts.some((draft) => ['reserving', 'uploading', 'completing'].includes(draft.status));
  const hasFailedDrafts = drafts.some((draft) => ['failed', 'cancelled'].includes(draft.status));

  return { drafts, addFiles, removeDraft, cancelUpload: removeDraft, retryUpload, clearAll, hasUploadingDrafts, hasFailedDrafts };
};

export default useCloudUploadQueue;
