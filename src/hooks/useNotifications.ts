import { useEffect, useCallback, useRef } from "react";
import { WebSocketEvents } from "../lib/socket";
import wsManager from "../lib/socket";
import {
  useNotificationStore,
  useNotificationUnreadCount,
} from "../features/notification/state/notificationStore";
import type { NotificationItem } from "../features/notification/state/notificationStore";
import {
  notificationApi,
  type BackendNotification,
  type BackendNotificationType,
} from "../services/notificationApi";
import { logger } from "../utils/logger";

const backendTypeToKind = (
  type: BackendNotificationType,
): NotificationItem["kind"] => {
  switch (type) {
    case "FRIEND_REQUEST_RECEIVED":
    case "FRIEND_REQUEST_ACCEPTED":
      return "system";
    case "ADDED_TO_GROUP":
    case "REMOVED_FROM_GROUP":
    case "GROUP_ROLE_CHANGED":
    case "GROUP_INVITE_RECEIVED":
    case "GROUP_JOIN_APPROVED":
      return "group_activity";
    case "MENTIONED_IN_MESSAGE":
      return "mention";
    default:
      return "system";
  }
};

const backendToItem = (n: BackendNotification): NotificationItem => ({
  id: n.id,
  kind: backendTypeToKind(n.type),
  title: n.title,
  body: n.body ?? "",
  createdAt: n.createdAt,
  isRead: n.readAt !== null,
  readAt: n.readAt,
  conversationId:
    n.targetType === "conversation" ? (n.targetId ?? undefined) : undefined,
  actorId: n.actorUserId,
});

export const useNotifications = (isAuthenticated: boolean) => {
  const { upsertNotification, markAsRead, markAllAsRead } =
    useNotificationStore();
  const unreadCount = useNotificationUnreadCount();
  const initializedRef = useRef(false);

  const fetchInitial = useCallback(async () => {
    try {
      const [notifications, count] = await Promise.all([
        notificationApi.list({ page: 1, limit: 30 }),
        notificationApi.getUnreadCount(),
      ]);
      notifications.data.forEach((n) => upsertNotification(backendToItem(n)));
      // Sync the store count with server count if different (resync after reconnect)
      useNotificationStore.setState((state) => {
        const localUnread = state.items.filter((i) => !i.isRead).length;
        if (localUnread !== count && count === 0) {
          return {
            items: state.items.map((i) => ({
              ...i,
              isRead: true,
              readAt: i.readAt ?? new Date().toISOString(),
            })),
          };
        }
        return {};
      });
    } catch (err) {
      logger.warn("useNotifications: failed to fetch initial notifications");
    }
  }, [upsertNotification]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    void fetchInitial();
  }, [isAuthenticated, fetchInitial]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const handleNotificationCreated = (data: unknown) => {
      if (!data || typeof data !== "object") return;
      const payload = data as BackendNotification;
      if (!payload.id || !payload.type) return;
      upsertNotification(backendToItem(payload));
    };

    const socket = wsManager;
    socket.on(WebSocketEvents.NOTIFICATION_CREATED, handleNotificationCreated);

    return () => {
      socket.off?.(
        WebSocketEvents.NOTIFICATION_CREATED,
        handleNotificationCreated,
      );
    };
  }, [isAuthenticated, upsertNotification]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      markAsRead(id);
      try {
        await notificationApi.markRead(id);
      } catch (err) {
        logger.warn("useNotifications: failed to mark notification read");
      }
    },
    [markAsRead],
  );

  const handleMarkAllRead = useCallback(async () => {
    markAllAsRead();
    try {
      await notificationApi.markAllRead();
    } catch (err) {
      logger.warn("useNotifications: failed to mark all notifications read");
    }
  }, [markAllAsRead]);

  const refetch = useCallback(() => void fetchInitial(), [fetchInitial]);

  return {
    unreadCount,
    markRead: handleMarkRead,
    markAllRead: handleMarkAllRead,
    refetch,
  };
};
