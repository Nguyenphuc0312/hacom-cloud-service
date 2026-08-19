import type {
  Message,
  MessageSummary,
  Conversation,
  UserSummary,
} from "../types";


import { MessageType, MessageStatus } from "../types";
import { isDirectConversation } from "../lib/conversationAdapter";
import i18n from "../i18n";
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import { getPreviewFromMessage } from "./messageContent.utils";
import { asRecord } from "./payloadGuards";
import { aliasByUserId, applyMentionAliases } from "./mentionAliasText";


const asTrimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

interface DisplayNameOptions {
  conversationTitle?: string;
  allowTechnicalFallback?: boolean;
}

const GROUP_NAME_FALLBACK_MEMBER_COUNT = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tin nhắn media không có caption thường mang `content` = tên file thô do backend
// set — có thể là UUID ("52377552-0C41-47FE-....jpg") hoặc tên mặc định khi paste
// ảnh từ clipboard ("image.png"). Đó không phải caption người dùng nhập, nên không
// được hiển thị trong preview sidebar/notification lẫn caption dưới ảnh.
const MEDIA_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,5})?$/i;

// Tên mặc định trình duyệt sinh ra khi paste/kéo-thả ảnh không có tên thật.
const GENERIC_MEDIA_FILENAME_RE =
  /^(image|photo|picture|screenshot|video|clip|audio|voice|file|document|untitled)[-_ ]?\d*\.[a-z0-9]{1,5}$/i;

// content = đúng tên một attachment của message ⇒ chắc chắn là tên file, không caption.
const matchesAttachmentFileName = (
  message: Message | MessageSummary,
  content: string,
): boolean => {
  const attachments = (message as { attachments?: Array<{ fileName?: string }> })
    .attachments;
  if (!Array.isArray(attachments)) return false;
  return attachments.some(
    (att) => asTrimmedString(att?.fileName).toLowerCase() === content.toLowerCase(),
  );
};

export const looksLikeRawFileName = (value: string): boolean => {
  const trimmed = value.trim();
  return MEDIA_FILENAME_RE.test(trimmed) || GENERIC_MEDIA_FILENAME_RE.test(trimmed);
};

// content chỉ được coi là caption thật khi có, không trùng tên attachment và không
// phải tên file thô/generic.
const mediaCaption = (message: Message | MessageSummary): string => {
  const trimmed = message.content?.trim() ?? "";
  if (!trimmed) return "";
  if (matchesAttachmentFileName(message, trimmed)) return "";
  if (looksLikeRawFileName(trimmed)) return "";
  return trimmed;
};

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
 * Get message preview for conversation list.
 */
export function getMessagePreview(
  message: Message | MessageSummary | undefined,
  currentUserId: string,
  maxLength: number = 50,
): string {
  if (!message) return "";

  if (message.isDeleted || message.lifecycleStatus === "recalled") {
    return i18n.t("chat:message.recalled", {
      defaultValue: "Tin nhắn đã được thu hồi",
    });
  }
  if (message.lifecycleStatus === "deleted_admin") {
    return i18n.t("chat:message.deletedByAdmin", {
      defaultValue: "Tin nhắn đã bị xóa bởi quản trị viên",
    });
  }

  let preview = "";

  switch (message.type) {
    case MessageType.TEXT: {
      preview = getPreviewFromMessage({
        contentFormat: (message as Message).contentFormat,
        plainText: (message as Message).plainText,
        content: message.content,
      });
      break;
    }
    case MessageType.IMAGE:
      preview = mediaCaption(message) || i18n.t("chat:preview.photo");
      break;
    case MessageType.VIDEO:
      preview = mediaCaption(message) || i18n.t("chat:preview.video");
      break;
    case MessageType.FILE:
      preview = mediaCaption(message) || i18n.t("chat:preview.file");
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
    case MessageType.CONTACT: {
      const meta = (message as Message).metadata as Record<string, unknown> | undefined;
      const att = (meta?.attachment ?? meta?.contact) as Record<string, unknown> | undefined;
      const name = typeof att?.displayName === "string" && att.displayName.trim()
        ? att.displayName.trim()
        : "";
      const label = i18n.t("chat:preview.contact", { defaultValue: "[Danh thiếp]" });
      preview = name ? `${label} ${name}` : label;
      break;
    }
    case MessageType.SYSTEM:
      return message.content;
    default:
      preview = message.content;
  }

  // Tag `@` trong preview phải hiện "tên gợi nhớ" giống hệt trong bong bóng chat.
  // Thay TRƯỚC khi cắt độ dài, không thì tag cuối bị cắt mất một nửa rồi mới thay.
  // `MessageSummary` (lastMessage của sidebar) không khai báo `mentions`, nên đọc
  // optional: thiếu thì giữ nguyên tên thật, không đoán.
  preview = applyMentionAliases(
    preview,
    (message as Partial<Message>).mentions,
    aliasByUserId(),
  );

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

  if (message.isDeleted || message.lifecycleStatus === "recalled" || message.lifecycleStatus === "deleted_admin") {
    return null;
  }

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

  if (conversationTitle && !EMAIL_RE.test(conversationTitle)) {
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
