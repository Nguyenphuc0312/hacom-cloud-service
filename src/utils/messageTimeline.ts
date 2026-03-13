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
  message.status === MessageStatus.SENDING || message.status === "uploading";

export const isFailedMessage = (message: Message): boolean =>
  message.status === MessageStatus.FAILED;

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
