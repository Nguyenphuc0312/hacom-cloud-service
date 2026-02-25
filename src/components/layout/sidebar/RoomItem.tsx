import React, { useMemo } from "react";
import clsx from "clsx";
import {
  AtSymbolIcon,
  BookmarkIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
import { Avatar } from "../../common/Avatar";
import { Badge } from "../../common/Badge";
import type { Conversation, UserSummary } from "../../../types";
import { RoomType } from "../../../types";
import { formatRelativeTime } from "../../../utils/formatTime";
import { getMessagePreview } from "../../../utils/messageHelpers";

interface RoomItemProps {
  conversation: Conversation;
  currentUser: UserSummary;
  collapsed: boolean;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

const getDirectPartner = (
  conversation: Conversation,
  currentUserId: string,
): UserSummary | undefined =>
  (conversation.participants || []).find(
    (participant) => participant.id !== currentUserId,
  );

const getDisplayName = (
  conversation: Conversation,
  currentUser: UserSummary,
): string => {
  if (
    conversation.type !== RoomType.PRIVATE &&
    conversation.type !== RoomType.DIRECT
  ) {
    return conversation.name || "Conversation";
  }

  const directPartner = getDirectPartner(conversation, currentUser.id);
  return (
    directPartner?.displayName ||
    directPartner?.username ||
    conversation.name ||
    "Conversation"
  );
};

const normalizeMentionToken = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, "");
};

const hasMention = (
  conversation: Conversation,
  currentUser: UserSummary,
): boolean => {
  if ((conversation.unreadCount || 0) <= 0) return false;
  if (
    !conversation.lastMessage ||
    conversation.lastMessage.senderId === currentUser.id
  ) {
    return false;
  }

  const content = conversation.lastMessage.content || "";
  const normalizedContent = content.toLowerCase().replace(/\s+/g, "");
  const usernameToken = normalizeMentionToken(currentUser.username);
  const displayNameToken = normalizeMentionToken(currentUser.displayName);

  if (/@(all|channel|here)\b/i.test(content)) return true;

  if (usernameToken && normalizedContent.includes(`@${usernameToken}`)) {
    return true;
  }

  if (displayNameToken && normalizedContent.includes(`@${displayNameToken}`)) {
    return true;
  }

  return false;
};

const BaseRoomItem: React.FC<RoomItemProps> = ({
  conversation,
  currentUser,
  collapsed,
  isActive,
  isKeyboardActive,
  onSelect,
}) => {
  const directPartner = useMemo(
    () => getDirectPartner(conversation, currentUser.id),
    [conversation, currentUser.id],
  );
  const displayName = useMemo(
    () => getDisplayName(conversation, currentUser),
    [conversation, currentUser],
  );
  const previewText = useMemo(
    () => getMessagePreview(conversation.lastMessage, currentUser.id, 44),
    [conversation.lastMessage, currentUser.id],
  );
  const timeLabel = useMemo(() => {
    if (!conversation.lastMessage?.createdAt) return "";
    return formatRelativeTime(new Date(conversation.lastMessage.createdAt));
  }, [conversation.lastMessage]);

  const unreadCount = conversation.unreadCount || 0;
  const unreadMention = hasMention(conversation, currentUser);

  const avatarSrc =
    conversation.type === RoomType.PRIVATE || conversation.type === RoomType.DIRECT
      ? directPartner?.avatar || conversation.avatar
      : conversation.avatar;
  const avatarStatus =
    conversation.type === RoomType.PRIVATE || conversation.type === RoomType.DIRECT
      ? directPartner?.status
      : undefined;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={clsx(
          "group relative mx-2 my-1 flex h-room-item w-room-item items-center justify-center rounded-lg",
          "transition-colors",
          "hover:bg-surface-overlay",
          (isActive || isKeyboardActive) && "bg-primary/15 text-primary",
        )}
        aria-label={displayName}
        title={displayName}
      >
        <Avatar
          src={avatarSrc}
          alt={displayName}
          size="md"
          status={avatarStatus}
          showStatus={
            conversation.type === RoomType.PRIVATE ||
            conversation.type === RoomType.DIRECT
          }
        />

        {unreadCount > 0 && (
          <span className="absolute right-2 top-2">
            <Badge
              count={unreadCount}
              size="sm"
              variant={unreadMention ? "danger" : "primary"}
            />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={clsx(
        "mx-2 my-1 flex h-room-item w-[calc(100%-var(--space-4))] items-center rounded-lg px-3",
        "transition-colors",
        "hover:bg-surface-overlay",
        (isActive || isKeyboardActive) && "bg-primary/15",
      )}
      aria-label={displayName}
    >
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3">
        <Avatar
          src={avatarSrc}
          alt={displayName}
          size="md"
          status={avatarStatus}
          showStatus={
            conversation.type === RoomType.PRIVATE ||
            conversation.type === RoomType.DIRECT
          }
        />

        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <p
              className={clsx(
                "truncate text-sm leading-5 text-text-primary",
                unreadCount > 0 && "font-semibold",
              )}
            >
              {displayName}
            </p>

            {conversation.isMuted && (
              <SpeakerXMarkIcon
                className="h-4 w-4 shrink-0 text-text-muted"
                aria-hidden="true"
              />
            )}
            {conversation.isPinned && (
              <BookmarkIcon
                className="h-4 w-4 shrink-0 text-text-muted"
                aria-hidden="true"
              />
            )}
            {unreadMention && (
              <AtSymbolIcon
                className="h-4 w-4 shrink-0 text-danger"
                aria-label="Mentioned"
              />
            )}
          </div>

          <p
            className={clsx(
              "truncate text-xs leading-5",
              unreadCount > 0 ? "font-medium text-text-secondary" : "text-text-muted",
            )}
          >
            {previewText || "No messages yet"}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-between py-1">
          <span
            className={clsx(
              "text-xs leading-4",
              unreadCount > 0 ? "font-semibold text-primary" : "text-text-muted",
            )}
          >
            {timeLabel}
          </span>

          {unreadCount > 0 ? (
            <Badge
              count={unreadCount}
              size="sm"
              variant={
                unreadMention
                  ? "danger"
                  : conversation.isMuted
                    ? "muted"
                    : "primary"
              }
            />
          ) : (
            <span className="h-4" aria-hidden="true" />
          )}
        </div>
      </div>
    </button>
  );
};

export const RoomItem = React.memo(
  BaseRoomItem,
  (prev, next) =>
    prev.conversation === next.conversation &&
    prev.currentUser.id === next.currentUser.id &&
    prev.currentUser.username === next.currentUser.username &&
    prev.currentUser.displayName === next.currentUser.displayName &&
    prev.collapsed === next.collapsed &&
    prev.isActive === next.isActive &&
    prev.isKeyboardActive === next.isKeyboardActive &&
    prev.onSelect === next.onSelect,
);

export default RoomItem;

