import type { CloudItem } from "../types";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1000)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1000 ** unitIndex;
  const precision =
    unitIndex === 0 || value >= 10 || Number.isInteger(value) ? 0 : 1;
  return `${value.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
};

export const formatCloudDateTime = (
  value: string,
  locale: string,
): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const formatCloudTime = (value: string, locale: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const getCloudItemTitle = (
  item: CloudItem,
  fallback: {
    text: string;
    link: string;
    file: string;
  },
): string => {
  if (item.title?.trim()) return item.title.trim();
  if (item.type === "text") {
    const content = item.content?.trim();
    return content ? content.slice(0, 72) : fallback.text;
  }
  if (item.type === "link") return fallback.link;
  return fallback.file;
};

export const getCloudItemPreview = (item: CloudItem): string => {
  if (item.type === "text") return item.content?.trim() ?? "";
  if (item.type === "link") return item.url?.trim() ?? "";
  return "";
};

export const isSafeExternalUrl = (value: string | undefined): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
