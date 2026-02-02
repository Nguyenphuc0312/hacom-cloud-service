import type { Message, Conversation, User } from "../types";
import { isSameDay } from "./formatTime";

/**
 * Check if message is from current user
 */
export function isOwnMessage(message: Message, currentUserId: string): boolean {
  return message.senderId === currentUserId;
}

/**
 * Check if message should show avatar (first message from sender in a group)
 */
export function shouldShowAvatar(
  messages: Message[],
  index: number,
  conversationType: string,
): boolean {
  if (conversationType === "private") return false;

  const message = messages[index];
  const prevMessage = messages[index - 1];

  if (!prevMessage) return true;
  if (prevMessage.senderId !== message.senderId) return true;
  if (!isSameDay(new Date(prevMessage.createdAt), new Date(message.createdAt)))
    return true;

  return false;
}

/**
 * Check if date divider should be shown
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
 * Group messages by date
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
 * Get message preview for conversation list
 */
export function getMessagePreview(
  message: Message | undefined,
  currentUserId: string,
  maxLength: number = 50,
): string {
  if (!message) return "";

  const prefix = message.senderId === currentUserId ? "Bạn: " : "";
  let preview = "";

  switch (message.type) {
    case "text":
      preview = message.content;
      break;
    case "image":
      preview = "📷 Ảnh";
      break;
    case "video":
      preview = "🎬 Video";
      break;
    case "file":
      preview = `📄 ${message.attachments?.[0]?.fileName || "Tệp"}`;
      break;
    case "voice":
      preview = "🎤 Tin nhắn thoại";
      break;
    case "location":
      preview = "📍 Vị trí";
      break;
    case "sticker":
      preview = "🎨 Nhãn dán";
      break;
    case "system":
      return message.content; // No prefix for system messages
    default:
      preview = message.content;
  }

  const fullPreview = prefix + preview;
  return fullPreview.length > maxLength
    ? fullPreview.substring(0, maxLength - 3) + "..."
    : fullPreview;
}

/**
 * Get message status icon
 */
export function getMessageStatusIcon(status: Message["status"]): string {
  switch (status) {
    case "sending":
      return "🕐";
    case "sent":
      return "✓";
    case "delivered":
      return "✓✓";
    case "read":
      return "✓✓"; // Blue colored in UI
    case "failed":
      return "❌";
    default:
      return "";
  }
}

/**
 * Get conversation display name
 */
export function getConversationDisplayName(
  conversation: Conversation,
  currentUserId: string,
): string {
  if (conversation.type !== "private") {
    return conversation.name;
  }

  // For private chats, show the other person's name
  const otherParticipant = conversation.participants.find(
    (p) => p.id !== currentUserId,
  );

  return otherParticipant
    ? `${otherParticipant.firstName}${otherParticipant.lastName ? " " + otherParticipant.lastName : ""}`
    : conversation.name;
}

/**
 * Get conversation avatar
 */
export function getConversationAvatar(
  conversation: Conversation,
  currentUserId: string,
): string | undefined {
  if (conversation.type !== "private") {
    return conversation.avatar;
  }

  const otherParticipant = conversation.participants.find(
    (p) => p.id !== currentUserId,
  );

  return otherParticipant?.avatar || conversation.avatar;
}

/**
 * Get other participant in private conversation
 */
export function getOtherParticipant(
  conversation: Conversation,
  currentUserId: string,
): User | undefined {
  if (conversation.type !== "private") return undefined;
  return conversation.participants.find((p) => p.id !== currentUserId);
}

/**
 * Sort conversations (pinned first, then by updatedAt)
 */
export function sortConversations(
  conversations: Conversation[],
): Conversation[] {
  return [...conversations].sort((a, b) => {
    // Pinned first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // Then by updatedAt
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/**
 * Filter conversations by search query
 */
export function filterConversations(
  conversations: Conversation[],
  query: string,
): Conversation[] {
  if (!query.trim()) return conversations;

  const lowerQuery = query.toLowerCase();

  return conversations.filter((conv) => {
    const nameMatch = conv.name.toLowerCase().includes(lowerQuery);
    const participantMatch = conv.participants.some(
      (p) =>
        p.firstName.toLowerCase().includes(lowerQuery) ||
        p.lastName?.toLowerCase().includes(lowerQuery) ||
        p.username.toLowerCase().includes(lowerQuery),
    );

    return nameMatch || participantMatch;
  });
}

/**
 * Check if message contains only emojis
 */
export function isOnlyEmoji(text: string): boolean {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text.trim()) && text.trim().length <= 12;
}

/**
 * Parse message content for links
 */
export function parseLinks(text: string): string {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(
    urlRegex,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">$1</a>',
  );
}

/**
 * Get unread count display
 */
export function getUnreadDisplay(count: number): string {
  if (count === 0) return "";
  if (count > 99) return "99+";
  return count.toString();
}
