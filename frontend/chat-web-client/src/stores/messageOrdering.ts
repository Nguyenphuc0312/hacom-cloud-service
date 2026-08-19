/**
 * Thứ tự và nhận dạng tin nhắn trong `chatStore`.
 *
 * Tách khỏi `chatStore.ts` vì đây là logic thuần quyết định tin nào đứng trước
 * tin nào, và tin đến có phải là tin đã có sẵn hay không. Sai ở đây = tin nhảy
 * chỗ hoặc nhân đôi, nên đáng được test riêng.
 *
 * `toMessageIdentityKeys` KHÔNG định nghĩa lại ở đây — dùng chung bản trong
 * `domain/messageIdentityMatching` để chỉ có một nguồn sự thật về danh tính.
 */
import { toMessageIdentityKeys } from "../features/chat/domain/messageIdentityMatching";
import { compareMessages } from "../features/chat/domain/messageOrdering";
import type { Message } from "../types";

/**
 * Thứ tự canonical của timeline, xét lần lượt:
 * seq → serverTs → localOrder → createdAt → stableId → id.
 *
 * Tin đã có seq luôn đứng trước tin chưa có: tin optimistic chưa được server
 * xác nhận phải nằm cuối, không được chen vào giữa lịch sử. Bậc cuối
 * (stableId/id) đảm bảo thứ tự tất định — không bao giờ trả 0 cho hai tin khác
 * nhau, nên `sort` cho kết quả ổn định qua các lần render.
 *
 * Dùng chung bản của `domain/messageOrdering` thay vì giữ bản sao: hai bản từng
 * gần y hệt, khác biệt duy nhất là bản domain còn đọc `messageSeq` làm seq dự
 * phòng — mà `normalizeMessage` của chatStore đã gộp `messageSeq` vào
 * `serverSeq` từ trước, nên khác biệt đó không tới được store.
 * Xem `messageOrdering.equivalence.test.ts` để biết căn cứ.
 */
export { compareMessages };

/** Sắp xếp trên bản sao — không làm biến đổi mảng gốc. */
export const sortMessages = (messages: Message[]): Message[] =>
  [...messages].sort(compareMessages);

/**
 * Hai bản ghi có phải cùng một tin nhắn không.
 *
 * Phải khớp chéo `localId` ↔ `id` theo cả hai chiều: khi ack từ server về, tin
 * optimistic mang id tạm còn tin thật mang id server nhưng giữ `localId` trỏ
 * ngược lại. Bỏ chiều nào cũng sinh tin nhân đôi trên màn hình.
 */
export const matchesMessage = (source: Message, target: Message): boolean =>
  (source.stableId !== undefined && source.stableId === target.stableId) ||
  (source.clientMessageId !== undefined &&
    source.clientMessageId === target.clientMessageId) ||
  source.id === target.id ||
  (source.localId !== undefined && source.localId === target.id) ||
  (target.localId !== undefined && target.localId === source.id) ||
  (source.localId !== undefined &&
    target.localId !== undefined &&
    source.localId === target.localId);

/**
 * Vị trí của tin tương ứng trong danh sách hiện tại, tra qua index dựng sẵn
 * (O(1) mỗi khoá) thay vì quét tuyến tính từng tin. Trả -1 nếu là tin mới.
 */
export const resolveMessageMatchIndex = (
  _current: Message[],
  keyToIndex: Map<string, number>,
  incoming: Message,
): number => {
  const identityMatch = toMessageIdentityKeys(incoming)
    .map((key) => keyToIndex.get(key))
    .find((index): index is number => typeof index === "number");
  if (typeof identityMatch === "number") {
    return identityMatch;
  }

  return -1;
};

export { toMessageIdentityKeys };
