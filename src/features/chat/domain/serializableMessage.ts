import type { Attachment, Message } from "../../../types";

const MESSAGE_DATE_KEYS = [
  "createdAt",
  "updatedAt",
  "serverTs",
  "lastSendAttemptAt",
  "deletedAt",
  "editedAt",
] as const;

const ATTACHMENT_DATE_KEYS = [
  "createdAt",
  "updatedAt",
  "expiresAt",
] as const;

const toSerializableDateValue = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

const normalizeDateFields = <T extends Record<string, unknown>>(
  source: T,
  keys: readonly string[],
): { value: T; changed: boolean } => {
  let next: Record<string, unknown> | null = null;

  for (const key of keys) {
    const current = source[key];
    const normalized = toSerializableDateValue(current);
    if (normalized !== current) {
      next ??= { ...source };
      next[key] = normalized;
    }
  }

  return {
    value: (next ?? source) as T,
    changed: next !== null,
  };
};

const normalizeAttachmentForReduxCache = (attachment: Attachment): Attachment => {
  const normalized = normalizeDateFields(
    attachment as unknown as Record<string, unknown>,
    ATTACHMENT_DATE_KEYS,
  );
  return normalized.changed
    ? (normalized.value as unknown as Attachment)
    : attachment;
};

/**
 * `isEdited` là optional trong payload WebSocket, và tin cũ tải lại từ server có
 * thể chỉ mang `editedAt`. Suy ra cờ từ mốc sửa như BE làm (`Boolean(edited_at)`)
 * để mọi đường vào cache — GET, ack, realtime — đều nhất quán, thay vì để tin đã
 * sửa hiện như tin gốc.
 */
const withDerivedEditedFlag = <T extends Record<string, unknown>>(
  message: T,
): T => {
  if (message.isEdited || !message.editedAt) {
    return message;
  }
  return { ...message, isEdited: true };
};

const normalizeMessageLikeRecord = <T extends Record<string, unknown>>(
  rawMessage: T,
): T => {
  const message = withDerivedEditedFlag(rawMessage);
  const normalizedMessage = normalizeDateFields(
    message,
    MESSAGE_DATE_KEYS,
  );
  let next: Record<string, unknown> | null = normalizedMessage.changed
    ? normalizedMessage.value
    : message !== rawMessage
    ? message
    : null;

  const replyToMessage = message.replyToMessage;
  if (replyToMessage && typeof replyToMessage === "object") {
    const normalizedReply = normalizeMessageLikeRecord(
      replyToMessage as Record<string, unknown>,
    );
    if (normalizedReply !== replyToMessage) {
      next ??= { ...message };
      next.replyToMessage = normalizedReply;
    }
  }

  const { attachments } = message;
  if (Array.isArray(attachments)) {
    let attachmentsChanged = false;
    const normalizedAttachments = attachments.map((attachment) => {
      const normalizedAttachment = normalizeAttachmentForReduxCache(
        attachment as Attachment,
      );
      if (normalizedAttachment !== attachment) {
        attachmentsChanged = true;
      }
      return normalizedAttachment;
    });

    if (attachmentsChanged) {
      next ??= { ...message };
      next.attachments = normalizedAttachments;
    }
  }

  return (next ?? message) as T;
};

export const normalizeMessageForReduxCache = (message: Message): Message => {
  const normalized = normalizeMessageLikeRecord(
    message as unknown as Record<string, unknown>,
  );
  return normalized === (message as unknown)
    ? message
    : (normalized as unknown as Message);
};

export const normalizeMessagesForReduxCache = (
  messages: readonly Message[],
): Message[] => {
  let changed = false;
  const normalized = messages.map((message) => {
    const nextMessage = normalizeMessageForReduxCache(message);
    if (nextMessage !== message) {
      changed = true;
    }
    return nextMessage;
  });

  return changed ? normalized : [...messages];
};
