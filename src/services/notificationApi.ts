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
 * Swap the actor's real name baked into a notification's title/body with the
 * viewer's "tên gợi nhớ" (alias). BE stores the exact baked name in
 * metadata.senderName, so this is an exact-substring replace (not a guess).
 * Applied in the single backendToItem mapper → covers initial load + realtime.
 * ponytail: FE interim — durable fix is BE rendering alias-aware notifications
 * (tracked in FE__contact-alias-notifications contract).
 */
export const applyAliasToNotification = (
  n: BackendNotification,
  aliasByUserId: Record<string, string | null | undefined>,
): { title: string; body: string | null } => {
  const bakedName =
    typeof n.metadata?.senderName === "string" ? n.metadata.senderName : null;
  const alias = n.actorUserId ? aliasByUserId[n.actorUserId] ?? null : null;
  if (!bakedName || !alias || bakedName === alias) {
    return { title: n.title, body: n.body ?? null };
  }
  const swap = (s: string | null) => (s ? s.split(bakedName).join(alias) : s);
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
