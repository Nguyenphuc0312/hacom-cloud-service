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

export interface TrashCountdown {
  expired: boolean;
  hours: number;
  minutes: number;
}

/** Returns the server purge deadline, falling back to the 24-hour trash policy. */
export const getTrashExpiry = (
  purgeAfter: string | undefined,
  deletedAt: string | undefined,
): string | undefined => {
  if (purgeAfter && Number.isFinite(new Date(purgeAfter).getTime())) return purgeAfter;
  const deletedAtMs = deletedAt ? new Date(deletedAt).getTime() : Number.NaN;
  return Number.isFinite(deletedAtMs)
    ? new Date(deletedAtMs + 24 * 60 * 60 * 1000).toISOString()
    : undefined;
};

/**
 * Keeps file resources classified by their actual MIME/extension. Older
 * Cloud projections can report every object with an image-like type, which
 * makes CSV files render as thumbnails in the chat timeline. Hacom Chat
 * resolves file icons from MIME + filename, so Cloud applies the same
 * correction at its API boundary.
 */
export const normalizeCloudItemType = (item: CloudItem): CloudItem => {
  if (item.type === "text" || item.type === "link") return item;

  const mime = (item.contentType ?? "").trim().toLowerCase();
  const fileName = (item.title ?? "").split("?", 1)[0].trim().toLowerCase();
  const isSpreadsheet =
    mime === "text/csv" ||
    mime === "application/csv" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(csv|xls|xlsx|ods)$/.test(fileName);

  return isSpreadsheet && item.type !== "file"
    ? { ...item, type: "file" }
    : item;
};

export const getTrashCountdown = (
  expiresAt: string | undefined,
  now = Date.now(),
): TrashCountdown => {
  const expiry = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  if (!Number.isFinite(expiry) || expiry <= now) {
    return { expired: true, hours: 0, minutes: 0 };
  }
  const remainingMinutes = Math.max(1, Math.ceil((expiry - now) / 60_000));
  return {
    expired: false,
    hours: Math.floor(remainingMinutes / 60),
    minutes: remainingMinutes % 60 || 60,
  };
};

/** True when a trashed item has reached its permanent-purge deadline. */
export const isTrashItemExpired = (
  item: Pick<CloudItem, "purgeAfter" | "deletedAt">,
  now = Date.now(),
): boolean => {
  const expiry = getTrashExpiry(item.purgeAfter, item.deletedAt);
  // Older optimistic/local projections may not have lifecycle timestamps yet.
  // Do not discard those entries until the server supplies a real deadline.
  return expiry ? getTrashCountdown(expiry, now).expired : false;
};

/** Sort trash entries by the most recent deletion, falling back to creation. */
export const getTrashSortTime = (
  item: Pick<CloudItem, "deletedAt" | "createdAt">,
): number => {
  const deletedAt = item.deletedAt ? Date.parse(item.deletedAt) : Number.NaN;
  if (Number.isFinite(deletedAt)) return deletedAt;
  const createdAt = Date.parse(item.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
};
