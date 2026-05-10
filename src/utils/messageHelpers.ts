import type {
  Message,
  MessageSummary,
  Conversation,
  UserSummary,
} from "../types";

const stripMarkdownForPreview = (text: string): string =>
  text
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/\*([\s\S]*?)\*/g, '$1')
    .replace(/~~([\s\S]*?)~~/g, '$1')
    .replace(/__([\s\S]*?)__/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
import { MessageType, MessageStatus, RoomType } from "../types";
import {
  isDirectConversation,
  normalizeRoomType,
} from "../lib/conversationAdapter";
import { isSameDay } from "./formatTime";
import { sortConversationsByActivity } from "./conversationRanking";
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

const GROUP_NAME_FALLBACK_MEMBER_COUNT = 2;

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
    case MessageType.TEXT: {
      const rawContent = (message as Message).plainText ?? message.content;
      preview = (message as Message).contentFormat === 'markdown'
        ? stripMarkdownForPreview(rawContent)
        : rawContent;
      break;
    }
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

const collectRepresentativeGroupParticipants = (
  conversation: Conversation,
  currentUserId: string,
): UserSummary[] => {
  const participants = Array.isArray(conversation.participants)
    ? conversation.participants
    : [];
  const seen = new Set<string>();
  const ranked = participants
    .filter((participant): participant is UserSummary => {
      if (!participant?.id || seen.has(participant.id)) {
        return false;
      }
      seen.add(participant.id);
      return true;
    })
    .map((participant, index) => {
      const displayName = getUserDisplayName(participant, {
        allowTechnicalFallback: false,
      });
      const isCurrentUser = participant.id === currentUserId;
      const hasAvatar =
        typeof participant.avatar === "string" && participant.avatar.trim().length > 0;

      return {
        participant,
        index,
        score:
          (isCurrentUser ? 0 : 8) +
          (hasAvatar ? 4 : 0) +
          (displayName ? 2 : 0) +
          (participant.username ? 1 : 0),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.participant);

  const nonCurrent = ranked.filter((participant) => participant.id !== currentUserId);
  return nonCurrent.length > 0 ? nonCurrent : ranked;
};

export function getRepresentativeGroupParticipants(
  conversation: Conversation,
  currentUserId: string,
  maxParticipants: number = 4,
): UserSummary[] {
  const representatives = collectRepresentativeGroupParticipants(
    conversation,
    currentUserId,
  );

  if (!Number.isFinite(maxParticipants) || maxParticipants <= 0) {
    return representatives;
  }

  return representatives.slice(0, Math.floor(maxParticipants));
}

export function truncateTextWithEllipsis(
  text: string,
  maxLength: number,
): string {
  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }

  return `${text.slice(0, maxLength - 3)}...`;
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

    const representativeParticipants = collectRepresentativeGroupParticipants(
      conversation,
      currentUserId,
    );
    const visibleNames = representativeParticipants
      .map((participant) =>
        getUserDisplayName(participant, {
          allowTechnicalFallback: false,
        }),
      )
      .filter(Boolean);
    const shownNames = visibleNames.slice(0, GROUP_NAME_FALLBACK_MEMBER_COUNT);
    const includesCurrentUser = (conversation.participants || []).some(
      (participant) => participant.id === currentUserId,
    );
    const expectedOtherCount =
      typeof conversation.participantCount === "number"
        ? Math.max(0, conversation.participantCount - (includesCurrentUser ? 1 : 0))
        : 0;
    const totalFallbackMembers = Math.max(
      visibleNames.length,
      expectedOtherCount,
    );
    const remainingMembers = Math.max(0, totalFallbackMembers - shownNames.length);

    if (shownNames.length === 0) {
      return i18n.t("common:labels.group");
    }

    if (remainingMembers > 0) {
      return `${shownNames.join(", ")} +${remainingMembers}`;
    }

    return shownNames.join(", ");
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
  void options;
  return sortConversationsByActivity(conversations);
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
 * Get unread count display.
 */
export function getUnreadDisplay(count: number): string {
  if (count === 0) return "";
  if (count > 99) return "99+";
  return count.toString();
}
