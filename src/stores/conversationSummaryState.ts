/**
 * Cập nhật phần tóm tắt của hội thoại: preview tin cuối, mốc hoạt động, tiến
 * độ đọc.
 *
 * Tách khỏi `chatStore.ts`: logic thuần, không đụng store. Đây là dữ liệu
 * sidebar nhìn thấy — sai thì hoặc badge unread kẹt, hoặc hội thoại nhảy sai
 * chỗ trong danh sách.
 */
import { normalizeConversation } from "../lib/conversationAdapter";
import { MessageStatus } from "../types";
import type { Conversation, Message } from "../types";
import { matchesMessageIdentityValue } from "./messageAliasIndex";

type EditedMessagePreview = Pick<
  Message,
  | "id"
  | "localId"
  | "clientMessageId"
  | "stableId"
  | "content"
  | "editedAt"
  | "updatedAt"
>;

/**
 * Chỉ đổi nội dung preview khi tin vừa sửa đúng là tin cuối của hội thoại.
 * Patch cố ý không chứa timestamp/unread để thao tác sửa không đẩy phòng lên
 * đầu danh sách hoặc làm thay đổi badge.
 */
export const buildEditedLastMessagePreviewPatch = (
  conversation: Conversation,
  message: EditedMessagePreview,
): Pick<Conversation, "lastMessage"> | null => {
  const currentLastMessage = conversation.lastMessage;
  const lastMessageIdentity =
    currentLastMessage?.id ?? conversation.lastMessageId ?? "";

  if (
    !currentLastMessage ||
    !matchesMessageIdentityValue(message, lastMessageIdentity)
  ) {
    return null;
  }

  return {
    lastMessage: {
      ...currentLastMessage,
      content: message.content,
      isEdited: true,
      ...(message.editedAt ?? message.updatedAt ?? currentLastMessage.editedAt
        ? {
            editedAt:
              message.editedAt ??
              message.updatedAt ??
              currentLastMessage.editedAt,
          }
        : {}),
    },
  };
};

/**
 * Sau reload, API hội thoại có thể còn preview cũ trong khi timeline đã trả
 * message authoritative với `isEdited=true`. Dùng chính tin cùng identity để
 * khôi phục preview; không lấy bừa phần tử cuối vì pagination/system message có
 * thể khiến thứ tự cache khác summary.
 */
export const buildHydratedEditedLastMessagePreviewPatch = (
  conversation: Conversation,
  messages: readonly Message[],
): Pick<Conversation, "lastMessage"> | null => {
  const lastMessageIdentity =
    conversation.lastMessage?.id ?? conversation.lastMessageId ?? "";
  if (!lastMessageIdentity) return null;

  let authoritativeMessage: Message | undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (matchesMessageIdentityValue(message, lastMessageIdentity)) {
      authoritativeMessage = message;
      break;
    }
  }

  if (!authoritativeMessage?.isEdited) return null;
  return buildEditedLastMessagePreviewPatch(
    conversation,
    authoritativeMessage,
  );
};

/** Rút gọn tin nhắn còn đúng phần sidebar cần để hiển thị preview. */
export const toMessageSummary = (
  message: Message,
): Conversation["lastMessage"] =>
  ({
    id: message.id,
    senderId: message.senderId,
    senderName: message.senderName,
    content: message.content,
    type: message.type,
    isDeleted: message.isDeleted,
    createdAt: message.createdAt,
    ...(message.isEdited ? { isEdited: true } : {}),
    ...(message.editedAt ? { editedAt: message.editedAt } : {}),
    // Giữ lại mention: thiếu nó thì preview sidebar không biết đoạn `@Tên` trỏ
    // tới ai, nên không đổi được sang "tên gợi nhớ" của người xem.
    ...(message.mentions?.length ? { mentions: message.mentions } : {}),
    ...(message.sendState ? { sendState: message.sendState } : {}),
    ...(message.status ? { status: message.status } : {}),
  }) as Conversation["lastMessage"];

const isDeletedMessage = (message: Message): boolean =>
  Boolean(
    message.isDeleted ||
      message.lifecycleStatus === "recalled" ||
      message.lifecycleStatus === "deleted_admin",
  );

/**
 * Trạng thái gửi hiển thị cạnh preview.
 * Tin đã thu hồi/xoá trả `null` — không hiển thị dấu gửi cho nội dung không còn.
 */
export const toConversationLastMessageStatus = (
  message: Message | null | undefined,
): Conversation["lastMessageStatus"] => {
  if (!message) return null;

  if (isDeletedMessage(message)) {
    return null;
  }

  if (
    message.sendState === "failed" ||
    message.status === MessageStatus.FAILED
  ) {
    return "failed";
  }

  if (
    message.sendState === "queued" ||
    message.sendState === "sending" ||
    message.sendState === "retrying" ||
    message.status === MessageStatus.SENDING ||
    message.status === "uploading"
  ) {
    return "pending";
  }

  return "sent";
};

/**
 * Ghi tin mới nhất vào hội thoại. Đẩy đồng loạt mọi mốc thời gian vì mỗi nơi
 * trong app đọc một trường khác nhau để xếp thứ tự.
 */
export const updateConversationActivitySummary = (
  conversation: Conversation,
  message: Message,
  unreadCount: number,
): Conversation => {
  // Giữ nguyên logic gốc: nhánh này KHÔNG phân biệt "pending" như
  // `toConversationLastMessageStatus`. Tin vừa gửi đi coi như "sent" ngay để
  // preview sidebar không nhấp nháy trong lúc chờ ack.
  // (Gộp hai nhánh = đổi hành vi, phải là quyết định riêng.)
  const nextLastMessageStatus: Conversation["lastMessageStatus"] =
    isDeletedMessage(message)
      ? null
      : message.sendState === "failed" ||
          message.status === MessageStatus.FAILED
        ? "failed"
        : "sent";

  const patch = {
    unreadCount,
    lastMessage: toMessageSummary(message),
    updatedAt: message.createdAt,
    lastMessageAt: message.createdAt,
    lastMessageSortAt: message.createdAt,
    lastMessageId: message.id,
    lastMessageStatus: nextLastMessageStatus,
    lastActivityAt: message.createdAt,
  };

  return (normalizeConversation({ ...conversation, ...patch }) ?? {
    ...conversation,
    unreadCount,
    lastMessage: toMessageSummary(message),
    updatedAt: new Date(message.createdAt),
  }) as Conversation;
};

/**
 * Người dùng vừa đọc tới đâu đó: unread về 0, con trỏ tin chưa đọc bị xoá.
 * `lastReadSeq` chỉ tiến — checkpoint cũ về muộn không được kéo lùi.
 */
export const updateConversationReadProgress = (
  conversation: Conversation,
  lastReadMessageId?: string | null,
  readAt?: Date | string | null,
  lastReadSeq?: number | null,
): Conversation => {
  const nextLastReadSeq =
    typeof lastReadSeq === "number" && Number.isFinite(lastReadSeq)
      ? Math.max(conversation.lastReadSeq ?? 0, lastReadSeq)
      : conversation.lastReadSeq;

  const updates = {
    ...conversation,
    unreadCount: 0,
    ...(lastReadMessageId ? { lastReadMessageId } : {}),
    ...(typeof nextLastReadSeq === "number"
      ? { lastReadSeq: nextLastReadSeq }
      : {}),
    lastReadAt: readAt ?? new Date().toISOString(),
    firstUnreadMessageId: null,
    firstUnreadMessageAt: null,
  };

  return (normalizeConversation(updates) ?? updates) as Conversation;
};

/**
 * Áp trạng thái đọc do server gửi xuống.
 *
 * `unreadCount` kẹp sàn 0 (giá trị âm lỗi không được hiển thị), và con trỏ tin
 * chưa đọc đầu tiên chỉ giữ khi thực sự còn tin chưa đọc.
 */
export const applyConversationReadState = (
  conversation: Conversation,
  readState: {
    unreadCount: number;
    lastReadSeq?: number;
    lastReadMessageId: string | null;
    lastReadAt: string | null;
    firstUnreadMessageId?: string | null;
    firstUnreadMessageAt?: string | null;
  },
): Conversation => {
  const nextUnreadCount = Math.max(
    0,
    readState.unreadCount ?? conversation.unreadCount ?? 0,
  );
  const hasUnread = readState.unreadCount > 0;

  return (normalizeConversation({
    ...conversation,
    unreadCount: nextUnreadCount,
    lastReadSeq: readState.lastReadSeq ?? conversation.lastReadSeq ?? 0,
    lastReadMessageId:
      readState.lastReadMessageId ??
      conversation.lastReadMessageId ??
      undefined,
    lastReadAt: readState.lastReadAt ?? conversation.lastReadAt ?? undefined,
    firstUnreadMessageId:
      readState.firstUnreadMessageId ??
      (hasUnread ? (conversation.firstUnreadMessageId ?? undefined) : null),
    firstUnreadMessageAt:
      readState.firstUnreadMessageAt ??
      (hasUnread ? (conversation.firstUnreadMessageAt ?? undefined) : null),
  }) ?? {
    ...conversation,
    unreadCount: nextUnreadCount,
    lastReadSeq: readState.lastReadSeq ?? conversation.lastReadSeq ?? 0,
    lastReadMessageId:
      readState.lastReadMessageId ?? conversation.lastReadMessageId ?? null,
    lastReadAt: readState.lastReadAt ?? conversation.lastReadAt ?? null,
    firstUnreadMessageId:
      readState.firstUnreadMessageId ??
      (hasUnread ? (conversation.firstUnreadMessageId ?? null) : null),
    firstUnreadMessageAt:
      readState.firstUnreadMessageAt ??
      (hasUnread ? (conversation.firstUnreadMessageAt ?? null) : null),
  }) as Conversation;
};
