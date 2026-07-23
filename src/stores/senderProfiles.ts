/**
 * Chuẩn hoá hồ sơ người gửi và áp vào tin nhắn / hội thoại.
 *
 * Tách khỏi `chatStore.ts`: logic thuần, không đụng store. BE gửi kèm
 * `senderProfiles` để FE hiển thị tên và avatar mới nhất mà không phải gọi thêm
 * API cho từng người.
 *
 * Bất biến xuyên suốt: **giữ nguyên tham chiếu khi không có gì đổi**. Các hàm
 * này chạy trên cả trang tin nhắn mỗi lần có payload mới, tạo object mới vô cớ
 * sẽ khiến toàn bộ timeline re-render.
 */
import { resolveUserDisplayName } from "../features/chat/identity/resolveUserDisplayName";
import type { Conversation, Message } from "../types";
import { asRecord, asStringValue } from "../utils/payloadGuards";

export type SenderProfileSummary = {
  id: string;
  username: string;
  displayName: string;
  avatar?: string | null;
  status?: string | null;
};

/** Chuỗi rỗng / toàn khoảng trắng không được coi là giá trị hợp lệ để ghi đè. */
const hasContent = (value: string | null | undefined): value is string =>
  Boolean(value && value.trim().length > 0);

export const normalizeSenderProfileSummary = (
  value: unknown,
  fallbackUserId?: string,
): SenderProfileSummary | null => {
  const source = asRecord(value);
  if (!source) {
    return null;
  }

  const id =
    asStringValue(source.id) ??
    asStringValue(source.userId) ??
    asStringValue(source.user_id) ??
    fallbackUserId;
  if (!id) {
    return null;
  }

  const username =
    asStringValue(source.username) ??
    asStringValue(source.employeeCode) ??
    asStringValue(source.employee_code) ??
    id;
  const displayName =
    resolveUserDisplayName(
      {
        ...source,
        id,
        username,
      },
      { allowLegacyFallback: false },
    ) ?? username;

  return {
    id,
    username,
    displayName,
    avatar: asStringValue(source.avatar) ?? null,
    status: asStringValue(source.status) ?? null,
  };
};

/** Khoá kết quả theo id đã chuẩn hoá, không theo khoá gốc của payload. */
export const normalizeSenderProfiles = (
  value: unknown,
): Record<string, SenderProfileSummary> => {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  return Object.entries(source).reduce<Record<string, SenderProfileSummary>>(
    (accumulator, [userId, rawProfile]) => {
      const normalized = normalizeSenderProfileSummary(rawProfile, userId);
      if (!normalized) {
        return accumulator;
      }

      accumulator[normalized.id] = normalized;
      return accumulator;
    },
    {},
  );
};

export const applySenderProfilesToMessage = (
  message: Message,
  senderProfiles: Record<string, SenderProfileSummary>,
): Message => {
  if (!message || Object.keys(senderProfiles).length === 0) {
    return message;
  }

  const senderProfile = senderProfiles[message.senderId];
  const replySenderProfile = message.replyToMessage
    ? senderProfiles[message.replyToMessage.senderId]
    : undefined;
  const nextSenderName = senderProfile?.displayName ?? message.senderName;
  const nextSenderAvatar = hasContent(senderProfile?.avatar)
    ? senderProfile.avatar
    : message.senderAvatar;
  const nextReplySenderName =
    replySenderProfile?.displayName ?? message.replyToMessage?.senderName;
  const nextReplySenderAvatar = hasContent(replySenderProfile?.avatar)
    ? replySenderProfile.avatar
    : message.replyToMessage?.senderAvatar;

  const senderUnchanged =
    nextSenderName === message.senderName &&
    nextSenderAvatar === message.senderAvatar;
  const replyUnchanged =
    !message.replyToMessage ||
    (nextReplySenderName === message.replyToMessage.senderName &&
      nextReplySenderAvatar === message.replyToMessage.senderAvatar);

  if (senderUnchanged && replyUnchanged) {
    return message;
  }

  return {
    ...message,
    senderName: nextSenderName,
    senderAvatar: nextSenderAvatar,
    ...(message.replyToMessage
      ? {
          replyToMessage: {
            ...message.replyToMessage,
            senderName:
              nextReplySenderName ?? message.replyToMessage.senderName,
            senderAvatar: nextReplySenderAvatar,
          },
        }
      : {}),
  };
};

export const applySenderProfilesToMessages = (
  messages: Message[],
  senderProfiles: Record<string, SenderProfileSummary>,
): Message[] => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages;
  }

  let changed = false;
  const nextMessages = messages.map((message) => {
    const nextMessage = applySenderProfilesToMessage(message, senderProfiles);
    if (nextMessage !== message) {
      changed = true;
    }
    return nextMessage;
  });

  return changed ? nextMessages : messages;
};

export const applySenderProfilesToConversation = (
  conversation: Conversation,
  senderProfiles: Record<string, SenderProfileSummary>,
): Conversation => {
  if (!conversation || Object.keys(senderProfiles).length === 0) {
    return conversation;
  }

  let changed = false;

  const nextParticipants = Array.isArray(conversation.participants)
    ? conversation.participants.map((participant) => {
        const senderProfile = senderProfiles[participant.id];
        if (!senderProfile) {
          return participant;
        }

        const nextDisplayName =
          senderProfile.displayName || participant.displayName;
        const nextAvatar = hasContent(senderProfile.avatar)
          ? senderProfile.avatar
          : participant.avatar;
        const nextStatus = hasContent(senderProfile.status)
          ? senderProfile.status
          : participant.status;
        const nextUsername = senderProfile.username || participant.username;

        if (
          nextDisplayName === participant.displayName &&
          nextAvatar === participant.avatar &&
          nextStatus === participant.status &&
          nextUsername === participant.username
        ) {
          return participant;
        }

        changed = true;
        return {
          ...participant,
          displayName: nextDisplayName,
          avatar: nextAvatar,
          status: nextStatus as typeof participant.status,
          username: nextUsername,
        };
      })
    : conversation.participants;

  const otherUserProfile =
    conversation.otherUser?.id && senderProfiles[conversation.otherUser.id]
      ? senderProfiles[conversation.otherUser.id]
      : null;
  const nextOtherUser =
    otherUserProfile && conversation.otherUser
      ? {
          ...conversation.otherUser,
          displayName:
            otherUserProfile.displayName || conversation.otherUser.displayName,
          avatar: hasContent(otherUserProfile.avatar)
            ? otherUserProfile.avatar
            : conversation.otherUser.avatar,
          status: (hasContent(otherUserProfile.status)
            ? otherUserProfile.status
            : conversation.otherUser
                .status) as typeof conversation.otherUser.status,
          username:
            otherUserProfile.username || conversation.otherUser.username,
        }
      : conversation.otherUser;

  if (nextOtherUser !== conversation.otherUser) {
    changed = true;
  }

  const lastMessageProfile =
    conversation.lastMessage?.senderId &&
    senderProfiles[conversation.lastMessage.senderId]
      ? senderProfiles[conversation.lastMessage.senderId]
      : null;
  const nextLastMessage =
    lastMessageProfile && conversation.lastMessage
      ? {
          ...conversation.lastMessage,
          senderName:
            lastMessageProfile.displayName ||
            conversation.lastMessage.senderName,
        }
      : conversation.lastMessage;

  if (nextLastMessage !== conversation.lastMessage) {
    changed = true;
  }

  // Hội thoại 1-1 hiển thị theo người còn lại, nên tên/avatar phải bám theo họ.
  const isDirect =
    conversation.type === "direct" || conversation.type === "private";
  const nextDisplayName = isDirect
    ? (nextOtherUser?.displayName ?? conversation.displayName)
    : conversation.displayName;
  const nextDisplayAvatar = isDirect
    ? (nextOtherUser?.avatar ?? conversation.displayAvatar)
    : conversation.displayAvatar;

  if (
    nextDisplayName !== conversation.displayName ||
    nextDisplayAvatar !== conversation.displayAvatar
  ) {
    changed = true;
  }

  if (!changed) {
    return conversation;
  }

  return {
    ...conversation,
    ...(nextParticipants ? { participants: nextParticipants } : {}),
    ...(nextOtherUser ? { otherUser: nextOtherUser } : {}),
    ...(nextLastMessage ? { lastMessage: nextLastMessage } : {}),
    ...(nextDisplayName ? { displayName: nextDisplayName } : {}),
    ...(nextDisplayAvatar !== undefined
      ? { displayAvatar: nextDisplayAvatar ?? null }
      : {}),
  };
};
