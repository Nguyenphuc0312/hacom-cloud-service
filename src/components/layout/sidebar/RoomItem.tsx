import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { GroupAvatar } from "../../common/GroupAvatar";
import { usePresenceStore } from "../../../stores";
import type { UserStatus } from "../../../types";
import type { SidebarConversationItemViewModel } from "../../../features/chat/hooks/useSidebarConversationList";

interface RoomItemProps {
  item: SidebarConversationItemViewModel;
  currentUserId: string;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

const resolvePresenceStatus = (
  presenceState: string | undefined,
  fallbackStatus: string | undefined,
): UserStatus | undefined => {
  const nextStatus = presenceState || fallbackStatus;
  if (
    nextStatus === "online" ||
    nextStatus === "offline" ||
    nextStatus === "away" ||
    nextStatus === "idle" ||
    nextStatus === "dnd" ||
    nextStatus === "busy" ||
    nextStatus === "invisible"
  ) {
    return nextStatus as UserStatus;
  }

  return undefined;
};

const BaseRoomItem: React.FC<RoomItemProps> = ({
  item,
  currentUserId,
  isActive,
  isKeyboardActive,
  onSelect,
}) => {
  const { t } = useTranslation();
  const presenceState = usePresenceStore(
    useMemo(
      () => (state) =>
        item.directPartnerId
          ? state.presenceMap[item.directPartnerId]?.state
          : undefined,
      [item.directPartnerId],
    ),
  );
  const avatarStatus = resolvePresenceStatus(
    presenceState,
    item.conversation.otherUser?.status,
  );

  const previewToneClass = (() => {
    if (item.previewState === "failed") {
      return "text-danger";
    }

    if (item.previewState || item.hasUnreadMention || item.unreadCount > 0) {
      return "text-text-secondary";
    }

    return "text-text-muted";
  })();

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      role="option"
      aria-selected={isActive}
      className={clsx(
        "group relative mx-2 my-1 flex h-[var(--size-room-item)] w-[calc(100%-var(--space-4))] items-center rounded-[1.15rem] px-3.5",
        "transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isActive
          ? "bg-primary/8 shadow-[inset_0_0_0_1px_hsl(var(--color-primary)/0.08)]"
          : "hover:bg-surface-hover/80",
        !isActive && isKeyboardActive && "bg-surface-overlay",
      )}
      aria-label={item.displayName}
    >
      <span
        className={clsx(
          "absolute bottom-2 left-1.5 top-2 w-0.5 rounded-full transition-fast",
          isActive ? "bg-primary opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3">
        {item.isDirect ? (
          <Avatar
            src={item.avatarSrc}
            alt={item.displayName}
            size="lg"
            status={avatarStatus}
            showStatus
          />
        ) : (
          <GroupAvatar
            conversation={item.conversation}
            currentUserId={currentUserId}
            size="lg"
          />
        )}

        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-5 text-text-primary">
            {item.displayName}
          </p>

          <p
            className={clsx(
              "truncate pr-1 text-[13px] leading-5 text-start",
              item.previewState === "failed" ? "font-medium" : "font-normal",
              previewToneClass,
            )}
          >
            {item.previewText || t("sidebar:room.noMessagesYet")}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-start gap-2 py-1">
          <span className="text-[12px] tabular-nums text-text-muted">
            {item.timeLabel}
          </span>

          {item.unreadCount > 0 ? (
            <span
              className={clsx(
                "sidebar-unread-badge inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none text-text-inverse",
                item.hasUnreadMention
                  ? "bg-danger"
                  : item.conversation.isMuted
                    ? "bg-text-muted"
                    : "bg-primary",
              )}
            >
              {item.unreadLabel}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
};

export const RoomItem = React.memo(
  BaseRoomItem,
  (prev, next) =>
    prev.item === next.item &&
    prev.currentUserId === next.currentUserId &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.onSelect === next.onSelect,
);

export default RoomItem;
