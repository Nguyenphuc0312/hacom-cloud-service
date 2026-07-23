/**
 * Trộn hai bản ghi cùng một tin nhắn, và khử trùng lặp danh sách tin.
 *
 * Tách khỏi `chatStore.ts` vì đây là logic thuần nhưng dày đặc bất biến: cùng
 * một tin có thể đến từ REST, WebSocket và bản optimistic cục bộ, mỗi nguồn
 * thiếu/thừa field khác nhau và có thể đến sai thứ tự. Sai ở đây = tin nhân
 * đôi, mất nội dung, hoặc trạng thái gửi nhảy ngược.
 */
import { isTempMessageId } from "../features/chat/domain/messageIdentityMatching";
import { MessageStatus } from "../types";
import type { Message } from "../types";
import { toDateValue, toFiniteNumber } from "./conversationCursor";
import {
  resolveMessageMatchIndex,
  sortMessages,
  toMessageIdentityKeys,
} from "./messageOrdering";

/**
 * Bộ đếm thứ tự cục bộ cho tin optimistic, để hai tin gửi trong cùng
 * mili-giây vẫn giữ đúng thứ tự người dùng bấm gửi.
 */
let nextLocalMessageOrder = 1;

export const allocateLocalMessageOrder = (): number => {
  const allocated = nextLocalMessageOrder;
  nextLocalMessageOrder += 1;
  return allocated;
};

/**
 * Ghi đè bằng bản đến, NHƯNG bỏ qua field `undefined`.
 *
 * Quan trọng: payload realtime thường chỉ mang vài field thay đổi. Nếu spread
 * thẳng thì mọi field vắng mặt sẽ xoá sạch dữ liệu đang hiển thị.
 */
export const mergeDefinedMessageFields = (
  current: Message,
  incoming: Message,
): Message => {
  const merged = { ...current } as unknown as Record<string, unknown>;
  Object.entries(incoming as unknown as Record<string, unknown>).forEach(
    ([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
      }
    },
  );
  return merged as unknown as Message;
};

/**
 * Trạng thái gửi sau khi trộn. `failed` của bản đến luôn thắng — không được
 * nuốt lỗi chỉ vì một ack đến sau.
 */
export const resolveMergedSendState = (
  current: Message,
  incoming: Message,
): Message["sendState"] => {
  const currentState = current.sendState;
  const incomingState = incoming.sendState;
  const incomingHasServerAck =
    incoming.status === MessageStatus.SENT ||
    incoming.status === MessageStatus.DELIVERED ||
    incoming.status === MessageStatus.READ ||
    !isTempMessageId(incoming.id);

  if (incomingHasServerAck && incomingState !== "failed") {
    return "sent";
  }
  if (incomingState === "failed") {
    return "failed";
  }
  if (incomingState) {
    return incomingState;
  }
  if (
    current.status === MessageStatus.SENT ||
    current.status === MessageStatus.DELIVERED ||
    current.status === MessageStatus.READ
  ) {
    return "sent";
  }
  return currentState;
};

/**
 * Trộn hai bản ghi cùng một tin.
 *
 * Version-guard: bản đến có `version` thấp hơn (hoặc cùng version nhưng mốc
 * cập nhật cũ hơn) không được ghi đè — đó là response cũ về muộn.
 */
export const mergeMessageRecords = (
  current: Message,
  incoming: Message,
): Message => {
  const currentVersion = toFiniteNumber(current.version);
  const incomingVersion = toFiniteNumber(incoming.version);
  const currentUpdatedAt = Math.max(
    toDateValue(current.updatedAt),
    toDateValue(current.editedAt),
    toDateValue(current.readAt),
    toDateValue(current.deliveredAt),
  );
  const incomingUpdatedAt = Math.max(
    toDateValue(incoming.updatedAt),
    toDateValue(incoming.editedAt),
    toDateValue(incoming.readAt),
    toDateValue(incoming.deliveredAt),
  );
  const preferCurrent =
    currentVersion !== null &&
    incomingVersion !== null &&
    incomingVersion < currentVersion
      ? true
      : currentVersion === incomingVersion &&
        incomingUpdatedAt > 0 &&
        incomingUpdatedAt < currentUpdatedAt;

  const merged = preferCurrent
    ? mergeDefinedMessageFields(incoming, current)
    : mergeDefinedMessageFields(current, incoming);

  // Id thật luôn thắng id tạm, bất kể bên nào là "bản đến".
  if (isTempMessageId(current.id) && !isTempMessageId(incoming.id)) {
    merged.id = incoming.id;
  } else if (!isTempMessageId(current.id) && isTempMessageId(incoming.id)) {
    merged.id = current.id;
  }

  // Giữ vết id tạm trong localId để lần đối chiếu sau vẫn nhận ra nhau.
  merged.localId =
    incoming.localId ||
    current.localId ||
    (isTempMessageId(current.id)
      ? current.id
      : isTempMessageId(incoming.id)
        ? incoming.id
        : undefined);
  merged.clientMessageId =
    incoming.clientMessageId || current.clientMessageId || merged.localId;
  merged.version =
    Math.max(
      toFiniteNumber(current.version) ?? 0,
      toFiniteNumber(incoming.version) ?? 0,
    ) || undefined;
  merged.stableId =
    current.stableId ||
    incoming.stableId ||
    merged.clientMessageId ||
    merged.localId ||
    merged.id;
  merged.localOrder =
    incoming.localOrder ?? current.localOrder ?? allocateLocalMessageOrder();

  // transportStatus chỉ tiến: synced_stream > acked_transport > còn lại.
  const currentTransport = current.transportStatus;
  const incomingTransport = incoming.transportStatus;
  merged.transportStatus =
    incomingTransport === "synced_stream" ||
    currentTransport === "synced_stream"
      ? "synced_stream"
      : incomingTransport === "acked_transport" ||
          currentTransport === "acked_transport"
        ? "acked_transport"
        : incomingTransport || currentTransport;

  merged.sendState = resolveMergedSendState(current, incoming);
  if (merged.sendState === "sent") {
    // Gửi xong thì dọn sạch dấu vết lỗi cũ, tránh UI hiện cảnh báo ma.
    merged.queuedReason = undefined;
    merged.failureReason = undefined;
    merged.errorCode = undefined;
    merged.errorMessage = undefined;
  }

  return merged;
};

/**
 * Khử trùng lặp theo danh tính rồi sắp lại.
 *
 * Dùng index khoá → vị trí (O(1) mỗi khoá) thay vì quét tuyến tính từng tin,
 * vì hàm này chạy trên cả trang lịch sử.
 */
export const dedupeAndSortMessages = (messages: Message[]): Message[] => {
  const deduped: Message[] = [];
  const keyToIndex = new Map<string, number>();

  for (const message of messages) {
    const existingIndex = resolveMessageMatchIndex(
      deduped,
      keyToIndex,
      message,
    );
    if (existingIndex < 0) {
      const nextIndex = deduped.push(message) - 1;
      toMessageIdentityKeys(message).forEach((key) => {
        keyToIndex.set(key, nextIndex);
      });
      continue;
    }

    deduped[existingIndex] = mergeMessageRecords(
      deduped[existingIndex],
      message,
    );
    // Bản đã trộn có thể mang thêm khoá mới (id thật) → đăng ký lại.
    toMessageIdentityKeys(deduped[existingIndex]).forEach((key) => {
      keyToIndex.set(key, existingIndex);
    });
  }

  return sortMessages(deduped);
};

export const mergeMessages = (
  current: Message[],
  incoming: Message[],
): Message[] =>
  dedupeAndSortMessages([
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(incoming) ? incoming : []),
  ]);
