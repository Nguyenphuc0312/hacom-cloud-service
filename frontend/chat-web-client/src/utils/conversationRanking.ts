import type { Conversation, UserSummary } from "../types";
import { useUIStore } from "../stores/uiStore";
import { asRecord, asString } from "./payloadGuards";

type UnknownRecord = Record<string, unknown>;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;


const toTimestamp = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  return 0;
};

const normalizeMentionToken = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, "");
};

const getConversationExtendedRecord = (
  conversation: Conversation,
): UnknownRecord | null => asRecord(conversation);

export const hasConversationMention = (
  conversation: Conversation,
  currentUser?: Pick<UserSummary, "id" | "username" | "displayName"> | null,
): boolean => {
  if ((conversation.unreadCount || 0) <= 0) return false;
  if (!conversation.lastMessage) return false;
  if (currentUser && conversation.lastMessage.senderId === currentUser.id) {
    return false;
  }

  const record = getConversationExtendedRecord(conversation);
  const explicitMentionCount =
    asNumber(record?.mentionCount) ??
    asNumber(record?.mentionsCount) ??
    asNumber(record?.unreadMentionCount);
  if (explicitMentionCount !== null) {
    return explicitMentionCount > 0;
  }

  const explicitMention =
    asBoolean(record?.hasMention) ??
    asBoolean(record?.isMentioned) ??
    asBoolean(record?.mentioned);
  if (explicitMention !== null) {
    return explicitMention;
  }

  const content = conversation.lastMessage.content || "";
  if (!content) return false;
  if (/@(all|channel|here)\b/i.test(content)) return true;
  if (!currentUser) return false;

  const normalizedContent = content.toLowerCase().replace(/\s+/g, "");
  const usernameToken = normalizeMentionToken(currentUser.username);
  const displayNameToken = normalizeMentionToken(currentUser.displayName);

  return (
    Boolean(usernameToken) &&
      normalizedContent.includes(`@${usernameToken}`) ||
    Boolean(displayNameToken) &&
      normalizedContent.includes(`@${displayNameToken}`)
  );
};

export const getConversationActivityTimestamp = (
  conversation: Conversation,
): number => {
  const record = getConversationExtendedRecord(conversation);
  const canonicalTimestamp =
    toTimestamp(record?.lastMessageSortAt) ||
    toTimestamp(conversation.lastMessageSortAt) ||
    toTimestamp(record?.lastMessageAt) ||
    toTimestamp(conversation.lastMessageAt) ||
    toTimestamp(conversation.lastMessage?.createdAt) ||
    toTimestamp(record?.lastActivityAt) ||
    toTimestamp(conversation.lastActivityAt);

  if (canonicalTimestamp > 0) {
    return canonicalTimestamp;
  }

  return toTimestamp(conversation.updatedAt);
};

export const getConversationSortIdentity = (
  conversation: Conversation,
): string => {
  const record = getConversationExtendedRecord(conversation);
  return (
    asString(record?.lastMessageId) ??
    asString(conversation.lastMessageId) ??
    asString(conversation.lastMessage?.id) ??
    conversation.id
  );
};

/**
 * Tạo hàm so sánh THUẦN từ tập id đã ghim.
 *
 * Nhận sẵn `Set` thay vì tự đi lấy từ store, vì `Array.sort` gọi hàm so sánh
 * O(n log n) lần: đọc store + quét mảng ghim trong mỗi lần so sánh biến chi phí
 * thành O(n log n × p). Dựng Set một lần ở nơi gọi → tra cứu O(1), và hàm so
 * sánh trở thành thuần nên test được mà không cần dựng store.
 */
export const createConversationActivityComparator =
  (pinnedIds: ReadonlySet<string>) =>
  (a: Conversation, b: Conversation): number => {
    const aPinned = pinnedIds.has(a.id);
    const bPinned = pinnedIds.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aActivity = getConversationActivityTimestamp(a);
    const bActivity = getConversationActivityTimestamp(b);

    if (aActivity !== bActivity) {
      return bActivity - aActivity;
    }

    const aLastMessageId = getConversationSortIdentity(a);
    const bLastMessageId = getConversationSortIdentity(b);
    if (aLastMessageId !== bLastMessageId) {
      return bLastMessageId.localeCompare(aLastMessageId);
    }

    return a.id.localeCompare(b.id);
  };

/** Đọc tập ghim hiện tại từ uiStore (một lần, không gọi trong vòng sort). */
export const getPinnedConversationIdSet = (): ReadonlySet<string> =>
  new Set(useUIStore.getState().pinnedConversationIds);

export const sortConversationsByActivity = (
  conversations: Conversation[] | null | undefined,
): Conversation[] => {
  if (!Array.isArray(conversations)) return [];

  return [...conversations].sort(
    createConversationActivityComparator(getPinnedConversationIdSet()),
  );
};

/**
 * Bản tiện dụng cho so sánh LẺ (một cặp), tự lấy tập ghim.
 * Đừng truyền thẳng hàm này vào `Array.sort` — mỗi lần so sánh sẽ dựng lại Set.
 * Sort thì dùng `createConversationActivityComparator` với Set dựng sẵn.
 */
export const compareConversationsByActivity = (
  a: Conversation,
  b: Conversation,
): number =>
  createConversationActivityComparator(getPinnedConversationIdSet())(a, b);
