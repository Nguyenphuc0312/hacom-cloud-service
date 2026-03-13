import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  AtSymbolIcon,
  BookmarkIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
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
  getOtherParticipant,
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

    const senderLabel =
      lastMessage.senderId === currentUser.id
        ? "Bạn"
        : lastMessage.senderName?.trim() ||
          directPartner?.displayName ||
          directPartner?.username ||
          t("common:labels.conversation");

    return `${senderLabel}: ${messagePreview}`;
  }, [conversation.lastMessage, currentUser.id, directPartner, t]);
  const timeLabel = useMemo(() => {
    if (!conversation.lastMessage?.createdAt) return "";
    return formatRelativeTime(new Date(conversation.lastMessage.createdAt));
  }, [conversation.lastMessage]);

  const unreadCount = conversation.unreadCount || 0;
  const unreadMention = hasConversationMention(conversation, currentUser);
  const isDirect = isDirectConversation(conversation);

  const avatarSrc = getConversationAvatar(conversation, currentUser.id);
  const avatarStatus = isDirect ? directPartner?.status : undefined;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        className={clsx(
          "group relative mx-2 my-1 flex h-room-item w-room-item items-center justify-center rounded-[20px]",
          "transition-colors",
          "hover:bg-white/6",
          (isActive || isKeyboardActive) && "bg-white/12 text-primary",
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
              className="min-w-[18px] text-[10px]"
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
        "mx-2 my-0.5 flex h-room-item w-[calc(100%-var(--space-4))] items-center rounded-[22px] px-3.5",
        "transition-colors",
        "hover:bg-white/6",
        (isActive || isKeyboardActive) && "bg-white/10",
      )}
      aria-label={displayName}
    >
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3">
        <Avatar
          src={avatarSrc}
          alt={displayName}
          size="md"
          status={avatarStatus}
          showStatus={isDirect}
        />

        <div className="min-w-0">
          <div className="mb-0.5 flex items-center gap-1.5">
            <p
              className={clsx(
                "truncate text-[14px] leading-5 text-text-primary",
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
                aria-label={t("sidebar:room.mentioned")}
              />
            )}
          </div>

          <p
            className={clsx(
              "truncate text-xs leading-5 text-start",
              unreadCount > 0
                ? "font-medium text-text-secondary"
                : "text-text-muted",
            )}
          >
            {previewText || t("sidebar:room.noMessagesYet")}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-between py-1">
          <span
            className={clsx(
              "text-[11px] leading-4",
              unreadCount > 0
                ? "font-medium text-primary"
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
              className="min-w-[18px] px-1.5 text-[10px]"
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
