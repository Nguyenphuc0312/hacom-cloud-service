import {
  UPLOAD_LIMITS,
  resolveUploadFileCategory,
  resolveUploadMimeTypeForFile,
} from "../utils/uploadPolicy";

export type FileKind = "image" | "video" | "pdf" | "doc" | "other";

export type FileUploadPurpose =
  | "message_attachment"
  | "user_avatar"
  | "group_avatar"
  | "calendar_attachment";

export type AttachmentDraftStatus =
  | "idle"
  | "validating"
  | "reserving"
  | "uploading"
  | "completing"
  | "security_pending"
  | "finalized"
  | "attaching"
  | "attached"
  | "failed"
  | "expired"
  | "cancelled"
  | "removed";

export interface UploadedFileMeta {
  fileId: string;
  uploadId: string;
  mimeType: string;
  size: number;
  name: string;
  purpose: FileUploadPurpose;
  objectKey?: string;
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  canAttach?: boolean;
  canDownload?: boolean;
  canPreview?: boolean;
  releaseStatus?: "released" | "blocked";
  releaseReason?: string;
}

export interface AttachmentDraft {
  localId: string;
  file?: File | null;
  uploadId?: string;
  fileId?: string;
  purpose: FileUploadPurpose;
  conversationId?: string;
  groupId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: FileKind;
  previewUrl?: string;
  progress: number;
  status: AttachmentDraftStatus;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  expiresAt?: string;
  retryCount: number;
  clientMessageId?: string;
  uploaded?: UploadedFileMeta;
}

export interface PersistedAttachmentDraft {
  localId: string;
  uploadId?: string;
  fileId?: string;
  purpose: FileUploadPurpose;
  conversationId?: string;
  groupId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  kind: FileKind;
  progress: number;
  status: AttachmentDraftStatus;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  expiresAt?: string;
  retryCount: number;
  clientMessageId?: string;
  uploaded?: UploadedFileMeta;
}

export const ATTACHMENT_CONSTRAINTS = {
  maxFilesPerMessage: UPLOAD_LIMITS.maxFilesPerMessage,
  maxTotalSize: UPLOAD_LIMITS.maxTotalSizePerMessage,
  maxFileSizeByCategory: UPLOAD_LIMITS.maxBytesByCategory,
} as const;

export function resolveFileKind(input: Pick<File, "name" | "type">): FileKind {
  const mime = resolveUploadMimeTypeForFile(input) || "";
  const category = resolveUploadFileCategory(mime);
  if (category === "image") return "image";
  if (category === "video") return "video";
  if (mime === "application/pdf") return "pdf";
  if (category === "document" || category === "archive" || category === "audio") {
    return "doc";
  }

  const ext = input.name.split(".").pop()?.toLowerCase() ?? "";
  const docExts = new Set([
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "odt",
    "ods",
    "odp",
    "txt",
    "csv",
    "rtf",
  ]);
  if (ext === "pdf") return "pdf";
  if (docExts.has(ext)) return "doc";
  return "other";
}

export function generateLocalId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAttachmentDraft(
  file: File,
  input: {
    purpose?: FileUploadPurpose;
    conversationId?: string;
    groupId?: string;
    clientMessageId?: string;
  } = {},
): AttachmentDraft {
  const kind = resolveFileKind(file);
  const needsPreview = kind === "image" || kind === "video";
  const mimeType = resolveUploadMimeTypeForFile(file) || file.type || "";
  const createdAt = new Date().toISOString();

  return {
    localId: generateLocalId(),
    file,
    purpose: input.purpose ?? "message_attachment",
    conversationId: input.conversationId,
    groupId: input.groupId,
    filename: file.name,
    mimeType,
    sizeBytes: file.size,
    kind,
    previewUrl: needsPreview ? URL.createObjectURL(file) : undefined,
    progress: 0,
    status: "idle",
    createdAt,
    retryCount: 0,
    clientMessageId: input.clientMessageId,
  };
}

export function createRecoveredAttachmentDraft(
  draft: PersistedAttachmentDraft,
): AttachmentDraft {
  return {
    ...draft,
    file: null,
    uploaded:
      draft.uploaded ||
      (draft.fileId && draft.uploadId
        ? {
            fileId: draft.fileId,
            uploadId: draft.uploadId,
            mimeType: draft.mimeType,
            size: draft.sizeBytes,
            name: draft.filename,
            purpose: draft.purpose,
          }
        : undefined),
  };
}

export function toPersistedAttachmentDraft(
  draft: AttachmentDraft,
): PersistedAttachmentDraft {
  return {
    localId: draft.localId,
    uploadId: draft.uploadId,
    fileId: draft.fileId,
    purpose: draft.purpose,
    conversationId: draft.conversationId,
    groupId: draft.groupId,
    filename: draft.filename,
    mimeType: draft.mimeType,
    sizeBytes: draft.sizeBytes,
    kind: draft.kind,
    progress: draft.progress,
    status: draft.status,
    errorCode: draft.errorCode,
    errorMessage: draft.errorMessage,
    createdAt: draft.createdAt,
    expiresAt: draft.expiresAt,
    retryCount: draft.retryCount,
    clientMessageId: draft.clientMessageId,
    uploaded: draft.uploaded,
  };
}

export function isDuplicateFile(
  draft: Pick<AttachmentDraft, "filename" | "sizeBytes">,
  file: Pick<File, "name" | "size">,
): boolean {
  return draft.filename === file.name && draft.sizeBytes === file.size;
}

export function isFinalizedAttachmentDraft(draft: AttachmentDraft): boolean {
  return (
    (draft.status === "finalized" || draft.status === "attached") &&
    typeof draft.fileId === "string" &&
    draft.fileId.length > 0
  );
}

export function isBlockingAttachmentDraft(draft: AttachmentDraft): boolean {
  return [
    "validating",
    "reserving",
    "uploading",
    "completing",
    "security_pending",
    "attaching",
  ].includes(draft.status);
}
