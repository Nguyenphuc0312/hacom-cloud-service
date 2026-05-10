import {
  UPLOAD_LIMITS,
  resolveUploadFileCategory,
  resolveUploadMimeTypeForFile,
} from "../utils/uploadPolicy";

/**
 * @fileoverview AttachmentDraft — data model for pending file uploads.
 *
 * Each draft tracks a single file from selection through upload to ready/failed.
 * Object URLs are created for image/video previews and MUST be revoked on cleanup.
 */

// ── File kind classification ────────────────────────────────────────

export type FileKind = "image" | "video" | "pdf" | "doc" | "other";

// ── Upload lifecycle status ─────────────────────────────────────────

export type AttachmentDraftStatus =
  | "queued"
  | "uploading"
  | "ready"
  | "failed"
  | "blocked"
  | "removed";

// ── Uploaded metadata (returned by POST /files/complete) ────────────

export interface UploadedFileMeta {
  fileId: string;
  mimeType: string;
  size: number;
  name: string;
  objectKey?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

// ── Core draft type ─────────────────────────────────────────────────

export interface AttachmentDraft {
  /** Client-side unique ID (crypto.randomUUID or fallback) */
  localId: string;
  /** The raw File object */
  file: File;
  /** Classified kind for UI rendering */
  kind: FileKind;
  /** ObjectURL for image/video preview — MUST be revoked on cleanup */
  previewUrl?: string;
  /** Current upload lifecycle status */
  status: AttachmentDraftStatus;
  /** Upload progress 0..100 */
  progress: number;
  /** Human-readable error message (i18n key or plain text) */
  error?: string;
  /** Populated after successful upload + complete */
  uploaded?: UploadedFileMeta;
}

// ── Constraints ─────────────────────────────────────────────────────

export const ATTACHMENT_CONSTRAINTS = {
  /** Maximum number of files per message */
  maxFilesPerMessage: UPLOAD_LIMITS.maxFilesPerMessage,
  /** Maximum total size in bytes (450 MiB) */
  maxTotalSize: UPLOAD_LIMITS.maxTotalSizePerMessage,
  /** Maximum single file size in bytes by upload category */
  maxFileSizeByCategory: UPLOAD_LIMITS.maxBytesByCategory,
} as const;

// ── Helpers ─────────────────────────────────────────────────────────

/** Classify a File into a FileKind based on MIME type and extension */
export function resolveFileKind(file: File): FileKind {
  const mime = resolveUploadMimeTypeForFile(file) || "";
  const category = resolveUploadFileCategory(mime);
  if (category === "image") return "image";
  if (category === "video") return "video";
  if (mime === "application/pdf") return "pdf";
  if (category === "document" || category === "archive" || category === "audio") {
    return "doc";
  }

  // Fallback to extension
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
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

/** Generate a unique local ID */
export function generateLocalId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Create an AttachmentDraft from a File */
export function createAttachmentDraft(file: File): AttachmentDraft {
  const kind = resolveFileKind(file);
  const needsPreview = kind === "image" || kind === "video";

  return {
    localId: generateLocalId(),
    file,
    kind,
    previewUrl: needsPreview ? URL.createObjectURL(file) : undefined,
    status: "queued",
    progress: 0,
  };
}

/** Check if two files are likely duplicates (same name + size) */
export function isDuplicateFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size;
}
