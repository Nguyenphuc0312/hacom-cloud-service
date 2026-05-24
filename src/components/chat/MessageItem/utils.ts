/**
 * MessageItem Utilities
 * Helper functions for message signature generation, comparison, and resolution
 * These utilities support performance optimization and memoization logic
 */

import type { Message, Attachment } from "../../../types";
import type { ConversationTimelineItem } from "../../../features/chat/hooks/useConversationTimelineRows";

/**
 * Generates a unique signature for attachments to detect layout changes
 * Used in memoization to determine if re-render is necessary
 * @param attachments - Array of attachments
 * @returns String signature of attachments
 */
export const getAttachmentLayoutSignature = (
  attachments?: Attachment[],
): string => {
  if (!attachments || attachments.length === 0) return "";

  return attachments
    .map((attachment) =>
      [
        attachment.id,
        attachment.type,
        attachment.fileName,
        attachment.fileSize,
        attachment.width,
        attachment.height,
        attachment.thumbnailUrl,
      ].join(":"),
    )
    .join("|");
};

/**
 * Generates a unique signature for reply message data
 * Detects when the replied message has changed
 * @param message - Message that contains reply data
 * @returns String signature of reply
 */
export const getReplyLayoutSignature = (message: Message): string => {
  const reply = message.replyToMessage;
  if (!reply) return "";
  const replyAttachments = (
    reply as Message["replyToMessage"] & { attachments?: Attachment[] }
  ).attachments;

  return [
    reply.id,
    reply.type,
    reply.senderName,
    reply.content,
    reply.isDeleted,
    getAttachmentLayoutSignature(replyAttachments),
  ].join(":");
};

/**
 * Generates a unique signature for forwarded message data
 * Detects when forwarded information has changed
 * @param message - Message that contains forwarded data
 * @returns String signature of forwarded
 */
export const getForwardedSignature = (message: Message): string => {
  const forwardedFrom = message.forwardedFrom;
  if (!forwardedFrom) return "";

  return [
    "id" in forwardedFrom ? forwardedFrom.id : "",
    "username" in forwardedFrom ? forwardedFrom.username : "",
  ].join(":");
};

/**
 * Generates comprehensive signature for all layout-sensitive properties of a message
 * Used for deep comparison in memo to avoid unnecessary re-renders
 * @param message - Message to generate signature for
 * @returns String signature representing all layout-sensitive changes
 */
export const getLayoutSensitiveSignature = (message: Message): string =>
  [
    message.type,
    message.senderName,
    message.content,
    message.status,
    message.sendState,
    message.isEdited,
    message.isDeleted,
    message.isPinned,
    getReplyLayoutSignature(message),
    getForwardedSignature(message),
    getAttachmentLayoutSignature(message.attachments),
    (message.reactions ?? [])
      .map((reaction) => `${reaction.emoji}:${reaction.count}`)
      .join("|"),
    (message.readBy ?? []).length,
    (message.mentions ?? []).length,
    (message as { threadCount?: number }).threadCount ?? 0,
  ].join("::");

/**
 * Resolves the actual Message object from timeline item
 * Handles cases where message is passed as prop or embedded in item
 * @param item - Timeline item
 * @param message - Optional message prop (takes precedence)
 * @returns Resolved Message or null
 */
export const resolveLiveMessage = (
  item: ConversationTimelineItem,
  message?: Message,
): Message | null =>
  message ??
  (item.kind === "message" || item.kind === "system" ? item.message : null);
