import type {
  Message,
  MessageSummary,
  Conversation,
  UserSummary,
} from "../types";
import { MessageType, MessageStatus, RoomType } from "../types";
import {
  isDirectConversation,
  normalizeRoomType,
} from "../lib/conversationAdapter";
import { isSameDay } from "./formatTime";
import { rankConversations } from "./conversationRanking";
import i18n from "../i18n";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";

const isDirectType = (conversationType: unknown): boolean => {
  const normalized = normalizeRoomType(conversationType);
  return normalized === RoomType.PRIVATE || normalized === RoomType.DIRECT;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

interface DisplayNameOptions {
  conversationTitle?: string;
  allowTechnicalFallback?: boolean;
}

export type MessagePreviewState =
  | "queued"
  | "sending"
  | "retrying"
  | "failed"
  | null;

/**
 * Check if message is from current user.
 */
export function isOwnMessage(message: Message, currentUserId: string): boolean {
  return message.senderId === currentUserId;
}

/**
 * Check if message should show avatar (grouped-by-sender behavior).
 */
export function shouldShowAvatar(
  messages: Message[],
  index: number,
  conversationType: string,
): boolean {
  if (isDirectType(conversationType)) {
    return false;
  }

  const message = messages[index];
  const nextMessage = messages[index + 1];

  if (!nextMessage) return true;
  if (nextMessage.senderId !== message.senderId) return true;
  if (
    !isSameDay(new Date(nextMessage.createdAt), new Date(message.createdAt))
  ) {
    return true;
  }

  return false;
}

/**
 * Check if date divider should be shown.
 */
export function shouldShowDateDivider(
  messages: Message[],
  index: number,
): boolean {
  if (index === 0) return true;

  const currentDate = new Date(messages[index].createdAt);
  const prevDate = new Date(messages[index - 1].createdAt);

  return !isSameDay(currentDate, prevDate);
}

/**
 * Group messages by date.
 */
export function groupMessagesByDate(
  messages: Message[],
): Map<string, Message[]> {
  const groups = new Map<string, Message[]>();

  messages.forEach((message) => {
    const date = new Date(message.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(message);
  });

  return groups;
}

/**
 * Get message preview for conversation list.
 */
export function getMessagePreview(
  message: Message | MessageSummary | undefined,
  currentUserId: string,
  maxLength: number = 50,
): string {
  if (!message) return "";

  let preview = "";

  switch (message.type) {
    case MessageType.TEXT:
      preview = message.content;
      break;
    case MessageType.IMAGE:
      preview = i18n.t("chat:preview.photo");
      break;
    case MessageType.VIDEO:
      preview = i18n.t("chat:preview.video");
      break;
    case MessageType.FILE:
      preview = i18n.t("chat:preview.file");
      break;
    case MessageType.VOICE:
      preview = i18n.t("chat:preview.voice");
      break;
    case MessageType.LOCATION:
      preview = i18n.t("chat:preview.location");
      break;
    case MessageType.STICKER:
      preview = i18n.t("chat:preview.sticker");
      break;
    case MessageType.SYSTEM:
      return message.content;
    default:
      preview = message.content;
  }

  const previewState = getMessagePreviewState(message, currentUserId);
  const stateLabel =
    previewState === "failed"
      ? i18n.t("chat:message.status.failedInline")
      : previewState === "queued"
        ? i18n.t("chat:message.status.queued")
        : previewState === "retrying"
          ? i18n.t("chat:message.status.retrying")
          : previewState === "sending"
            ? i18n.t("chat:message.status.sending")
            : "";
  const fullPreview =
    stateLabel && preview ? `${stateLabel}: ${preview}` : stateLabel || preview;
  return fullPreview.length > maxLength
    ? `${fullPreview.substring(0, maxLength - 3)}...`
    : fullPreview;
}

export function getMessagePreviewState(
  message: Message | MessageSummary | undefined,
  currentUserId: string,
): MessagePreviewState {
  if (!message || message.senderId !== currentUserId) {
    return null;
  }

  const record = asRecord(message);
  const sendState =
    typeof record?.sendState === "string" ? record.sendState : undefined;
  const status = typeof record?.status === "string" ? record.status : undefined;

  if (sendState === "failed" || status === MessageStatus.FAILED) {
    return "failed";
  }
  if (sendState === "queued") {
    return "queued";
  }
  if (sendState === "retrying") {
    return "retrying";
  }
  if (sendState === "sending" || status === MessageStatus.SENDING) {
    return "sending";
  }

  return null;
}

/**
 * Get message status icon string.
 */
export function getMessageStatusIcon(status: MessageStatus): string {
  switch (status) {
    case MessageStatus.SENDING:
      return "sending";
    case MessageStatus.SENT:
      return "sent";
    case MessageStatus.DELIVERED:
      return "delivered";
    case MessageStatus.READ:
      return "read";
    case MessageStatus.FAILED:
      return "failed";
    default:
      return "";
  }
}

export function getUserDisplayName(
  user: Partial<UserSummary> | null | undefined,
  options: DisplayNameOptions = {},
): string {
  if (!user) {
    return "";
  }

  const userRecord = asRecord(user);
  const primaryName = resolveUserDisplayName(
    {
      ...(userRecord || {}),
      displayName: user.displayName,
      username: user.username,
      id: user.id,
    },
    {
      allowLegacyFallback: false,
    },
  );
  const conversationTitle = asTrimmedString(options.conversationTitle);

  if (primaryName) {
    return primaryName;
  }

  if (conversationTitle) {
    return conversationTitle;
  }

  if (options.allowTechnicalFallback === false) {
    return "";
  }

  return resolveUserDisplayName(
    {
      ...(userRecord || {}),
      displayName: user.displayName,
      username: user.username,
      id: user.id,
    },
    {
      allowLegacyFallback: true,
    },
  );
}

/**
 * Get conversation display name.
 */
export function getConversationDisplayName(
  conversation: Conversation,
  currentUserId: string,
): string {
  const conversationName = asTrimmedString(conversation.name);
  const conversationDisplayName = asTrimmedString(conversation.displayName);
  const conversationTitle = conversationName || conversationDisplayName;

  if (!isDirectConversation(conversation)) {
    if (conversationTitle) {
      return conversationTitle;
    }

    const participantFallback = (conversation.participants || [])
      .map((participant) =>
        getUserDisplayName(participant, {
          allowTechnicalFallback: false,
        }),
      )
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");

    return participantFallback || i18n.t("common:labels.group");
  }

  const otherParticipant = getOtherParticipant(conversation, currentUserId);
  const participantDisplayName = getUserDisplayName(otherParticipant, {
    conversationTitle,
    allowTechnicalFallback: false,
  });

  if (participantDisplayName) {
    return participantDisplayName;
  }

  if (conversationTitle) {
    return conversationTitle;
  }

  const technicalFallbackName = getUserDisplayName(otherParticipant, {
    allowTechnicalFallback: true,
  });

  return technicalFallbackName || i18n.t("common:labels.conversation");
}

/**
 * Get conversation avatar.
 */
export function getConversationAvatar(
  conversation: Conversation,
  currentUserId: string,
): string | undefined {
  const displayAvatar =
    typeof conversation.displayAvatar === "string"
      ? conversation.displayAvatar
      : undefined;

  if (displayAvatar) {
    return displayAvatar;
  }

  if (!isDirectConversation(conversation)) {
    return conversation.avatar ?? undefined;
  }

  const otherParticipant = getOtherParticipant(conversation, currentUserId);

  return otherParticipant?.avatar || conversation.avatar || undefined;
}

/**
 * Get other participant in private conversation.
 */
export function getOtherParticipant(
  conversation: Conversation,
  currentUserId: string,
): UserSummary | undefined {
  if (!isDirectConversation(conversation)) {
    return undefined;
  }

  if (conversation.otherUser) {
    return conversation.otherUser;
  }

  return (conversation.participants || []).find(
    (participant) => participant.id !== currentUserId,
  );
}

/**
 * Sort conversations with product ranking signals (pin, unread, mention, recency).
 */
export function sortConversations(
  conversations?: Conversation[] | null,
  options?: {
    currentUserId?: string;
    currentUsername?: string;
    currentDisplayName?: string;
    activeConversationId?: string | null;
  },
): Conversation[] {
  return rankConversations(conversations, options);
}

/**
 * Filter conversations by search query.
 */
export function filterConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  if (!query.trim()) return conversations;

  const lowerQuery = query.toLowerCase();

  return conversations.filter((conversation) => {
    const nameMatch = (conversation.name || "")
      .toLowerCase()
      .includes(lowerQuery);
    const participantMatch = (conversation.participants || []).some(
      (participant) =>
        participant.displayName?.toLowerCase().includes(lowerQuery) ||
        participant.username.toLowerCase().includes(lowerQuery),
    );

    return nameMatch || participantMatch;
  });
}

/**
 * Check if message contains only emojis.
 */
export function isOnlyEmoji(text: string): boolean {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text.trim()) && text.trim().length <= 12;
}

/**
 * Parse message content for links.
 */
export function parseLinks(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary-hover hover:underline">$1</a>',
  );
}

/**
 * Get unread count display.
 */
export function getUnreadDisplay(count: number): string {
  if (count === 0) return "";
  if (count > 99) return "99+";
  return count.toString();
}
