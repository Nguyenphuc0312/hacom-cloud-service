import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  BellIcon,
  ChatBubbleLeftRightIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";

import { Badge } from "../common/Badge";
import { Button, EmptyState } from "../ui";
import {
  matchesFilter,
  useNotificationStore,
  type NotificationFilter,
  type NotificationItem,
} from "../../features/notification/state/notificationStore";
import { dispatchNotificationClick } from "../../features/chat/events/chatUiEvents";
import { formatRelativeTime } from "../../utils/formatTime";
import { useChatStore } from "../../stores/chatStore";
import { sortConversationsByActivity } from "../../utils/conversationRanking";

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const filterOrder: NotificationFilter[] = [
  "all",
  "unread",
  "message",
  "mention",
  "group_activity",
  "system",
];

const getFilterLabel = (
  filter: NotificationFilter,
  t: (key: string, options?: Record<string, unknown>) => string,
): string => {
  switch (filter) {
    case "unread":
      return t("notifications.filter.unread", { defaultValue: "Unread" });
    case "message":
      return t("notifications.filter.message", { defaultValue: "Messages" });
    case "mention":
      return t("notifications.filter.mention", { defaultValue: "Mentions" });
    case "group_activity":
      return t("notifications.filter.groupActivity", {
        defaultValue: "Group activity",
      });
    case "system":
      return t("notifications.filter.system", { defaultValue: "System" });
    case "all":
    default:
      return t("notifications.filter.all", { defaultValue: "All" });
  }
};

const NotificationKindIcon: React.FC<{ item: NotificationItem }> = ({
  item,
}) => {
  switch (item.kind) {
    case "mention":
      return <AtSymbolIcon className="h-4 w-4" />;
    case "group_activity":
      return <SpeakerWaveIcon className="h-4 w-4" />;
    case "system":
      return <BellIcon className="h-4 w-4" />;
    case "message":
    default:
      return <ChatBubbleLeftRightIcon className="h-4 w-4" />;
  }
};

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  className,
}) => {
  const { t } = useTranslation();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const notificationItems = useNotificationStore((state) => state.items);
  const activeFilter = useNotificationStore((state) => state.activeFilter);
  const setFilter = useNotificationStore((state) => state.setFilter);
  const markAsRead = useNotificationStore((state) => state.markAsRead);
  const markAllAsRead = useNotificationStore((state) => state.markAllAsRead);
  const clearNotifications = useNotificationStore(
    (state) => state.clearNotifications,
  );
  const conversations = useChatStore((state) => state.conversations);

  const items = React.useMemo(() => {
    const conversationItems =
      activeFilter === "all" || activeFilter === "unread" || activeFilter === "message"
        ? sortConversationsByActivity(
            conversations.filter((conversation) => (conversation.unreadCount ?? 0) > 0),
          ).map((conversation) => {
            const activityAt =
              conversation.lastMessageSortAt ??
              conversation.lastActivityAt ??
              conversation.lastMessage?.createdAt ??
              conversation.updatedAt;
            const title =
              conversation.displayName ||
              conversation.name ||
              t("chat:conversation.untitled", {
                defaultValue: "Conversation",
              });
            const body =
              conversation.lastMessage?.content ||
              t("notifications.conversationFallback", {
                defaultValue: "{{count}} unread message(s)",
                count: conversation.unreadCount ?? 0,
              });

            return {
              id: `conversation-unread:${conversation.id}`,
              kind: "message" as const,
              title,
              body,
              createdAt: new Date(activityAt ?? conversation.updatedAt).toISOString(),
              isRead: false,
              readAt: null,
              conversationId: conversation.id,
              messageId: conversation.lastMessage?.id,
              actorId: conversation.lastMessage?.senderId ?? null,
              source: "conversation" as const,
            };
          })
        : [];

    const transientItems = notificationItems
      .filter((item) => matchesFilter(item, activeFilter))
      .map((item) => ({
        ...item,
        source: "transient" as const,
      }));

    return [...conversationItems, ...transientItems].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
  }, [activeFilter, conversations, notificationItems, t]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (panelRef.current.contains(event.target as Node)) return;
      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSelectItem = React.useCallback(
    (item: NotificationItem & { source?: "conversation" | "transient" }) => {
      if (item.source !== "conversation") {
        markAsRead(item.id);
      }

      if (item.conversationId) {
        dispatchNotificationClick({
          conversationId: item.conversationId,
          messageId: item.messageId,
        });
      }

      onClose();
    },
    [markAsRead, onClose],
  );

  if (!isOpen) return null;

  const hasTransientItems = items.some((item) => item.source !== "conversation");

  return (
    <div
      ref={panelRef}
      className={clsx(
        "absolute right-4 top-[calc(100%+0.5rem)] z-[65] flex w-[min(25rem,calc(100vw-2rem))] max-w-full flex-col overflow-hidden rounded-[1.25rem] border border-border/80 bg-surface shadow-elev3",
        className,
      )}
      role="dialog"
      aria-label={t("notifications.panelTitle", {
        defaultValue: "Notifications",
      })}
    >
      <div className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t("notifications.panelTitle", {
                defaultValue: "Notifications",
              })}
            </h3>
            <p className="text-xs text-text-muted">
              {t("notifications.panelSubtitle", {
                defaultValue: "Mentions, messages and conversation activity",
              })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!hasTransientItems}
              onClick={() => markAllAsRead(activeFilter)}
            >
              {t("notifications.actions.markAllRead", {
                defaultValue: "Mark read",
              })}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={!hasTransientItems}
              onClick={() => clearNotifications(activeFilter)}
            >
              {t("notifications.actions.clear", {
                defaultValue: "Clear",
              })}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
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
      </div>

      <div className="sidebar-scrollbar max-h-[28rem] overflow-y-auto p-2">
        {items.length === 0 ? (
          <EmptyState
            title={t("notifications.empty.title", {
              defaultValue: "No notifications",
            })}
            description={t("notifications.empty.description", {
              defaultValue:
                "Realtime events, mentions and system activity will appear here.",
            })}
            className="border-0 bg-transparent shadow-none"
          />
        ) : (
          <div className="space-y-1.5">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectItem(item)}
                className={clsx(
                  "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
                  item.isRead
                    ? "border-transparent bg-transparent hover:bg-surface-hover"
                    : "border-primary/10 bg-primary/6 hover:bg-primary/10",
                )}
              >
                <div
                  className={clsx(
                    "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
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
                      <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-secondary">
                        {item.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!item.isRead && <Badge dot variant="primary" />}
                      <span className="text-[11px] text-text-muted">
                        {formatRelativeTime(new Date(item.createdAt))}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;
