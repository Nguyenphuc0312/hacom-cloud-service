import type {
  FileReleaseReason,
  FileReleaseStatus,
  FileScanStatus,
} from "@hacom/chat-shared-types/chat";
import { unwrapApiSuccess } from "../lib/apiContract";
import {
  fileApi,
  groupApi,
  userApi,
  type FileUploadPurpose,
  type ReserveFileUploadPayload,
} from "./api";
import {
  resolveUploadMaxBytesForFile,
  resolveUploadMimeTypeForFile,
  validateUploadFileType,
} from "../utils/uploadPolicy";

export interface RecoverableUploadRecord {
  uploadId: string;
  fileId: string;
  purpose: FileUploadPurpose;
  conversationId?: string | null;
  groupId?: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export const uploadClient = {
  validateUpload(file: File, purpose: FileUploadPurpose) {
    const mimeType = resolveUploadMimeTypeForFile(file);
    if (!mimeType) {
      throw new Error("UNSUPPORTED_MIME_TYPE");
    }

    const maxBytes =
      purpose === "user_avatar" || purpose === "group_avatar"
        ? 7_864_320
        : resolveUploadMaxBytesForFile(file);
    if (file.size > maxBytes) {
      throw new Error("FILE_TOO_LARGE");
    }

    const validated = validateUploadFileType({
      fileName: file.name,
      mimeType,
    });
    if (!validated.ok) {
      throw new Error(validated.code);
    }

    return {
      mimeType,
      maxBytes,
      category: validated.category,
    };
  },

  async reserveUpload(payload: ReserveFileUploadPayload) {
    return unwrapApiSuccess(await fileApi.reserveFileUpload(payload));
  },

  async uploadToSignedUrl(input: {
    signedUrl: string;
    file: File;
    method?: string;
    headers?: Record<string, string>;
    onProgress?: (progress: number) => void;
    abortSignal?: AbortSignal;
  }) {
    await fileApi.uploadToSignedUrl(input.signedUrl, input.file, {
      method: input.method,
      headers: input.headers,
      onProgress: input.onProgress,
      signal: input.abortSignal,
    });
  },

  async completeUpload(payload: {
    uploadId: string;
    // Optional: calendar_attachment không thuộc hội thoại nào → BE bỏ qua.
    conversationId?: string;
    objectKey?: string;
    checksum?: string;
  }) {
    return unwrapApiSuccess(await fileApi.completeUpload(payload));
  },

  attachToMessageDraft(input: {
    uploadId: string;
    fileId: string;
    purpose: FileUploadPurpose;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    objectKey?: string;
    url?: string;
    width?: number;
    height?: number;
    duration?: number;
    thumbnailUrl?: string;
    scanStatus?: FileScanStatus;
    canAttach?: boolean;
    canDownload?: boolean;
    canPreview?: boolean;
    releaseStatus?: FileReleaseStatus;
    releaseReason?: FileReleaseReason;
  }) {
    return {
      fileId: input.fileId,
      uploadId: input.uploadId,
      mimeType: input.mimeType,
      size: input.sizeBytes,
      name: input.filename,
      purpose: input.purpose,
      objectKey: input.objectKey,
      url: input.url,
      width: input.width,
      height: input.height,
      duration: input.duration,
      thumbnailUrl: input.thumbnailUrl,
      scanStatus: input.scanStatus,
      canAttach: input.canAttach,
      canDownload: input.canDownload,
      canPreview: input.canPreview,
      releaseStatus: input.releaseStatus,
      releaseReason: input.releaseReason,
    };
  },

  async attachToUserAvatar(payload: { fileId?: string; uploadId?: string }) {
    return unwrapApiSuccess(await userApi.attachAvatar(payload));
  },

  async attachToGroupAvatar(payload: {
    groupId: string;
    fileId?: string;
    uploadId?: string;
  }) {
    return unwrapApiSuccess(
      await groupApi.attachAvatar(payload.groupId, {
        fileId: payload.fileId,
        uploadId: payload.uploadId,
      }),
    );
  },

  async listRecoverableMessageDrafts(input: {
    conversationId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<RecoverableUploadRecord[]> {
    const response = unwrapApiSuccess(
      await fileApi.listUnattachedUploads(input),
    );
    return Array.isArray(response.items) ? response.items : [];
  },

  async abandonUpload(input: {
    uploadId: string;
    reason?: string;
    signal?: AbortSignal;
  }) {
    return unwrapApiSuccess(
      await fileApi.abandonUpload(input.uploadId, {
        reason: input.reason,
        signal: input.signal,
      }),
    );
  },
};

export default uploadClient;
