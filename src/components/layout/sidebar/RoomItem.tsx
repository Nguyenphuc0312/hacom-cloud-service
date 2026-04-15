import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { GroupAvatar } from "../../common/GroupAvatar";
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
  truncateTextWithEllipsis,
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
    [conversation, currentUser.id, fallbackConversationName],
  );
  const previewText = useMemo(() => {
    const lastMessage = conversation.lastMessage;
    if (!lastMessage) return "";

    const messagePreview = getMessagePreview(lastMessage, currentUser.id, 240);
    if (!messagePreview) return "";

    if (lastMessage.type === "system" || isDirectConversation(conversation)) {
      return truncateTextWithEllipsis(messagePreview, 52);
    }

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

    return truncateTextWithEllipsis(`${senderLabel}: ${messagePreview}`, 52);
  }, [
    conversation,
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
    const referenceTime =
      conversation.lastMessageSortAt ||
      conversation.lastMessageAt ||
      conversation.lastMessage?.createdAt;
    if (!referenceTime) return "";
    return formatRelativeTime(new Date(referenceTime));
  }, [
    conversation.lastMessage?.createdAt,
    conversation.lastMessageAt,
    conversation.lastMessageSortAt,
  ]);

  const unreadCount = conversation.unreadCount || 0;
  const unreadMention = hasConversationMention(conversation, currentUser);
  const isDirect = isDirectConversation(conversation);
  const unreadLabel = unreadCount > 99 ? "99+" : unreadCount;
  const avatarSrc = getConversationAvatar(conversation, currentUser.id);
  const avatarStatus = isDirect ? directPartner?.status : undefined;

  const previewToneClass = (() => {
    if (previewState === "failed") {
      return "text-danger";
    }

    if (previewState || unreadMention || unreadCount > 0) {
      return "text-text-secondary";
    }

    return "text-text-muted";
  })();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        role="option"
        aria-selected={isActive}
        className={clsx(
          "group relative mx-2 my-1 flex h-[3.5rem] w-[calc(100%-var(--space-4))] items-center justify-center rounded-[1.05rem] transition-micro",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
          isActive
            ? "bg-primary/8"
            : "hover:bg-surface-hover/80",
          !isActive && isKeyboardActive && "bg-surface-overlay",
        )}
        aria-label={displayName}
        title={displayName}
      >
        <span
          className={clsx(
            "absolute left-1 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
            isActive ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        />
        {isDirect ? (
          <Avatar
            src={avatarSrc}
            alt={displayName}
            size="md"
            status={avatarStatus}
            showStatus={isDirect}
          />
        ) : (
          <GroupAvatar
            conversation={conversation}
            currentUserId={currentUser.id}
            size="md"
          />
        )}

        {unreadCount > 0 && (
          <span
            className={clsx(
              "absolute right-2.5 top-2.5 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-text-inverse",
              unreadMention
                ? "bg-danger"
                : conversation.isMuted
                  ? "bg-text-muted"
                  : "bg-primary",
            )}
          >
            {unreadLabel}
          </span>
        )}
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
        "group relative mx-2 my-1 flex h-[4.25rem] w-[calc(100%-var(--space-4))] items-center rounded-[1.1rem] px-3",
        "transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
        isActive
          ? "bg-primary/8"
          : "hover:bg-surface-hover/80",
        !isActive && isKeyboardActive && "bg-surface-overlay",
      )}
      aria-label={displayName}
    >
      <span
        className={clsx(
          "absolute bottom-2 left-1.5 top-2 w-0.5 rounded-full transition-fast",
          isActive ? "bg-primary opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      />
      <div className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-3">
        {isDirect ? (
          <Avatar
            src={avatarSrc}
            alt={displayName}
            size="md"
            status={avatarStatus}
            showStatus={isDirect}
          />
        ) : (
          <GroupAvatar
            conversation={conversation}
            currentUserId={currentUser.id}
            size="md"
          />
        )}

        <div className="min-w-0">
          <p
            className={clsx(
              "truncate text-body-sm leading-5 text-text-primary",
              unreadCount > 0 && "font-semibold",
            )}
          >
            {displayName}
          </p>

          <p
            className={clsx(
              "truncate pr-1 text-caption leading-5 text-start",
              previewState === "failed" ? "font-medium" : "font-normal",
              previewToneClass,
            )}
          >
            {previewText || t("sidebar:room.noMessagesYet")}
          </p>
        </div>

        <div className="flex h-full min-w-room-meta flex-col items-end justify-start gap-2 py-1">
          <span className="text-caption tabular-nums text-text-muted">
            {timeLabel}
          </span>

          {unreadCount > 0 ? (
            <span
              className={clsx(
                "sidebar-shell-badge inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none text-text-inverse",
                unreadMention
                  ? "bg-danger"
                  : conversation.isMuted
                    ? "bg-text-muted"
                    : "bg-primary",
              )}
            >
              {unreadLabel}
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
