import type { Mention } from "../types";

/**
 * Đọc `mentions` từ payload thô (realtime hoặc `lastMessage` của API) thành
 * `Mention[]`.
 *
 * Chỉ giữ phần tử object có userId. Giữ luôn range (`offset`/`length`) vì đây là
 * cách duy nhất xác định đúng tag khi tên trong content và metadata khác nhau.
 *
 * File RIÊNG, không gộp vào `mentionAliasText.ts`: file đó import
 * `friendshipStore`, mà store lại kéo theo `services/api` → `conversationAdapter`.
 * Adapter import ngược lại là thành vòng, `normalizeConversation` thành
 * `undefined` lúc module init và app trắng màn. Hàm này thuần nên đứng riêng
 * được, cắt vòng ngay tại đây.
 */
export const parseMentionDetails = (mentions: unknown): Mention[] => {
  if (!Array.isArray(mentions)) return [];
  return mentions.flatMap((item): Mention[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const userId =
      typeof record.userId === "string"
        ? record.userId.trim()
        : typeof record.user_id === "string"
          ? record.user_id.trim()
          : "";
    if (!userId) return [];

    const displayName =
      typeof record.displayName === "string"
        ? record.displayName
        : typeof record.display_name === "string"
          ? record.display_name
          : "";
    const employeeCode =
      typeof record.employeeCode === "string"
        ? record.employeeCode
        : typeof record.employee_code === "string"
          ? record.employee_code
          : undefined;
    const avatarUrl =
      typeof record.avatarUrl === "string"
        ? record.avatarUrl
        : typeof record.avatar_url === "string"
          ? record.avatar_url
          : undefined;

    return [{
      userId,
      displayName,
      ...(employeeCode ? { employeeCode } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(typeof record.offset === "number" ? { offset: record.offset } : {}),
      ...(typeof record.length === "number" ? { length: record.length } : {}),
    }];
  });
};
