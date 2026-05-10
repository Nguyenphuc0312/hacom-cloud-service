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
