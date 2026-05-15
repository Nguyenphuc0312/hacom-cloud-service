/**
 * @fileoverview File Preview Utilities - Helper functions for file preview logic.
 */

import type { Attachment } from "../types";
import type { PreviewType, FileCategory } from "./mimeRegistry";
import {
  getMimePreviewType,
  getMimeCategory,
  canBrowserPreview,
  isImageMimeType,
  isVideoMimeType,
  isAudioMimeType,
} from "./mimeRegistry";

// ── File Size Limits ────────────────────────────────────────────────────

/** Maximum file size for inline preview (100 MB) */
export const MAX_PREVIEW_SIZE = 100 * 1024 * 1024;

/** Maximum file size for text/csv preview (2 MB) */
export const MAX_TEXT_PREVIEW_SIZE = 2 * 1024 * 1024;

/** Maximum lines to show in text preview */
export const MAX_TEXT_PREVIEW_LINES = 500;

/** Maximum rows to show in CSV preview */
export const MAX_CSV_PREVIEW_ROWS = 100;

/**
 * Check whether a file is too large for inline preview
 */
export function isFileTooLargeForPreview(fileSize: number | undefined): boolean {
  if (!fileSize) return false;
  return fileSize > MAX_PREVIEW_SIZE;
}

/**
 * Check whether a file is too large for text preview
 */
export function isFileTooLargeForTextPreview(fileSize: number | undefined): boolean {
  if (!fileSize) return false;
  return fileSize > MAX_TEXT_PREVIEW_SIZE;
}

// ── File Icon Types ────────────────────────────────────────────────────

export type FileIconType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "spreadsheet"
  | "presentation"
  | "document"
  | "archive"
  | "code"
  | "generic";

/**
 * Get icon type from preview type
 */
export function getIconTypeFromPreviewType(previewType: PreviewType): FileIconType {
  switch (previewType) {
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
      return "audio";
    case "pdf":
      return "pdf";
    case "csv":
    case "spreadsheet":
      return "spreadsheet";
    case "presentation":
      return "presentation";
    case "document":
      return "document";
    case "archive":
      return "archive";
    case "unknown":
    default:
      return "generic";
  }
}

// ── File Extension Helpers ───────────────────────────────────────────────

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()?.toUpperCase() || "" : "";
}

/**
 * Get file extension in lowercase
 */
export function getFileExtensionLower(fileName: string): string {
  const parts = fileName.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
}

// ── Format File Size ────────────────────────────────────────────────────

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i === 0) {
    return `${bytes} ${units[i]}`;
  }

  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

// ── Preview Helpers ────────────────────────────────────────────────────

/**
 * Get preview type for an attachment
 */
export function getAttachmentPreviewType(attachment: Attachment | undefined): PreviewType {
  if (!attachment) return "unknown";
  return getMimePreviewType(attachment.mimeType, attachment.fileName);
}

/**
 * Get file category for an attachment
 */
export function getAttachmentCategory(attachment: Attachment | undefined): FileCategory {
  if (!attachment) return "generic";
  return getMimeCategory(attachment.mimeType, attachment.fileName);
}

/**
 * Check if attachment can be previewed in browser
 */
export function canAttachmentPreview(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return canBrowserPreview(attachment.mimeType);
}

/**
 * Check if attachment is an image
 */
export function isAttachmentImage(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return isImageMimeType(attachment.mimeType);
}

/**
 * Check if attachment is a video
 */
export function isAttachmentVideo(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return isVideoMimeType(attachment.mimeType);
}

/**
 * Check if attachment is an audio (including voice)
 */
export function isAttachmentAudio(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return isAudioMimeType(attachment.mimeType);
}

/**
 * Check if attachment is a text file
 */
export function isAttachmentText(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "text";
}

/**
 * Check if attachment is a CSV file
 */
export function isAttachmentCsv(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "csv";
}

/**
 * Check if attachment is a PDF
 */
export function isAttachmentPdf(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "pdf";
}

/**
 * Check if attachment is a document (word, etc.)
 */
export function isAttachmentDocument(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "document";
}

/**
 * Check if attachment is a spreadsheet
 */
export function isAttachmentSpreadsheet(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "spreadsheet";
}

/**
 * Check if attachment is a presentation
 */
export function isAttachmentPresentation(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "presentation";
}

/**
 * Check if attachment is an archive
 */
export function isAttachmentArchive(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;
  return getMimePreviewType(attachment.mimeType, attachment.fileName) === "archive";
}

// ── Display Helpers ─────────────────────────────────────────────────────

/**
 * Get display name for preview type
 */
export function getPreviewTypeDisplayName(previewType: PreviewType): string {
  switch (previewType) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "pdf":
      return "PDF";
    case "text":
      return "Text";
    case "csv":
      return "CSV";
    case "document":
      return "Document";
    case "spreadsheet":
      return "Spreadsheet";
    case "presentation":
      return "Presentation";
    case "archive":
      return "Archive";
    case "unknown":
    default:
      return "File";
  }
}

/**
 * Check if file should show inline preview in message (lightweight)
 */
export function shouldShowInlinePreview(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;

  const previewType = getAttachmentPreviewType(attachment);
  const isSmallEnough = !isFileTooLargeForPreview(attachment.fileSize);

  return (
    (previewType === "image" || previewType === "video") &&
    isSmallEnough &&
    canBrowserPreview(attachment.mimeType)
  );
}

/**
 * Check if file should show audio player inline
 */
export function shouldShowAudioPlayer(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;

  const previewType = getAttachmentPreviewType(attachment);
  const isSmallEnough = !isFileTooLargeForPreview(attachment.fileSize);

  return previewType === "audio" && isSmallEnough && canBrowserPreview(attachment.mimeType);
}

/**
 * Check if file needs full preview modal
 */
export function needsPreviewModal(attachment: Attachment | undefined): boolean {
  if (!attachment) return false;

  const previewType = getAttachmentPreviewType(attachment);
  return [
    "image",
    "video",
    "audio",
    "pdf",
    "text",
    "csv",
  ].includes(previewType);
}
