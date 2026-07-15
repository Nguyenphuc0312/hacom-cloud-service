/**
 * @fileoverview Format file size and file type utilities.
 * This file re-exports from mimeRegistry and filePreviewUtils for backward compatibility.
 */

export type { PreviewType } from "./mimeRegistry";
export type { FileCategory } from "./mimeRegistry";
export {
  getMimePreviewType,
  getMimeCategory,
  canBrowserPreview,
  canBrowserFullPreview,
  isImageMimeType,
  isVideoMimeType,
  isAudioMimeType,
  getMimeTypesByPreviewType,
  getAllowedMimeTypes,
} from "./mimeRegistry";

export {
  formatFileSize,
  getFileExtension,
  getFileExtensionLower,
  getAttachmentPreviewType,
  getAttachmentCategory,
  canAttachmentPreview,
  isAttachmentImage,
  isAttachmentVideo,
  isAttachmentAudio,
  isAttachmentText,
  isAttachmentCsv,
  isAttachmentPdf,
  isAttachmentDocument,
  isAttachmentSpreadsheet,
  isAttachmentPresentation,
  isAttachmentArchive,
  shouldShowInlinePreview,
  shouldShowAudioPlayer,
  needsPreviewModal,
  isFileTooLargeForPreview,
  isFileTooLargeForTextPreview,
  getPreviewTypeDisplayName,
  getIconTypeFromPreviewType,
  getFileIconTypeByName,
  MAX_PREVIEW_SIZE,
  MAX_TEXT_PREVIEW_SIZE,
  MAX_TEXT_PREVIEW_LINES,
  MAX_CSV_PREVIEW_ROWS,
} from "./filePreviewUtils";

export type { FileIconType } from "./filePreviewUtils";

// Import MIME_REGISTRY directly from mimeRegistry for inline use
import { MIME_REGISTRY } from "./mimeRegistry";
import type { FileIconType } from "./filePreviewUtils";

/**
 * Map preview type to file icon type (inlined to avoid circular deps)
 */
const PREVIEW_TO_ICON_MAP: Record<string, FileIconType> = {
  image: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  text: "document",
  csv: "spreadsheet",
  document: "document",
  spreadsheet: "spreadsheet",
  presentation: "presentation",
  archive: "archive",
  unknown: "generic",
};

/**
 * @deprecated Use getMimePreviewType from mimeRegistry (synchronous)
 */
export function getPreviewType(
  mimeType: string | undefined,
  fileName?: string,
): string {
  // Direct inline implementation to avoid circular dependencies
  if (mimeType) {
    const def = MIME_REGISTRY.get(mimeType.toLowerCase());
    if (def) return def.previewType;
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    for (const [, definition] of MIME_REGISTRY) {
      if (definition.extensions.includes(ext)) {
        return definition.previewType;
      }
    }
  }

  return "unknown";
}

/**
 * @deprecated Use getMimePreviewType from mimeRegistry + getIconTypeFromPreviewType from filePreviewUtils
 */
export function getFileIconType(
  mimeType: string | undefined,
  fileName: string | undefined,
): FileIconType {
  const previewType = getPreviewType(mimeType, fileName);
  return PREVIEW_TO_ICON_MAP[previewType] ?? "unknown";
}
