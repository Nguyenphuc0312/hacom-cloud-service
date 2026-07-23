/**
 * Phân loại tin theo mức độ "đã chốt", và cắt tỉa lịch sử của hội thoại không
 * hoạt động để giữ bộ nhớ.
 *
 * Tách khỏi `chatStore.ts`: logic thuần, không đụng store.
 *
 * Bất biến sống còn: **không bao giờ cắt tin đang gửi dở**. Cắt nhầm một tin
 * `sending`/`failed` là người dùng mất luôn nội dung họ vừa soạn, không cách
 * nào lấy lại.
 */
import { isTempMessageId } from "../features/chat/domain/messageIdentityMatching";
import { MessageStatus } from "../types";
import type { Message } from "../types";
import { getStableMessageId } from "./messageAliasIndex";
import { sortMessages } from "./messageOrdering";

/** Số tin giữ lại cho mỗi hội thoại đang không mở. */
export const MAX_INACTIVE_CONVERSATION_MESSAGES = 120;

export interface ConversationMessageWindow {
  oldestLoadedMessageId: string | null;
  oldestLoadedAt: string | null;
  oldestLoadedSeq?: number;
  newestLoadedMessageId: string | null;
  newestLoadedAt: string | null;
  newestLoadedSeq?: number;
}

/**
 * Tin đã được server chốt hay chưa. Dùng để tính "đã tải tới đâu" — tin
 * optimistic chưa có chỗ đứng thật trong lịch sử nên không được tính.
 */
export const isCanonicalConversationMessage = (
  message: Message | null | undefined,
): boolean => {
  if (!message) return false;

  if (
    message.sendState === "queued" ||
    message.sendState === "sending" ||
    message.sendState === "retrying" ||
    message.sendState === "failed" ||
    message.status === MessageStatus.SENDING ||
    message.status === MessageStatus.FAILED ||
    message.status === "uploading"
  ) {
    return false;
  }

  if (
    message.sendState === "sent" ||
    message.status === MessageStatus.SENT ||
    message.status === MessageStatus.DELIVERED ||
    message.status === MessageStatus.READ
  ) {
    return true;
  }

  // Không rõ trạng thái: id tạm nghĩa là chưa qua server.
  return !isTempMessageId(message.id);
};

/** Tin còn dở dang phía client — phải được bảo vệ khỏi mọi thao tác cắt tỉa. */
export const isRetriableOrPendingLocalMessage = (message: Message): boolean =>
  isTempMessageId(message.id) ||
  message.transportStatus === "optimistic" ||
  message.sendState === "queued" ||
  message.sendState === "sending" ||
  message.sendState === "retrying" ||
  message.sendState === "failed" ||
  message.status === MessageStatus.SENDING ||
  message.status === MessageStatus.FAILED ||
  message.status === "uploading";

/**
 * Cắt bớt lịch sử, giữ phần mới nhất.
 *
 * Tin dở dang được tách ra giữ nguyên trước, phần còn lại mới bị cắt — nên nếu
 * số tin dở dang vượt ngưỡng thì kết quả sẽ dài hơn ngưỡng. Đó là chủ ý: thà
 * tốn bộ nhớ còn hơn mất tin của người dùng.
 */
export const trimInactiveConversationMessages = (
  messages: Message[],
): Message[] => {
  if (messages.length <= MAX_INACTIVE_CONVERSATION_MESSAGES) {
    return messages;
  }

  const protectedMessages = messages.filter(isRetriableOrPendingLocalMessage);
  const protectedKeys = new Set(protectedMessages.map(getStableMessageId));
  const normalMessages = messages.filter(
    (message) => !protectedKeys.has(getStableMessageId(message)),
  );
  const retainedNormalMessages = normalMessages.slice(
    Math.max(
      0,
      normalMessages.length -
        Math.max(
          MAX_INACTIVE_CONVERSATION_MESSAGES - protectedMessages.length,
          0,
        ),
    ),
  );

  return sortMessages([...protectedMessages, ...retainedNormalMessages]);
};

/**
 * Mốc "đã tải từ đâu tới đâu" của một hội thoại, dùng để biết còn phải tải
 * thêm về phía nào. Chỉ tính trên tin đã chốt.
 */
export const buildConversationMessageWindow = (
  messages: Message[],
): ConversationMessageWindow => {
  const canonicalMessages = messages.filter((message) =>
    isCanonicalConversationMessage(message),
  );
  const oldestLoadedMessage = canonicalMessages[0] ?? null;
  const newestLoadedMessage =
    canonicalMessages[canonicalMessages.length - 1] ?? null;

  const window: ConversationMessageWindow = {
    oldestLoadedMessageId: oldestLoadedMessage?.id ?? null,
    oldestLoadedAt: oldestLoadedMessage?.createdAt
      ? new Date(oldestLoadedMessage.createdAt).toISOString()
      : null,
    newestLoadedMessageId: newestLoadedMessage?.id ?? null,
    newestLoadedAt: newestLoadedMessage?.createdAt
      ? new Date(newestLoadedMessage.createdAt).toISOString()
      : null,
  };

  // Chỉ gắn seq khi thực sự có — `undefined` ở đây khác với "seq = 0".
  if (typeof oldestLoadedMessage?.serverSeq === "number") {
    window.oldestLoadedSeq = oldestLoadedMessage.serverSeq;
  }
  if (typeof newestLoadedMessage?.serverSeq === "number") {
    window.newestLoadedSeq = newestLoadedMessage.serverSeq;
  }
  return window;
};
