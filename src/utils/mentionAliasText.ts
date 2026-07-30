import type { Mention } from "../types";
import { useFriendshipStore } from "../stores/friendshipStore";
import { buildMentionSegments } from "./mentionSegments";

// Re-export cho các chỗ đã dùng cả hai hàm. Ai chỉ cần hàm thuần (nhất là
// `conversationAdapter`) phải import THẲNG từ "./parseMentionDetails" — qua file
// này là kéo theo `friendshipStore` và tạo lại vòng import.
export { parseMentionDetails } from "./parseMentionDetails";

/**
 * Bảng alias theo userId, đọc một lần ngoài React.
 *
 * Dùng cho các chỗ dựng CHUỖI (preview, thông báo) — nơi không gọi hook được.
 * Trong component thì dùng `useResolvedDisplayName`, vì nó còn re-render khi
 * alias đổi.
 */
export const aliasByUserId = (): Record<string, string | null | undefined> => {
  const byUser = useFriendshipStore.getState().friendByUserId;
  const out: Record<string, string | null | undefined> = {};
  for (const id in byUser) out[id] = byUser[id]?.alias;
  return out;
};

/**
 * Thay nhãn của các tag `@` trong một đoạn CHỮ THUẦN bằng "tên gợi nhớ" (alias)
 * của người xem.
 *
 * Vì sao cần: nội dung tin nhắn chỉ chứa tag dưới dạng chữ (`@Nguyễn Minh Quang`).
 * Chỗ nào render được React thì `TextMessage` đã lo (mỗi tag là một component
 * đọc alias riêng). Nhưng preview thì là chuỗi thuần — toast, sidebar, thông báo
 * — nên vẫn hiện tên thật. Hàm này là đường duy nhất để các chỗ đó cũng chuẩn.
 *
 * Không có alias thì trả về nguyên văn: đây là hàm thuần, không đoán, không cắt.
 */
export const applyMentionAliases = (
  content: string,
  mentions: Mention[] | undefined,
  aliasByUserId: Record<string, string | null | undefined>,
): string => {
  if (!content || !mentions?.length) return content;

  // Không ai trong tin này có alias → khỏi cắt chuỗi cho tốn công.
  const hasAnyAlias = mentions.some(
    (m) => m.userId && aliasByUserId[m.userId]?.trim(),
  );
  if (!hasAnyAlias) return content;

  return buildMentionSegments(content, mentions)
    .map((segment) => {
      if (!segment.userId) return segment.text;
      const alias = aliasByUserId[segment.userId]?.trim();
      if (!alias) return segment.text;
      // Giữ nguyên tiền tố của đoạn gốc: đường "dò tên" luôn cắt kèm '@', còn
      // đường "range" thì tuỳ BE đánh dấu — cứ tự thêm '@' là ra "@@Tên".
      return segment.text.startsWith("@") ? `@${alias}` : alias;
    })
    .join("");
};
