import type {
  Message,
  MessageSummary,
  Conversation,
  UserSummary,
} from "../types";
import { MessageType, MessageStatus } from "../types";
import { isSameDay } from "./formatTime";

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
  if (conversationType === "private" || conversationType === "direct") {
    return false;
  }

  const message = messages[index];
  const nextMessage = messages[index + 1];

  if (!nextMessage) return true;
  if (nextMessage.senderId !== message.senderId) return true;
  if (!isSameDay(new Date(nextMessage.createdAt), new Date(message.createdAt))) {
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

  const prefix = message.senderId === currentUserId ? "You: " : "";
  let preview = "";

  switch (message.type) {
    case MessageType.TEXT:
      preview = message.content;
      break;
    case MessageType.IMAGE:
      preview = "Photo";
      break;
    case MessageType.VIDEO:
      preview = "Video";
      break;
    case MessageType.FILE:
      preview = "File";
      break;
    case MessageType.VOICE:
      preview = "Voice message";
      break;
    case MessageType.LOCATION:
      preview = "Location";
      break;
    case MessageType.STICKER:
      preview = "Sticker";
      break;
    case MessageType.SYSTEM:
      return message.content;
    default:
      preview = message.content;
  }

  const fullPreview = prefix + preview;
  return fullPreview.length > maxLength
    ? `${fullPreview.substring(0, maxLength - 3)}...`
    : fullPreview;
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

/**
 * Get conversation display name.
 */
export function getConversationDisplayName(
  conversation: Conversation,
  currentUserId: string,
): string {
  if (conversation.type !== "private" && conversation.type !== "direct") {
    return conversation.name || "Conversation";
  }

  const otherParticipant = (conversation.participants || []).find(
    (participant) => participant.id !== currentUserId,
  );

  return (
    otherParticipant?.displayName ||
    otherParticipant?.username ||
    conversation.name ||
    "Conversation"
  );
}

/**
 * Get conversation avatar.
 */
export function getConversationAvatar(
  conversation: Conversation,
  currentUserId: string,
): string | undefined {
  if (conversation.type !== "private" && conversation.type !== "direct") {
    return conversation.avatar;
  }

  const otherParticipant = (conversation.participants || []).find(
    (participant) => participant.id !== currentUserId,
  );

  return otherParticipant?.avatar || conversation.avatar;
}

/**
 * Get other participant in private conversation.
 */
export function getOtherParticipant(
  conversation: Conversation,
  currentUserId: string,
): UserSummary | undefined {
  if (conversation.type !== "private" && conversation.type !== "direct") {
    return undefined;
  }

  return (conversation.participants || []).find(
    (participant) => participant.id !== currentUserId,
  );
}

/**
 * Sort conversations (pinned first, then updatedAt).
 */
export function sortConversations(
  conversations?: Conversation[] | null,
): Conversation[] {
  if (!Array.isArray(conversations)) return [];

  return [...conversations].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
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
    const nameMatch = (conversation.name || "").toLowerCase().includes(lowerQuery);
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
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>',
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
