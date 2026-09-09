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
  applyAliasToNotification,
  type BackendNotification,
  type BackendNotificationType,
} from "../services/notificationApi";
import { aliasByUserId } from "../utils/mentionAliasText";
import { logger } from "../utils/logger";
import {
  emitBrowserNotification,
  isDocumentVisibleAndFocused,
} from "../utils/realtimeNotifications";
import { useSettingsStore } from "../settings/settingsStore";

const CHAT_REALTIME_NOTIFICATION_TYPES = new Set<string>([
  "MENTIONED_IN_MESSAGE",
  "ADDED_TO_GROUP",
  "REMOVED_FROM_GROUP",
  "GROUP_ROLE_CHANGED",
  "GROUP_INVITE_RECEIVED",
  "GROUP_JOIN_APPROVED",
]);

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

const backendToItem = (n: BackendNotification): NotificationItem => {
  const { title, body } = applyAliasToNotification(n, aliasByUserId());
  return {
  id: n.id,
  kind: backendTypeToKind(n.type),
  title,
  body: body ?? "",
  createdAt: n.createdAt,
  isRead: n.readAt !== null,
  readAt: n.readAt,
  conversationId:
    n.targetType === "conversation" || n.targetType === "group_setting"
      ? (n.targetId ?? undefined)
      : undefined,
  messageId:
    n.targetType === "message" ? (n.targetId ?? undefined) : undefined,
  actorId: n.actorUserId,
  targetType: n.targetType ?? undefined,
  targetId: n.targetId ?? undefined,
  };
};

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
      logger.warn("notifications", "initial_fetch_failed", err);
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
      const item = backendToItem(payload);
      upsertNotification(item);

      // Chat/group events already have richer conversation-aware notifications
      // in useWebSocket. Everything else shares this path: friend requests and
      // future server-side notifications such as AI workflows.
      if (
        CHAT_REALTIME_NOTIFICATION_TYPES.has(payload.type) ||
        item.isRead ||
        isDocumentVisibleAndFocused()
      ) {
        return;
      }

      const preferences = useSettingsStore.getState().notifications;
      if (!preferences.enabled) return;

      emitBrowserNotification({
        id: item.id,
        tag: `notification:${item.id}`,
        title: item.title || "Thông báo mới",
        body: preferences.messagePreview
          ? item.body || "Bạn có thông báo mới."
          : "Bạn có thông báo mới.",
        silent: !preferences.sound,
      });
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
        logger.warn("notifications", "mark_read_failed", {
          notificationId: id,
          error: err,
        });
      }
    },
    [markAsRead],
  );

  const handleMarkAllRead = useCallback(async () => {
    markAllAsRead();
    try {
      await notificationApi.markAllRead();
    } catch (err) {
      logger.warn("notifications", "mark_all_read_failed", err);
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
