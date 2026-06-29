import type { Message } from "../types";
import { MessageStatus, MessageType } from "../types";

export type MessageSemanticFamily =
  | "system"
  | "text"
  | "media"
  | "file"
  | "voice"
  | "contact"
  | "rich";

export const getMessageStableKey = (message: Message): string =>
  message.stableId || message.clientMessageId || message.localId || message.id;

// A system message that carries a poll activity event ("X joined/changed the
// poll… Xem"). Consecutive ones are collapsed in the timeline planner so only
// the newest pill shows by default — see timelinePlanner / SystemMessage.
export const isPollEventSystemMessage = (message: Message): boolean => {
  if (message.type !== "system") return false;
  const meta =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null;
  const ev = meta?.pollEvent;
  if (!ev || typeof ev !== "object") return false;
  const kind = (ev as Record<string, unknown>).kind;
  return (
    kind === "created" ||
    kind === "voted" ||
    kind === "changed" ||
    kind === "closed"
  );
};

export const getMessageSemanticFamily = (
  message: Message,
): MessageSemanticFamily => {
  switch (message.type) {
    case MessageType.IMAGE:
      return "media";
    case MessageType.FILE:
      return "file";
    case MessageType.VOICE:
      return "voice";
    case MessageType.CONTACT:
      return "contact";
    case MessageType.SYSTEM:
      return "system";
    case MessageType.TEXT:
    default:
      return "text";
  }
};

export const hasMessageLayoutDecorator = (message: Message): boolean =>
  Boolean(
    message.replyToMessage ||
      message.forwardedFrom ||
      message.isEdited ||
      message.isDeleted ||
      (message.attachments?.length ?? 0) > 1,
  );

export const isPendingMessage = (message: Message): boolean =>
  message.status === "uploading" ||
  message.sendState === "queued" ||
  message.sendState === "sending" ||
  message.sendState === "retrying" ||
  (!message.sendState && message.status === MessageStatus.SENDING);

export const isFailedMessage = (message: Message): boolean => {
  if (message.isDeleted) return false;
  if (message.lifecycleStatus === "recalled") return false;
  if (message.lifecycleStatus === "deleted_admin") return false;
  return message.sendState === "failed" || message.status === MessageStatus.FAILED;
};

export const createReplySnapshot = (
  message?: Message,
): Message | undefined => {
  if (!message) return undefined;

  return {
    ...message,
    attachments: message.attachments ? [...message.attachments] : [],
    reactions: message.reactions ? [...message.reactions] : [],
    readBy: message.readBy ? [...message.readBy] : [],
    mentions: message.mentions ? [...message.mentions] : [],
  };
};
