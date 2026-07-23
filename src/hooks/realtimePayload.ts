/**
 * Đọc & phân loại payload realtime từ WebSocket.
 *
 * Tách khỏi `useWebSocket.ts` (3.1k dòng) vì đây là logic THUẦN: không đụng
 * socket, store, ref hay dispatch. BE gửi cùng một thông tin dưới nhiều tên và
 * nhiều tầng lồng nhau tuỳ loại sự kiện, nên phần dò tên này đáng được test
 * riêng thay vì nằm lẫn trong hook.
 */
import type { realtimeActions } from "../features/realtime/realtimeSlice";
import type { ConnectionState } from "../lib/socket";

export const asRecord = (
  value: unknown,
): Record<string, unknown> | null =>
  value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;

export const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/** Hồ sơ người gửi: ưu tiên bản nằm trong message, rồi mới tới payload ngoài. */
export const getSenderProfile = (
  payload: Record<string, unknown>,
  messagePayload: Record<string, unknown>,
): Record<string, unknown> | null =>
  asRecord(messagePayload.sender) ??
  asRecord(payload.sender) ??
  asRecord(messagePayload.from) ??
  asRecord(payload.from);

/**
 * Tên người gửi để hiển thị. Trả `null` khi không suy ra được — nơi gọi tự
 * quyết fallback, hàm này không đoán thay.
 */
export const getRealtimeSenderName = (
  payload: Record<string, unknown>,
  messagePayload: Record<string, unknown>,
): string | null => {
  const senderProfile = getSenderProfile(payload, messagePayload);
  return (
    asString(messagePayload.senderName) ??
    asString(messagePayload.sender_name) ??
    asString(payload.senderName) ??
    asString(payload.sender_name) ??
    asString(senderProfile?.displayName) ??
    asString(senderProfile?.name) ??
    asString(senderProfile?.username)
  );
};

/** Luôn trả string (chuỗi rỗng khi thiếu) vì nơi gọi render thẳng giá trị này. */
export const getRealtimeMessageContent = (
  payload: Record<string, unknown>,
  messagePayload: Record<string, unknown>,
): string =>
  asString(messagePayload.content) ??
  asString(messagePayload.body) ??
  asString(messagePayload.text) ??
  asString(payload.content) ??
  asString(payload.body) ??
  "";

/**
 * Sự kiện do chính người dùng hiện tại gây ra thì không cần refresh lại danh
 * sách — hành động cục bộ đã cập nhật state rồi.
 */
export const shouldSkipGroupConversationRefreshForCurrentUser = (
  payload: Record<string, unknown> | null,
  currentUserId: string | null | undefined,
): boolean => {
  if (!payload || !currentUserId) {
    return false;
  }

  const targetUserId =
    asString(payload.userId) ?? asString(payload.targetUserId);
  return targetUserId === currentUserId;
};

/**
 * Chỉ tải delta cho hội thoại người dùng đang thực sự theo dõi (đang mở hoặc
 * đã join); các hội thoại khác để lần tải đầy đủ sau xử lý.
 */
export const shouldUseDeltaConversationRefresh = ({
  conversationId,
  selectedConversationId,
  joinedConversationIds,
}: {
  conversationId: string | null | undefined;
  selectedConversationId: string | null | undefined;
  joinedConversationIds: ReadonlySet<string>;
}): boolean =>
  Boolean(
    conversationId &&
      (selectedConversationId === conversationId ||
        joinedConversationIds.has(conversationId)),
  );

/**
 * Gộp trạng thái chi tiết của socket về 4 mức mà UI cần biết.
 * Trạng thái lạ rơi vào "disconnected" — mặc định an toàn, tránh hiện "đang
 * kết nối" trong khi thực tế đã chết.
 */
export const toRealtimeConnectionStatus = (
  state: ConnectionState,
): Parameters<typeof realtimeActions.setConnectionStatus>[0] => {
  switch (state) {
    case "connected":
      return "connected";
    case "connecting":
    case "authenticating":
    case "reconnecting":
      return "connecting";
    case "auth_failed":
    case "error":
      return "error";
    case "unauthenticated":
    case "disconnected":
    default:
      return "disconnected";
  }
};

export const REMOTE_TYPING_TTL_MS = 5_000;

/**
 * Mốc hết hạn "đang gõ". Chỉ tin mốc từ server khi nó còn ở tương lai; mốc đã
 * qua hoặc không đọc được thì lùi về TTL cục bộ, nếu không chỉ báo sẽ kẹt lại
 * vĩnh viễn trên màn hình.
 */
export const parseTypingExpiryMs = (expiresAt: string | null): number => {
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > Date.now()) {
    return parsed;
  }
  return Date.now() + REMOTE_TYPING_TTL_MS;
};

export const normalizeDeviceType = (
  value: string | null,
): "web" | "mobile" | "desktop" =>
  value === "mobile" || value === "desktop" ? value : "web";
