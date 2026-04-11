import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  BookmarkIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
import { UserGroupIcon, UserIcon } from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { Badge } from "../../common/Badge";
import type { Conversation, UserSummary } from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import { formatRelativeTime } from "../../../utils/formatTime";
import { hasConversationMention } from "../../../utils/conversationRanking";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getMessagePreview,
  getMessagePreviewState,
  getOtherParticipant,
  getUserDisplayName,
} from "../../../utils/messageHelpers";

interface RoomItemProps {
  conversation: Conversation;
  currentUser: UserSummary;
  collapsed: boolean;
  isActive: boolean;
  isKeyboardActive: boolean;
  onSelect: (conversationId: string) => void;
}

const BaseRoomItem: React.FC<RoomItemProps> = ({
  conversation,
  currentUser,
  collapsed,
  isActive,
  isKeyboardActive,
  onSelect,
}) => {
  const { t } = useTranslation();
  const fallbackConversationName = t("common:labels.conversation");

  const directPartner = useMemo(
    () => getOtherParticipant(conversation, currentUser.id),
    [conversation, currentUser.id],
  );
  const displayName = useMemo(
    () =>
      getConversationDisplayName(conversation, currentUser.id) ||
      fallbackConversationName,
    [conversation, currentUser, fallbackConversationName],
  );
  const previewText = useMemo(() => {
    const lastMessage = conversation.lastMessage;
    if (!lastMessage) return "";

    const messagePreview = getMessagePreview(lastMessage, currentUser.id, 44);
    if (!messagePreview) return "";

    const senderParticipant = (conversation.participants || []).find(
      (participant) => participant.id === lastMessage.senderId,
    );

    const senderLabel =
      lastMessage.senderId === currentUser.id
        ? t("chat:message.you")
        : getUserDisplayName(senderParticipant) ||
          getUserDisplayName(directPartner) ||
          lastMessage.senderName?.trim() ||
          t("common:labels.conversation");

    return `${senderLabel}: ${messagePreview}`;
  }, [
    conversation.lastMessage,
    conversation.participants,
    currentUser.id,
    directPartner,
    t,
  ]);
  const previewState = useMemo(
    () => getMessagePreviewState(conversation.lastMessage, currentUser.id),
    [conversation.lastMessage, currentUser.id],
  );
  const timeLabel = useMemo(() => {
    if (!conversation.lastMessage?.createdAt) return "";
    return formatRelativeTime(new Date(conversation.lastMessage.createdAt));
  }, [conversation.lastMessage]);

  const unreadCount = conversation.unreadCount || 0;
  const unreadMention = hasConversationMention(conversation, currentUser);
  const isDirect = isDirectConversation(conversation);
  const conversationTypeLabel = isDirect
    ? t("sidebar:room.type.direct")
    : t("sidebar:room.type.group");
  const participantCountLabel =
    !isDirect && (conversation.participants?.length ?? 0) > 0
      ? t("chat:header.members", {
          count: conversation.participants?.length ?? 0,
        })
      : "";

  const avatarSrc = getConversationAvatar(conversation, currentUser.id);
  const avatarStatus = isDirect ? directPartner?.status : undefined;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        role="option"
        aria-selected={isActive}
        className={clsx(
          "group relative mx-2 my-1 flex h-room-item w-room-item items-center justify-center rounded-lg",
          "transition-micro",
          "hover:bg-surface-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          isActive && "bg-primary/14 text-primary ring-1 ring-primary/45",
          !isActive &&
            isKeyboardActive &&
            "bg-surface-overlay ring-1 ring-border",
        )}
        aria-label={displayName}
        title={displayName}
      >
        <Avatar
          src={avatarSrc}
          alt={displayName}
          size="md"
          status={avatarStatus}
          showStatus={isDirect}
        />

        {unreadCount > 0 && (
          <span className="absolute right-2 top-2">
            <Badge
              count={unreadCount}
              size="sm"
              variant={unreadMention ? "danger" : "primary"}
              className="min-w-5 text-caption"
            />
          </span>
        )}

        <span
          className={clsx(
            "absolute bottom-1.5 right-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border/70 bg-surface-raised text-text-muted",
            isActive && "text-primary",
          )}
          aria-label={conversationTypeLabel}
        >
          {isDirect ? (
            <UserIcon className="h-2.5 w-2.5" />
          ) : (
            <UserGroupIcon className="h-2.5 w-2.5" />
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      role="option"
      aria-selected={isActive}
      className={clsx(
        "relative mx-2 my-0.5 flex h-room-item w-[calc(100%-var(--space-4))] items-center rounded-lg px-2.5",
        "transition-micro",
        "hover:bg-surface-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isActive && "bg-primary/12 ring-1 ring-primary/35",
        !isActive &&
          isKeyboardActive &&
          "bg-surface-overlay ring-1 ring-border",
      )}
      aria-label={displayName}
    >
      {(isActive || unreadCount > 0) && (
        <span
          className={clsx(
            "absolute left-1 top-1/2 h-9 -translate-y-1/2 rounded-full",
            isActive ? "w-1 bg-primary" : "w-0.5 bg-primary/60",
          )}
          aria-hidden="true"
        />
      )}

      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-2.5">
        <Avatar
          src={avatarSrc}
          alt={displayName}
          size="md"
          status={avatarStatus}
          showStatus={isDirect}
        />

        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-1">
            <p
              className={clsx(
                "truncate text-body-sm leading-5 text-text-primary",
                unreadCount > 0 && "font-semibold",
              )}
            >
              {displayName}
            </p>

            <span
              className={clsx(
                "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                isDirect
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-border bg-surface-overlay text-text-secondary",
              )}
            >
              {isDirect ? (
                <UserIcon className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <UserGroupIcon className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {conversationTypeLabel}
            </span>

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
                aria-label={t("sidebar:room.mentioned")}
              />
            )}
          </div>

          <p
            className={clsx(
              "truncate text-caption leading-4 text-start",
              previewState === "failed"
                ? "font-medium text-danger"
                : previewState
                  ? "font-medium text-warning"
                  : unreadCount > 0
                    ? "font-medium text-text-secondary"
                    : "text-text-muted",
            )}
          >
            {previewText || t("sidebar:room.noMessagesYet")}
          </p>
          {!isDirect && participantCountLabel && (
            <p className="mt-0.5 truncate text-[11px] text-text-muted">
              {participantCountLabel}
            </p>
          )}
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-between py-1">
          <span
            className={clsx(
              "text-caption tabular-nums",
              unreadCount > 0
                ? "font-semibold text-primary"
                : "text-text-muted",
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
              className="min-w-5 px-1.5 text-caption shadow-xs"
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
