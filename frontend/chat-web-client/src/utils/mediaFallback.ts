export type AttachmentKind = "image" | "video" | "audio" | "file";

type AttachmentLike = {
  id?: string | null;
  type?: string | null;
  objectKey?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  originalName?: string | null;
  name?: string | null;
  size?: number | null;
  sizeBytes?: number | null;
};

const IMAGE_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);

const VIDEO_EXTENSIONS = new Set([
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
]);

const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
  "weba",
]);

export const getAttachmentDisplayName = (
  attachment?: AttachmentLike | null,
): string => {
  const candidates = [
    attachment?.fileName,
    attachment?.originalName,
    attachment?.name,
    attachment?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "Tep dinh kem";
};

export const getFileExtension = (
  fileName?: string | null,
): string => {
  if (!fileName) return "";
  const normalized = fileName.trim();
  const dot = normalized.lastIndexOf(".");
  if (dot < 0 || dot === normalized.length - 1) return "";
  return normalized.slice(dot + 1).toLowerCase();
};

export const isImageMime = (mimeType?: string | null): boolean =>
  typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");

export const isVideoMime = (mimeType?: string | null): boolean =>
  typeof mimeType === "string" && mimeType.toLowerCase().startsWith("video/");

export const isAudioMime = (mimeType?: string | null): boolean =>
  typeof mimeType === "string" && mimeType.toLowerCase().startsWith("audio/");

export const getAttachmentKind = (
  attachment?: AttachmentLike | null,
): AttachmentKind => {
  const type = String(attachment?.type ?? "").toLowerCase();
  if (type === "image" || type === "video" || type === "audio") {
    return type;
  }

  const mimeType = attachment?.mimeType;
  if (isImageMime(mimeType)) return "image";
  if (isVideoMime(mimeType)) return "video";
  if (isAudioMime(mimeType)) return "audio";

  const extension = getFileExtension(getAttachmentDisplayName(attachment));
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";

  return "file";
};

export const getInitials = (name?: string | null): string => {
  const normalized = typeof name === "string"
    ? name.trim().replace(/\s+/g, " ")
    : "";
  if (!normalized) return "";

  const parts = normalized.split(" ").filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase().slice(0, 2);
};

export const getAttachmentSize = (
  attachment?: AttachmentLike | null,
): number | undefined => {
  const value = attachment?.fileSize ?? attachment?.size ?? attachment?.sizeBytes;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};
