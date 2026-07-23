/**
 * Quyết định có áp dụng bản tóm tắt hội thoại đến hay không, và trộn nó với
 * bản local.
 *
 * Tách khỏi `chatStore.ts` vì đây là logic thuần nhưng tinh vi nhất của store:
 * nó chống race condition giữa optimistic markAsRead và response cũ về muộn.
 * Sai ở đây = unread nhảy lung tung hoặc mất trạng thái đã đọc, nên nó xứng
 * đáng test riêng thay vì nằm lẫn trong 5k dòng.
 */
import { normalizeConversation } from "../lib/conversationAdapter";
import type { Conversation } from "../types";
import {
  getConversationCursorTimestamp,
  toConversationVersion,
} from "./conversationCursor";

export interface ConversationSummaryDecision {
  apply: boolean;
  /** Version nhảy quá 1 bậc → thiếu mất bản trung gian, cần resync. */
  gapDetected: boolean;
  previousVersion: number;
  nextVersion: number;
  reason?: "inserted" | "updated" | "stale_version" | "stale_timestamp";
}

export const shouldApplyConversationSummary = (
  current: Conversation | null | undefined,
  incoming: Conversation,
): ConversationSummaryDecision => {
  const previousVersion = toConversationVersion(current);
  const nextVersion = toConversationVersion(incoming);

  if (!current) {
    return {
      apply: true,
      gapDetected: false,
      previousVersion: 0,
      nextVersion,
      reason: "inserted",
    };
  }

  if (previousVersion > 0 && nextVersion > 0 && nextVersion < previousVersion) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_version",
    };
  }

  const currentTs = getConversationCursorTimestamp(current);
  const incomingTs = getConversationCursorTimestamp(incoming);
  if (
    nextVersion === previousVersion &&
    incomingTs > 0 &&
    incomingTs < currentTs
  ) {
    return {
      apply: false,
      gapDetected: false,
      previousVersion,
      nextVersion,
      reason: "stale_timestamp",
    };
  }

  return {
    apply: true,
    gapDetected:
      previousVersion > 0 &&
      nextVersion > 0 &&
      nextVersion > previousVersion + 1,
    previousVersion,
    nextVersion,
    reason: "updated",
  };
};

/**
 * BIGINT từ BE đến dưới dạng string ("186"). Phải coerce trước khi so sánh,
 * nếu không stale-read guard xem cả hai là 0 và để bản cũ ghi đè.
 */
const coerceSeq = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return 0;
};

export const mergeConversationSummary = (
  current: Conversation | null | undefined,
  incoming: Conversation,
): Conversation => {
  if (!current) {
    return incoming;
  }

  // Stale-read guard: nếu local đã đánh dấu đọc xa hơn server response thì
  // không cho response cũ (lastReadSeq thấp hơn / vắng mặt) đẩy unreadCount
  // ngược lên. Xử lý race: user click conversation → optimistic markAsRead set
  // unread=0, sau đó stale GET /conversations trả về unreadCount=17 cũ.
  const currentLastReadSeq = coerceSeq(current.lastReadSeq);
  const incomingLastReadSeq = coerceSeq(incoming.lastReadSeq);

  // Chỉ kích hoạt khi incoming CÓ lastReadSeq hợp lệ (> 0) mà vẫn thấp hơn
  // local. Nếu incoming.lastReadSeq = 0 / null / undefined (server không gửi
  // checkpoint) thì đó là THIẾU dữ liệu, không phải dữ liệu cũ — coi là stale
  // sẽ giữ nhầm unreadCount=0 trong khi thực tế có tin chưa đọc.
  const localReadIsAhead =
    currentLastReadSeq > 0 &&
    incomingLastReadSeq > 0 &&
    currentLastReadSeq > incomingLastReadSeq;

  const preserveLocalRead =
    localReadIsAhead ||
    ((current.unreadCount ?? 0) === 0 &&
      (incoming.unreadCount ?? 0) > 0 &&
      incomingLastReadSeq > 0 &&
      incomingLastReadSeq < currentLastReadSeq);

  return (normalizeConversation({
    ...current,
    ...incoming,
    unreadCount: preserveLocalRead
      ? (current.unreadCount ?? 0)
      : incoming.unreadCount,
    lastReadSeq: Math.max(currentLastReadSeq, incomingLastReadSeq) || undefined,
    lastReadMessageId: localReadIsAhead
      ? (current.lastReadMessageId ?? incoming.lastReadMessageId ?? undefined)
      : (incoming.lastReadMessageId ?? current.lastReadMessageId ?? undefined),
    lastReadAt: localReadIsAhead
      ? (current.lastReadAt ?? incoming.lastReadAt ?? undefined)
      : (incoming.lastReadAt ?? current.lastReadAt ?? undefined),
    firstUnreadMessageId: preserveLocalRead
      ? undefined
      : (incoming.firstUnreadMessageId ??
        current.firstUnreadMessageId ??
        undefined),
    firstUnreadMessageAt: preserveLocalRead
      ? undefined
      : (incoming.firstUnreadMessageAt ??
        current.firstUnreadMessageAt ??
        undefined),
    summaryVersion:
      toConversationVersion(incoming) ||
      toConversationVersion(current) ||
      undefined,
  }) ?? {
    ...current,
    ...incoming,
  }) as Conversation;
};
