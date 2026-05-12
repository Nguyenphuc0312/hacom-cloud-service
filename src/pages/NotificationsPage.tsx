import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";

import { AppPage, AppPageBody, AppPageHeader } from "../components/layout/AppPage";
import { Badge } from "../components/common/Badge";
import { Button, EmptyState } from "../components/ui";
import {
  matchesFilter,
  useNotificationStore,
  useNotificationUnreadCount,
  type NotificationFilter,
  type NotificationItem,
} from "../features/notification/state/notificationStore";
import {
  dispatchNotificationClick,
  dispatchContactProfileView,
} from "../features/chat/events/chatUiEvents";
import { notificationApi } from "../services/notificationApi";
import { formatRelativeTime } from "../utils/formatTime";
import { ROUTE_PATHS } from "../router/paths";
import { logger } from "../utils/logger";

const filterOrder: NotificationFilter[] = ["all", "unread", "message", "mention", "group_activity", "system"];

const getFilterLabel = (
  filter: NotificationFilter,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  switch (filter) {
    case "unread":
      return t("notifications.filter.unread", { defaultValue: "Chưa đọc" });
    case "message":
      return t("notifications.filter.message", { defaultValue: "Tin nhắn" });
    case "mention":
      return t("notifications.filter.mention", { defaultValue: "Nhắc đến" });
    case "group_activity":
      return t("notifications.filter.groupActivity", { defaultValue: "Hoạt động nhóm" });
    case "system":
      return t("notifications.filter.system", { defaultValue: "Hệ thống" });
    case "all":
    default:
      return t("notifications.filter.all", { defaultValue: "Tất cả" });
  }
};

const NotificationKindIcon: React.FC<{ item: NotificationItem }> = ({ item }) => {
  switch (item.kind) {
    case "mention":
      return <AtSymbolIcon className="h-5 w-5" />;
    case "group_activity":
      return <SpeakerWaveIcon className="h-5 w-5" />;
    case "system":
      return <BellIcon className="h-5 w-5" />;
    case "message":
    default:
      return <ChatBubbleLeftRightIcon className="h-5 w-5" />;
  }
};

const NotificationsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const items = useNotificationStore((state) => state.items);
  const activeFilter = useNotificationStore((state) => state.activeFilter);
  const setFilter = useNotificationStore((state) => state.setFilter);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const upsertNotification = useNotificationStore((state) => state.upsertNotification);
  const unreadCount = useNotificationUnreadCount();

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  const filteredItems = items.filter((item) => matchesFilter(item, activeFilter));

  const loadPage = useCallback(
    async (page: number) => {
      try {
        const status = activeFilter === "unread" ? "unread" : "all";
        const res = await notificationApi.list({ page, limit: 30, status });
        res.data.forEach((n) => {
          upsertNotification({
            id: n.id,
            kind:
              n.type === "MENTIONED_IN_MESSAGE"
                ? "mention"
                : n.type === "ADDED_TO_GROUP" ||
                    n.type === "REMOVED_FROM_GROUP" ||
                    n.type === "GROUP_ROLE_CHANGED" ||
                    n.type === "GROUP_INVITE_RECEIVED" ||
                    n.type === "GROUP_JOIN_APPROVED"
                  ? "group_activity"
                  : n.type === "FRIEND_REQUEST_RECEIVED" ||
                      n.type === "FRIEND_REQUEST_ACCEPTED"
                    ? "system"
                    : "message",
            title: n.title,
            body: n.body ?? "",
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
          });
        });
        setHasMore(res.meta.hasNext);
      } catch (err) {
        logger.warn("notifications", "load_page_failed", { page, error: err });
      }
    },
    [activeFilter, upsertNotification],
  );

  const [prevLoadPage, setPrevLoadPage] = useState(() => loadPage);

  if (loadPage !== prevLoadPage) {
    setPrevLoadPage(() => loadPage);
    pageRef.current = 1;
    setHasMore(true);
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadPage(1);
    }, 0);
    return () => clearTimeout(timeout);
  }, [loadPage]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const next = pageRef.current + 1;
      await loadPage(next);
      pageRef.current = next;
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, loadPage]);

  const handleMarkAllRead = useCallback(async () => {
    markAllAsRead(activeFilter);
    try {
      await notificationApi.markAllRead();
    } catch (err) {
      logger.warn("notifications", "mark_all_read_failed", { error: err });
    }
  }, [markAllAsRead, activeFilter]);

  const handleSelectItem = useCallback(
    async (item: NotificationItem) => {
      if (!item.isRead) {
        markAsRead(item.id);
        try {
          await notificationApi.markRead(item.id);
        } catch (err) {
          logger.warn("notifications", "mark_read_failed", { id: item.id, error: err });
        }
      }

      const { targetType, conversationId, messageId, actorId } = item;

      if (conversationId) {
        dispatchNotificationClick({ conversationId, messageId });
        navigate(ROUTE_PATHS.CHAT);
      } else if (targetType === "friend_request" || targetType === "group_invite") {
        navigate(ROUTE_PATHS.FRIENDS);
      } else if (targetType === "user_profile") {
        if (actorId) {
          dispatchContactProfileView({ userId: actorId });
        }
        navigate(ROUTE_PATHS.FRIENDS);
      }
    },
    [markAsRead, navigate],
  );

  const hasUnread = unreadCount > 0;

  return (
    <AppPage layout="narrow">
      <AppPageHeader
        title={t("notifications.panelTitle", { defaultValue: "Thông báo" })}
        subtitle={t("notifications.panelSubtitle", {
          defaultValue: "Lời nhắc, tin nhắn và hoạt động",
        })}
        actions={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!hasUnread}
            onClick={() => void handleMarkAllRead()}
          >
            {t("notifications.actions.markAllRead", { defaultValue: "Đánh dấu đã đọc" })}
          </Button>
        }
      />

      <AppPageBody>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {filterOrder.map((filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setFilter(filter)}
                  className={clsx(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-micro",
                    isActive
                      ? "border-primary/25 bg-primary/12 text-primary"
                      : "border-border/70 bg-surface text-text-secondary hover:bg-surface-hover",
                  )}
                >
                  {getFilterLabel(filter, t)}
                </button>
              );
            })}
          </div>

          {filteredItems.length === 0 ? (
            <EmptyState
              title={t("notifications.empty.title", { defaultValue: "Không có thông báo" })}
              description={t("notifications.empty.description", {
                defaultValue: "Các sự kiện, nhắc đến và hoạt động sẽ xuất hiện ở đây.",
              })}
            />
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleSelectItem(item)}
                  className={clsx(
                    "flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                    item.isRead
                      ? "border-transparent bg-transparent hover:bg-surface-hover"
                      : "border-primary/10 bg-primary/6 hover:bg-primary/10",
                  )}
                >
                  <div
                    className={clsx(
                      "mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      item.kind === "mention"
                        ? "bg-danger/10 text-danger"
                        : item.kind === "group_activity"
                          ? "bg-warning/12 text-warning"
                          : item.kind === "system"
                            ? "bg-secondary/12 text-secondary"
                            : "bg-primary/12 text-primary",
                    )}
                  >
                    <NotificationKindIcon item={item} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {item.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-text-secondary">
                          {item.body}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!item.isRead && <Badge dot variant="primary" />}
                        <span className="whitespace-nowrap text-xs text-text-muted">
                          {formatRelativeTime(new Date(item.createdAt))}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {hasMore && (
                <div className="pt-2 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleLoadMore()}
                    isLoading={isLoadingMore}
                  >
                    {t("common:actions.loadMore", { defaultValue: "Tải thêm" })}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </AppPageBody>
    </AppPage>
  );
};

export default NotificationsPage;
