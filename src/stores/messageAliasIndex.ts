/**
 * Chỉ mục bí danh tin nhắn.
 *
 * Một tin có thể được nhắc tới bằng nhiều định danh khác nhau tuỳ nguồn: id
 * server, id tạm cục bộ, `clientMessageId`, `stableId`. Module này quy mọi bí
 * danh về **một id chuẩn** để các thao tác sau (cập nhật, xoá, đánh dấu đã đọc)
 * không trượt sang tin khác hoặc trượt ra ngoài.
 *
 * Tách khỏi `chatStore.ts`: logic thuần, không đụng store.
 */
import { getMessageIdentityKey } from "../utils/messageIdFactory";
import type { Message } from "../types";

type MessageIdentityFields = Pick<
  Message,
  "id" | "localId" | "clientMessageId" | "stableId"
>;

export const getStableMessageId = (message: Message): string =>
  getMessageIdentityKey(message);

/** Mọi định danh mà một tin có thể được gọi tới, đã khử trùng lặp. */
export const getMessageAliasCandidates = (
  message: MessageIdentityFields,
): string[] =>
  Array.from(
    new Set(
      [
        message.id,
        message.localId,
        message.clientMessageId,
        message.stableId,
      ].filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  );

/** Bảng tra bí danh → id chuẩn, dựng lại mỗi khi danh sách tin thay đổi. */
export const rebuildConversationMessageAliasIndex = (
  messages: Message[],
): Record<string, string> => {
  const aliasIndex: Record<string, string> = {};

  messages.forEach((message) => {
    const canonicalId = getStableMessageId(message);
    getMessageAliasCandidates(message).forEach((alias) => {
      aliasIndex[alias] = canonicalId;
    });
  });

  return aliasIndex;
};

export const matchesMessageIdentityValue = (
  message: MessageIdentityFields,
  identity: string,
): boolean => {
  // Chuỗi rỗng phải trả false: nếu không nó sẽ khớp với mọi tin có field rỗng.
  if (!identity) return false;

  return (
    message.id === identity ||
    message.localId === identity ||
    message.clientMessageId === identity ||
    message.stableId === identity
  );
};

/**
 * Quy một định danh bất kỳ về id chuẩn. Tra index trước (O(1)); không có thì
 * mới quét danh sách. Không tìm thấy thì **trả lại chính nó** — nơi gọi tự xử
 * lý, hàm này không nuốt giá trị thành rỗng.
 */
export const resolveCanonicalMessageIdentity = (
  conversationMessages: Message[],
  aliasIndex: Record<string, string> | undefined,
  identity: string,
): string => {
  if (!identity) return identity;

  const aliasedIdentity = aliasIndex?.[identity];
  if (aliasedIdentity) {
    return aliasedIdentity;
  }

  const matchedMessage = conversationMessages.find((message) =>
    matchesMessageIdentityValue(message, identity),
  );
  return matchedMessage ? getStableMessageId(matchedMessage) : identity;
};

/** Khoá hàng đợi gửi — gắn với hội thoại để hai nơi không đụng nhau. */
export const getMessageQueueKey = (
  conversationId: string,
  message: MessageIdentityFields,
): string => `${conversationId}:${getStableMessageId(message as Message)}`;
