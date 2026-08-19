import apiClient from "../lib/axios";

export type BackendNotificationType =
  | "FRIEND_REQUEST_RECEIVED"
  | "FRIEND_REQUEST_ACCEPTED"
  | "ADDED_TO_GROUP"
  | "REMOVED_FROM_GROUP"
  | "GROUP_ROLE_CHANGED"
  | "GROUP_INVITE_RECEIVED"
  | "GROUP_JOIN_APPROVED"
  | "MENTIONED_IN_MESSAGE";

export type NotificationTargetType =
  | "friend_request"
  | "user_profile"
  | "conversation"
  | "group_invite"
  | "message"
  | "group_setting";

export interface BackendNotification {
  id: string;
  type: BackendNotificationType;
  title: string;
  body: string | null;
  targetType: NotificationTargetType | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  actorUserId: string | null;
}

export interface ListNotificationsResponse {
  success: boolean;
  data: BackendNotification[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Đổi mọi tên thật trong title/body của một thông báo sang "tên gợi nhớ" của
 * người xem. BE luôn nướng tên thật vào chữ (alias là nhãn riêng, BE không biết),
 * nên việc đổi bắt buộc phải làm ở client.
 *
 * Hai thứ được đổi, cả hai đều **thay đúng chuỗi BE đã ghi**, không đoán:
 * 1. Tên NGƯỜI GỬI — lấy từ `metadata.senderName`.
 * 2. Tag `@` trong nội dung — lấy từ `metadata.mentions` (BE ship 30-07-26).
 *    Thiếu field này (thông báo cũ) thì bỏ qua, hiện tên thật như trước.
 *
 * Áp trong đúng một mapper `backendToItem` → phủ cả lần tải đầu lẫn realtime.
 */
export const applyAliasToNotification = (
  n: BackendNotification,
  aliasByUserId: Record<string, string | null | undefined>,
): { title: string; body: string | null } => {
  const replacements: [string, string][] = [];

  // Tag đứng TRƯỚC tên người gửi trong danh sách: người gửi và người bị tag có
  // thể trùng tên thật, khi đó "@Tên" phải ăn theo alias của người BỊ TAG.
  const mentions = Array.isArray(n.metadata?.mentions)
    ? n.metadata.mentions
    : [];
  for (const mention of mentions) {
    if (!mention || typeof mention !== "object") continue;
    const { userId, displayName } = mention as {
      userId?: unknown;
      displayName?: unknown;
    };
    if (typeof userId !== "string" || typeof displayName !== "string") continue;
    const alias = aliasByUserId[userId]?.trim();
    if (!alias || alias === displayName) continue;
    // Kèm '@' để chỉ đụng vào tag, không đụng tên xuất hiện trong câu chữ thường.
    replacements.push([`@${displayName}`, `@${alias}`]);
  }

  const bakedName =
    typeof n.metadata?.senderName === "string" ? n.metadata.senderName : null;
  const senderAlias = n.actorUserId
    ? aliasByUserId[n.actorUserId]?.trim() || null
    : null;
  if (bakedName && senderAlias && bakedName !== senderAlias) {
    replacements.push([bakedName, senderAlias]);
  }

  if (replacements.length === 0) {
    return { title: n.title, body: n.body ?? null };
  }

  // Quét MỘT LƯỢT: mỗi vị trí chỉ khớp đúng một lần. Thay tuần tự từng cặp sẽ
  // để lượt sau ăn lại kết quả lượt trước — tag bị gán nhầm alias người gửi.
  //
  // Chuỗi dài match trước, để "@An Nguyen" không bị "An" ăn mất một nửa.
  // `sort` của JS ổn định, nên khi dài bằng nhau thì giữ nguyên thứ tự đưa vào —
  // tag đã được push trước tên người gửi, tag thắng. Đúng ý định.
  const ordered = [...replacements].sort((a, b) => b[0].length - a[0].length);
  const pattern = new RegExp(
    ordered
      .map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g",
  );
  // Dựng NGƯỢC rồi để cặp ĐẦU ghi đè cuối cùng: `new Map(ordered)` giữ cặp SAU,
  // tức tên người gửi sẽ thắng tag khi hai bên trùng hệt chuỗi nguồn — ngược ý
  // định. Ca này chỉ xảy ra khi tag và tên người gửi giống nhau từng ký tự.
  const bySource = new Map([...ordered].reverse());
  const swap = (s: string | null) =>
    s === null ? null : s.replace(pattern, (hit) => bySource.get(hit) ?? hit);

  return { title: swap(n.title) ?? n.title, body: swap(n.body ?? null) };
};

export interface UnreadCountResponse {
  success: boolean;
  data: { unreadCount: number };
}

export interface MarkReadResponse {
  success: boolean;
  data: BackendNotification | null;
}

export const notificationApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    status?: "all" | "unread";
  }): Promise<ListNotificationsResponse> => {
    const { data } = await apiClient.get<ListNotificationsResponse>(
      "/notifications",
      { params },
    );
    return data;
  },

  getUnreadCount: async (): Promise<number> => {
    const { data } = await apiClient.get<UnreadCountResponse>(
      "/notifications/unread-count",
    );
    return data.data.unreadCount;
  },

  markRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await apiClient.patch("/notifications/read-all");
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/notifications/${id}`);
  },
};
