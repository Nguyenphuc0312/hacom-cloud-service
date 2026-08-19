import type { Mention } from "../types";

/**
 * Đọc `mentions` từ payload thô (realtime hoặc `lastMessage` của API) thành
 * `Mention[]`.
 *
 * Chỉ giữ phần tử có `userId` là chuỗi — dạng userId thuần (`string[]`) của tin
 * cũ bị bỏ vì thiếu tên thật thì không dò được tag trong nội dung.
 *
 * File RIÊNG, không gộp vào `mentionAliasText.ts`: file đó import
 * `friendshipStore`, mà store lại kéo theo `services/api` → `conversationAdapter`.
 * Adapter import ngược lại là thành vòng, `normalizeConversation` thành
 * `undefined` lúc module init và app trắng màn. Hàm này thuần nên đứng riêng
 * được, cắt vòng ngay tại đây.
 */
export const parseMentionDetails = (mentions: unknown): Mention[] => {
  if (!Array.isArray(mentions)) return [];
  return mentions.filter(
    (item): item is Mention =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as { userId?: unknown }).userId === "string" &&
      (item as { userId: string }).userId.trim().length > 0,
  );
};
