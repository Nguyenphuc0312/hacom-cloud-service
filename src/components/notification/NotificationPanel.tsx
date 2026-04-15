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
  useFilteredNotifications,
  useNotificationStore,
  type NotificationFilter,
  type NotificationItem,
} from "../../features/notification/state/notificationStore";
import { formatRelativeTime } from "../../utils/formatTime";

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
  const items = useFilteredNotifications();
  const {
    activeFilter,
    setFilter,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useNotificationStore((state) => ({
    activeFilter: state.activeFilter,
    setFilter: state.setFilter,
    markAsRead: state.markAsRead,
    markAllAsRead: state.markAllAsRead,
    clearNotifications: state.clearNotifications,
  }));

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
    (item: NotificationItem) => {
      markAsRead(item.id);

      if (typeof window !== "undefined" && item.conversationId) {
        window.dispatchEvent(
          new CustomEvent("chat:notification:clicked", {
            detail: {
              conversationId: item.conversationId,
              messageId: item.messageId,
            },
          }),
        );
      }

      onClose();
    },
    [markAsRead, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={clsx(
        "absolute right-3 top-[calc(100%+0.5rem)] z-[65] flex w-[min(26rem,calc(100vw-1.5rem))] max-w-full flex-col overflow-hidden rounded-[1.75rem] border border-border/80 bg-surface shadow-elev3 backdrop-blur",
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

      <div className="max-h-[28rem] overflow-y-auto p-2">
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
                  "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-micro",
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
