import {
  FileType,
  MessageStatus,
  MessageType,
  type Attachment,
  type Message,
  type UserSummary,
} from "../../../types";
import { CLOUD_CONVERSATION_ID } from "../constants";
import type { CloudItem } from "../types";

const resolveMessageStatus = (item: CloudItem): Message["status"] => {
  switch (item.status) {
    case "failed":
      return MessageStatus.FAILED;
    case "pending":
    case "processing":
      return "uploading";
    default:
      return MessageStatus.SENT;
  }
};

const createAttachment = (item: CloudItem, fallbackName: string): Attachment => ({
  id: item.id,
  objectKey: `cloud:${item.id}`,
  type: FileType.DOCUMENT,
  fileName: item.title?.trim() || fallbackName,
  fileSize: item.sizeBytes,
  // Phase 1 does not expose a download/thumbnail URL. Keep the native chat
  // file card without triggering Chat's private attachment-preview endpoint.
  mimeType: "application/octet-stream",
});

export const cloudItemToMessage = (
  item: CloudItem,
  currentUser: UserSummary,
  fallbacks: {
    link: string;
    file: string;
  },
): Message => {
  const createdAt = new Date(item.createdAt);
  const safeCreatedAt = Number.isNaN(createdAt.getTime())
    ? new Date()
    : createdAt;
  const isFile = !["text", "link"].includes(item.type);
  const linkTitle = item.title?.trim();
  const linkUrl = item.url?.trim() ?? "";
  const content =
    item.type === "text"
      ? item.content?.trim() ?? ""
      : item.type === "link"
        ? linkUrl || linkTitle || fallbacks.link
        : "";

  return {
    id: item.id,
    conversationId: CLOUD_CONVERSATION_ID,
    senderId: currentUser.id,
    senderName:
      currentUser.displayName?.trim() ||
      currentUser.username?.trim() ||
      "Hacom",
    senderAvatar: currentUser.avatar || undefined,
    content,
    plainText: content,
    contentFormat: "plain_text",
    type: isFile ? MessageType.FILE : MessageType.TEXT,
    metadata:
      item.type === "link" && linkUrl
        ? {
            linkPreview: {
              url: linkUrl,
              title: linkTitle || undefined,
            },
          }
        : undefined,
    attachments: isFile
      ? [createAttachment(item, item.title?.trim() || fallbacks.file)]
      : undefined,
    status: resolveMessageStatus(item),
    isEdited: false,
    isPinned: false,
    isDeleted: false,
    lifecycleStatus: "active",
    isSystem: false,
    reactions: [],
    createdAt: safeCreatedAt,
    serverTs: safeCreatedAt,
    updatedAt: new Date(item.updatedAt || item.createdAt),
    readBy: [currentUser.id],
  };
};

export const cloudItemsToMessages = (
  items: CloudItem[],
  currentUser: UserSummary,
  fallbacks: {
    link: string;
    file: string;
  },
): Message[] =>
  [...items]
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    )
    .map((item) => cloudItemToMessage(item, currentUser, fallbacks));
