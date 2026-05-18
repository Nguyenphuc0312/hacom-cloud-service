/**
 * @fileoverview File category utilities for classifying files and getting display info.
 */

import type { PreviewType } from "./mimeRegistry";

/**
 * File category for display purposes
 */
export type FileCategoryDisplay =
  | "pdf"
  | "word"
  | "excel"
  | "ppt"
  | "archive"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "other";

/**
 * Color scheme for file type badges
 */
export interface FileTypeColorScheme {
  bg: string;
  text: string;
  border?: string;
}

/**
 * Get file category from file extension or MIME type
 */
export function getFileCategory(
  mimeType?: string,
  fileName?: string,
): FileCategoryDisplay {
  if (mimeType) {
    const lower = mimeType.toLowerCase();

    if (lower.includes("pdf")) return "pdf";
    if (lower.includes("word") || lower.includes("document")) return "word";
    if (lower.includes("excel") || lower.includes("spreadsheet")) return "excel";
    if (lower.includes("powerpoint") || lower.includes("presentation")) return "ppt";
    if (lower.includes("zip") || lower.includes("rar") || lower.includes("7z") || lower.includes("archive")) return "archive";
    if (lower.includes("text")) return "text";
    if (lower.startsWith("image/")) return "image";
    if (lower.startsWith("video/")) return "video";
    if (lower.startsWith("audio/")) return "audio";
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    const categoryMap: Record<string, FileCategoryDisplay> = {
      pdf: "pdf",
      doc: "word",
      docx: "word",
      odt: "word",
      xls: "excel",
      xlsx: "excel",
      csv: "excel",
      ods: "excel",
      ppt: "ppt",
      pptx: "ppt",
      odp: "ppt",
      zip: "archive",
      rar: "archive",
      "7z": "archive",
      tar: "archive",
      gz: "archive",
      txt: "text",
      md: "text",
      json: "text",
      xml: "text",
      png: "image",
      jpg: "image",
      jpeg: "image",
      gif: "image",
      webp: "image",
      bmp: "image",
      svg: "image",
      mp4: "video",
      mov: "video",
      webm: "video",
      avi: "video",
      mkv: "video",
      mp3: "audio",
      wav: "audio",
      ogg: "audio",
      m4a: "audio",
      flac: "audio",
    };

    return categoryMap[ext] || "other";
  }

  return "other";
}

/**
 * Get color scheme for file type badge
 */
export function getFileTypeColorScheme(category: FileCategoryDisplay): FileTypeColorScheme {
  const schemes: Record<FileCategoryDisplay, FileTypeColorScheme> = {
    pdf: { bg: "#E53935", text: "#FFFFFF" },
    word: { bg: "#1976D2", text: "#FFFFFF" },
    excel: { bg: "#2E7D32", text: "#FFFFFF" },
    ppt: { bg: "#E65100", text: "#FFFFFF" },
    archive: { bg: "#7B1FA2", text: "#FFFFFF" },
    text: { bg: "#546E7A", text: "#FFFFFF" },
    image: { bg: "#00897B", text: "#FFFFFF" },
    video: { bg: "#5E35B1", text: "#FFFFFF" },
    audio: { bg: "#FF8F00", text: "#FFFFFF" },
    other: { bg: "#78909C", text: "#FFFFFF" },
  };

  return schemes[category];
}

/**
 * Get display label for file category
 */
export function getFileCategoryLabel(category: FileCategoryDisplay): string {
  const labels: Record<FileCategoryDisplay, string> = {
    pdf: "PDF",
    word: "DOC",
    excel: "XLS",
    ppt: "PPT",
    archive: "ZIP",
    text: "TXT",
    image: "IMG",
    video: "VID",
    audio: "AUD",
    other: "FILE",
  };

  return labels[category];
}

/**
 * Check if a file is an image type
 */
export function isImageFile(mimeType?: string, fileName?: string): boolean {
  return getFileCategory(mimeType, fileName) === "image";
}

/**
 * Check if a file is a video type
 */
export function isVideoFile(mimeType?: string, fileName?: string): boolean {
  return getFileCategory(mimeType, fileName) === "video";
}

/**
 * Check if a file is an audio type
 */
export function isAudioFile(mimeType?: string, fileName?: string): boolean {
  return getFileCategory(mimeType, fileName) === "audio";
}

/**
 * Check if a file is a document type (PDF, Word, etc.)
 */
export function isDocumentFile(mimeType?: string, fileName?: string): boolean {
  const category = getFileCategory(mimeType, fileName);
  return category === "pdf" || category === "word" || category === "excel" || category === "ppt" || category === "text";
}

/**
 * Check if a file is an archive type
 */
export function isArchiveFile(mimeType?: string, fileName?: string): boolean {
  return getFileCategory(mimeType, fileName) === "archive";
}

/**
 * Check if HD badge should be shown (for large images/videos)
 */
export function shouldShowHdBadge(fileSize?: number): boolean {
  if (!fileSize) return false;
  return fileSize > 10 * 1024 * 1024; // > 10MB
}

/**
 * Convert preview type to file category
 */
export function previewTypeToCategory(previewType: PreviewType): FileCategoryDisplay {
  const mapping: Record<string, FileCategoryDisplay> = {
    image: "image",
    video: "video",
    audio: "audio",
    pdf: "pdf",
    document: "word",
    spreadsheet: "excel",
    presentation: "ppt",
    text: "text",
    csv: "excel",
    archive: "archive",
    unknown: "other",
  };

  return mapping[previewType] || "other";
}
