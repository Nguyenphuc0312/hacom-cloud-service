import { MessageType, type Message } from "../../../types";
import type { AttachmentDraft } from "../../../types/attachmentDraft";
import type { CloudUploadProgress } from "../types";

export const getCloudErrorTranslationKey = (code: string): string => {
  switch (code) {
    case "DEMO_USER_REQUIRED":
    case "CLOUD_USER_MISSING":
    case "CLOUD_AUTH_REQUIRED":
    case "UNAUTHORIZED":
    case "FORBIDDEN":
    case "AUTH_REQUIRED":
    case "INVALID_ACCESS_TOKEN":
    case "TOKEN_EXPIRED":
    case "SESSION_REVOKED":
    case "ACCOUNT_NOT_ACTIVE":
      return "errors.user";
    case "QUOTA_EXCEEDED":
      return "errors.quota";
    case "FILE_TOO_LARGE":
      return "errors.fileTooLarge";
    case "DRIVE_NOT_ACTIVE":
      return "errors.driveInactive";
    case "ITEM_NOT_READY":
      return "errors.itemNotReady";
    case "TRASH_EXPIRED":
      return "errors.trashExpired";
    case "INVALID_QUOTA_TIER":
      return "errors.invalidQuotaTier";
    case "QUOTA_REQUEST_PENDING":
      return "errors.quotaRequestPending";
    case "IDEMPOTENCY_CONFLICT":
      return "errors.idempotencyConflict";
    case "OBJECT_UPLOAD_NETWORK_ERROR":
    case "CLOUD_NETWORK_ERROR":
    case "CLOUD_UNAVAILABLE":
    case "AUTH_AUTHORITY_UNAVAILABLE":
    case "CLOUD_REQUEST_FAILED":
    case "SERVICE_UNAVAILABLE":
    case "DEPENDENCY_UNAVAILABLE":
    case "DATABASE_UNAVAILABLE":
    case "CLOUD_NOT_READY":
    case "INTERNAL_ERROR":
      return "errors.offline";
    default:
      return "errors.generic";
  }
};

export const attachmentStatusForCloudProgress = (
  progress: CloudUploadProgress,
): AttachmentDraft["status"] => {
  switch (progress.stage) {
    case "reserving":
      return "reserving";
    case "uploading":
      return "uploading";
    case "finalizing":
      return "completing";
    case "processing":
      return "security_pending";
  }
};

/** Search only the message body; timestamps and media filenames are metadata. */
export const getCloudMessageSearchText = (message: Message): string => {
  if (message.type !== MessageType.TEXT) return "";
  const plainText = String(message.plainText ?? "").trim();
  const content = String(message.content ?? "").trim();
  return plainText && content && plainText !== content
    ? `${plainText} ${content}`
    : plainText || content;
};

export const stripCloudRichText = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

export const isStandaloneHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.toString().length > 0;
  } catch {
    return false;
  }
};

export const getMessageRangeIds = (
  orderedMessages: Message[],
  startId: string,
  endId: string,
): string[] => {
  const startIndex = orderedMessages.findIndex((message) => message.id === startId);
  const endIndex = orderedMessages.findIndex((message) => message.id === endId);
  if (startIndex < 0 || endIndex < 0) return [];

  const lowerIndex = Math.min(startIndex, endIndex);
  const upperIndex = Math.max(startIndex, endIndex);
  return orderedMessages.slice(lowerIndex, upperIndex + 1).map((message) => message.id);
};
