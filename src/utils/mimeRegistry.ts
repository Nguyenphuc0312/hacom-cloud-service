/**
 * @fileoverview MIME Type Registry - Central registry for all supported file types.
 * Maps MIME types to preview capabilities and file categories.
 *
 * This is the single source of truth for MIME type handling.
 * All file type logic should use this registry instead of hardcoding.
 */

import { FileType } from "@hacom/chat-shared-types/chat";

// ── Preview Types ──────────────────────────────────────────────────────

export type PreviewType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "csv"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "unknown";

// ── File Category (matches backend FileType) ────────────────────────────

export type FileCategory =
  | typeof FileType.IMAGE
  | typeof FileType.VIDEO
  | typeof FileType.AUDIO
  | typeof FileType.DOCUMENT
  | typeof FileType.ARCHIVE
  | "generic";

// ── Browser Preview Capability ─────────────────────────────────────────

export type BrowserPreviewCapability =
  | "full"      // Browser can render inline
  | "partial"  // Browser can render with limitations
  | "none";    // Must use download fallback

// ── MIME Type Definition ──────────────────────────────────────────────

export interface MimeTypeDefinition {
  mimeType: string;
  extensions: readonly string[];
  previewType: PreviewType;
  category: FileCategory;
  browserPreview: BrowserPreviewCapability;
  description: string;
}

// ── Registry ───────────────────────────────────────────────────────────

export const MIME_REGISTRY: ReadonlyMap<string, MimeTypeDefinition> = new Map([
  // ── Images ──────────────────────────────────────────────────────────
  ["image/jpeg", {
    mimeType: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    previewType: "image",
    category: FileType.IMAGE,
    browserPreview: "full",
    description: "JPEG Image",
  }],
  ["image/png", {
    mimeType: "image/png",
    extensions: [".png"],
    previewType: "image",
    category: FileType.IMAGE,
    browserPreview: "full",
    description: "PNG Image",
  }],
  ["image/gif", {
    mimeType: "image/gif",
    extensions: [".gif"],
    previewType: "image",
    category: FileType.IMAGE,
    browserPreview: "full",
    description: "GIF Image",
  }],
  ["image/webp", {
    mimeType: "image/webp",
    extensions: [".webp"],
    previewType: "image",
    category: FileType.IMAGE,
    browserPreview: "full",
    description: "WebP Image",
  }],
  ["image/bmp", {
    mimeType: "image/bmp",
    extensions: [".bmp"],
    previewType: "image",
    category: FileType.IMAGE,
    browserPreview: "full",
    description: "BMP Image",
  }],

  // ── Videos ─────────────────────────────────────────────────────────
  ["video/mp4", {
    mimeType: "video/mp4",
    extensions: [".mp4"],
    previewType: "video",
    category: FileType.VIDEO,
    browserPreview: "full",
    description: "MP4 Video",
  }],
  ["video/webm", {
    mimeType: "video/webm",
    extensions: [".webm"],
    previewType: "video",
    category: FileType.VIDEO,
    browserPreview: "full",
    description: "WebM Video",
  }],
  ["video/quicktime", {
    mimeType: "video/quicktime",
    extensions: [".mov"],
    previewType: "video",
    category: FileType.VIDEO,
    browserPreview: "partial",
    description: "QuickTime Video",
  }],
  ["video/x-msvideo", {
    mimeType: "video/x-msvideo",
    extensions: [".avi"],
    previewType: "video",
    category: FileType.VIDEO,
    browserPreview: "partial",
    description: "AVI Video",
  }],
  ["video/x-matroska", {
    mimeType: "video/x-matroska",
    extensions: [".mkv"],
    previewType: "video",
    category: FileType.VIDEO,
    browserPreview: "partial",
    description: "Matroska Video",
  }],

  // ── Audio ──────────────────────────────────────────────────────────
  ["audio/mpeg", {
    mimeType: "audio/mpeg",
    extensions: [".mp3"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "MP3 Audio",
  }],
  ["audio/wav", {
    mimeType: "audio/wav",
    extensions: [".wav"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "WAV Audio",
  }],
  ["audio/x-wav", {
    mimeType: "audio/x-wav",
    extensions: [".wav"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "WAV Audio",
  }],
  ["audio/ogg", {
    mimeType: "audio/ogg",
    extensions: [".ogg"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "OGG Audio",
  }],
  ["audio/webm", {
    mimeType: "audio/webm",
    extensions: [".webm", ".weba"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "WebM Audio",
  }],
  ["audio/mp4", {
    mimeType: "audio/mp4",
    extensions: [".m4a"],
    previewType: "audio",
    category: FileType.AUDIO,
    browserPreview: "full",
    description: "MP4 Audio",
  }],

  // ── PDF ────────────────────────────────────────────────────────────
  ["application/pdf", {
    mimeType: "application/pdf",
    extensions: [".pdf"],
    previewType: "pdf",
    category: FileType.DOCUMENT,
    browserPreview: "partial",
    description: "PDF Document",
  }],

  // ── Text ───────────────────────────────────────────────────────────
  ["text/plain", {
    mimeType: "text/plain",
    extensions: [".txt"],
    previewType: "text",
    category: FileType.DOCUMENT,
    browserPreview: "full",
    description: "Text File",
  }],
  ["text/csv", {
    mimeType: "text/csv",
    extensions: [".csv"],
    previewType: "csv",
    category: FileType.DOCUMENT,
    browserPreview: "full",
    description: "CSV File",
  }],
  ["application/csv", {
    mimeType: "application/csv",
    extensions: [".csv"],
    previewType: "csv",
    category: FileType.DOCUMENT,
    browserPreview: "full",
    description: "CSV File",
  }],

  // ── Word Documents ─────────────────────────────────────────────────
  ["application/msword", {
    mimeType: "application/msword",
    extensions: [".doc"],
    previewType: "document",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "Word Document",
  }],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".docx"],
    previewType: "document",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "Word Document",
  }],

  // ── Excel Spreadsheets ─────────────────────────────────────────────
  ["application/vnd.ms-excel", {
    mimeType: "application/vnd.ms-excel",
    extensions: [".xls"],
    previewType: "spreadsheet",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "Excel Spreadsheet",
  }],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: [".xlsx"],
    previewType: "spreadsheet",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "Excel Spreadsheet",
  }],

  // ── PowerPoint Presentations ───────────────────────────────────────
  ["application/vnd.ms-powerpoint", {
    mimeType: "application/vnd.ms-powerpoint",
    extensions: [".ppt"],
    previewType: "presentation",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "PowerPoint Presentation",
  }],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: [".pptx"],
    previewType: "presentation",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "PowerPoint Presentation",
  }],

  // ── OpenDocument Formats ────────────────────────────────────────────
  ["application/vnd.oasis.opendocument.text", {
    mimeType: "application/vnd.oasis.opendocument.text",
    extensions: [".odt"],
    previewType: "document",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "OpenDocument Text",
  }],
  ["application/vnd.oasis.opendocument.spreadsheet", {
    mimeType: "application/vnd.oasis.opendocument.spreadsheet",
    extensions: [".ods"],
    previewType: "spreadsheet",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "OpenDocument Spreadsheet",
  }],
  ["application/vnd.oasis.opendocument.presentation", {
    mimeType: "application/vnd.oasis.opendocument.presentation",
    extensions: [".odp"],
    previewType: "presentation",
    category: FileType.DOCUMENT,
    browserPreview: "none",
    description: "OpenDocument Presentation",
  }],

  // ── Archives ───────────────────────────────────────────────────────
  ["application/zip", {
    mimeType: "application/zip",
    extensions: [".zip"],
    previewType: "archive",
    category: FileType.ARCHIVE,
    browserPreview: "none",
    description: "ZIP Archive",
  }],
  ["application/x-zip-compressed", {
    mimeType: "application/x-zip-compressed",
    extensions: [".zip"],
    previewType: "archive",
    category: FileType.ARCHIVE,
    browserPreview: "none",
    description: "ZIP Archive",
  }],
  ["application/x-7z-compressed", {
    mimeType: "application/x-7z-compressed",
    extensions: [".7z"],
    previewType: "archive",
    category: FileType.ARCHIVE,
    browserPreview: "none",
    description: "7-Zip Archive",
  }],
  ["application/vnd.rar", {
    mimeType: "application/vnd.rar",
    extensions: [".rar"],
    previewType: "archive",
    category: FileType.ARCHIVE,
    browserPreview: "none",
    description: "RAR Archive",
  }],
  ["application/x-rar-compressed", {
    mimeType: "application/x-rar-compressed",
    extensions: [".rar"],
    previewType: "archive",
    category: FileType.ARCHIVE,
    browserPreview: "none",
    description: "RAR Archive",
  }],
]);

// ── Extension to MIME mapping ─────────────────────────────────────────

const EXTENSION_TO_MIME: ReadonlyMap<string, string> = new Map(
  Array.from(MIME_REGISTRY.entries()).flatMap(([mime, def]) =>
    def.extensions.map((ext) => [ext.toLowerCase(), mime] as const),
  ),
);

// ── Lookup Functions ───────────────────────────────────────────────────

/**
 * Get MIME type definition from MIME string
 */
export function getMimeDefinition(mimeType: string): MimeTypeDefinition | undefined {
  return MIME_REGISTRY.get(mimeType.toLowerCase());
}

/**
 * Get MIME type definition from file extension
 */
export function getMimeDefinitionByExtension(extension: string): MimeTypeDefinition | undefined {
  const normalized = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  const mimeType = EXTENSION_TO_MIME.get(normalized);
  return mimeType ? MIME_REGISTRY.get(mimeType) : undefined;
}

/**
 * Get preview type for a MIME type (with extension fallback)
 */
export function getMimePreviewType(
  mimeType: string | undefined,
  fileName?: string,
): PreviewType {
  if (mimeType) {
    const def = MIME_REGISTRY.get(mimeType.toLowerCase());
    if (def) return def.previewType;
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const def = getMimeDefinitionByExtension(ext);
    if (def) return def.previewType;
  }

  return "unknown";
}

/**
 * Get file category for a MIME type
 */
export function getMimeCategory(
  mimeType: string | undefined,
  fileName?: string,
): FileCategory {
  if (mimeType) {
    const def = MIME_REGISTRY.get(mimeType.toLowerCase());
    if (def) return def.category;
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const def = getMimeDefinitionByExtension(ext);
    if (def) return def.category;
  }

  return "generic";
}

/**
 * Check if browser can preview this MIME type
 */
export function canBrowserPreview(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const def = MIME_REGISTRY.get(mimeType.toLowerCase());
  return def?.browserPreview === "full" || def?.browserPreview === "partial";
}

/**
 * Check if browser has full preview capability
 */
export function canBrowserFullPreview(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const def = MIME_REGISTRY.get(mimeType.toLowerCase());
  return def?.browserPreview === "full";
}

/**
 * Check if this is an image MIME type
 */
export function isImageMimeType(mimeType: string | undefined): boolean {
  return mimeType?.toLowerCase().startsWith("image/") ?? false;
}

/**
 * Check if this is a video MIME type
 */
export function isVideoMimeType(mimeType: string | undefined): boolean {
  return mimeType?.toLowerCase().startsWith("video/") ?? false;
}

/**
 * Check if this is an audio MIME type
 */
export function isAudioMimeType(mimeType: string | undefined): boolean {
  return mimeType?.toLowerCase().startsWith("audio/") ?? false;
}

/**
 * Get all allowed MIME types for upload
 */
export function getAllowedMimeTypes(): string[] {
  return Array.from(MIME_REGISTRY.keys());
}

/**
 * Get MIME types by preview type
 */
export function getMimeTypesByPreviewType(previewType: PreviewType): string[] {
  return Array.from(MIME_REGISTRY.values())
    .filter((def) => def.previewType === previewType)
    .map((def) => def.mimeType);
}
