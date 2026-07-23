/**
 * Con trỏ phân trang & chỉ mục danh sách hội thoại.
 *
 * Tách khỏi `chatStore.ts`: toàn hàm thuần, không đọc/ghi store. Đây là phần
 * quyết định "đã tải tới đâu" và "có dữ liệu mới không", nên sai ở đây gây mất
 * hội thoại hoặc tải lặp — đáng được test riêng.
 */
import type { Conversation } from "../types";

/** Mốc thời gian dạng số; giá trị không đọc được trả 0 thay vì NaN. */
export const toDateValue = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export const toFiniteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const toConversationVersion = (
  conversation: Conversation | null | undefined,
): number =>
  typeof conversation?.summaryVersion === "number" &&
  Number.isFinite(conversation.summaryVersion)
    ? conversation.summaryVersion
    : 0;

/**
 * Mốc hoạt động mới nhất của hội thoại. BE điền không đồng nhất giữa các
 * endpoint nên lấy max của mọi trường có thể, cuối cùng mới lùi về `updatedAt`.
 */
export const getConversationCursorTimestamp = (
  conversation: Conversation | null | undefined,
): number => {
  if (!conversation) return 0;

  const canonicalTimestamp = Math.max(
    toDateValue(conversation.lastMessageSortAt),
    toDateValue(conversation.lastActivityAt),
    toDateValue(conversation.lastMessageAt),
    toDateValue(conversation.lastMessage?.createdAt),
  );

  if (canonicalTimestamp > 0) {
    return canonicalTimestamp;
  }

  return toDateValue(conversation.updatedAt);
};

/**
 * Khoá nhận dạng vị trí con trỏ. Gộp cả version và id để hai hội thoại trùng
 * mốc thời gian vẫn phân biệt được, và để bản cập nhật mới sinh khoá khác.
 */
export const getConversationCursorIdentity = (
  conversation: Conversation | null | undefined,
): string => {
  if (!conversation) return "unknown";

  return [
    String(getConversationCursorTimestamp(conversation)),
    String(toConversationVersion(conversation)),
    conversation.id,
    conversation.lastMessageId ?? conversation.lastMessage?.id ?? "no-message",
  ].join(":");
};

/** Con trỏ trang kế: lấy theo phần tử đầu (danh sách đã sắp theo hoạt động). */
export const computeConversationCursor = (
  conversations: Conversation[],
): string | null => {
  const leadingConversation = Array.isArray(conversations)
    ? conversations[0]
    : null;
  if (!leadingConversation) {
    return null;
  }

  return getConversationCursorIdentity(leadingConversation);
};

/**
 * Mốc để hỏi "có gì mới sau thời điểm này": lấy max toàn danh sách chứ không
 * lấy phần tử đầu — danh sách có thể chưa sắp đúng lúc gọi.
 */
export const computeConversationUpdatedAfterCursor = (
  conversations: Conversation[],
): string | null => {
  let latestTimestamp = 0;

  (Array.isArray(conversations) ? conversations : []).forEach(
    (conversation) => {
      latestTimestamp = Math.max(
        latestTimestamp,
        getConversationCursorTimestamp(conversation),
      );
    },
  );

  return latestTimestamp > 0 ? new Date(latestTimestamp).toISOString() : null;
};

/** Tổng unread; kẹp sàn 0 để một giá trị âm lỗi không trừ vào tổng. */
export const computeCanonicalTotalUnreadCount = (
  conversations: Conversation[],
): number =>
  (Array.isArray(conversations) ? conversations : []).reduce(
    (sum, conversation) => sum + Math.max(0, conversation.unreadCount || 0),
    0,
  );

/** Index tra cứu O(1) + thứ tự hiển thị, dựng một lượt từ danh sách đã sắp. */
export const buildConversationIndexState = (conversations: Conversation[]) => {
  const ordered = Array.isArray(conversations) ? conversations : [];
  return {
    conversationById: ordered.reduce<Record<string, Conversation>>(
      (accumulator, conversation) => {
        accumulator[conversation.id] = conversation;
        return accumulator;
      },
      {},
    ),
    orderedConversationIds: ordered.map((conversation) => conversation.id),
  };
};
