import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { SpeakerXMarkIcon, CheckCircleIcon } from "@heroicons/react/24/solid";
import { Avatar } from "../common/Avatar";
import { Badge } from "../common/Badge";
import type { Conversation } from "../../types";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { formatRelativeTime } from "../../utils/formatTime";
import {
  getConversationAvatar,
  getConversationDisplayName,
  getMessagePreview,
  getOtherParticipant,
} from "../../utils/messageHelpers";

interface ConversationItemProps {
  conversation: Conversation;
  currentUserId: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation,
  currentUserId,
  isActive,
  onClick,
  className,
}) => {
  const { t } = useTranslation();
  const isDirect = isDirectConversation(conversation);

  const otherParticipant = isDirect
    ? getOtherParticipant(conversation, currentUserId)
    : null;

  const status = otherParticipant?.status;
  const lastMessage = conversation.lastMessage;
  const preview = getMessagePreview(lastMessage, currentUserId);
  const timeStr = lastMessage
    ? formatRelativeTime(new Date(lastMessage.createdAt))
    : "";
  const isOwnLastMessage = lastMessage?.senderId === currentUserId;

  const fallbackConversationLabel = t("common:labels.conversation");
  const displayName =
    getConversationDisplayName(conversation, currentUserId) ||
    fallbackConversationLabel;
  const avatarSrc = getConversationAvatar(conversation, currentUserId);

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150",
        "min-h-16",
        "hover:bg-surface-overlay",
        isActive && "bg-primary/15 hover:bg-primary/20",
        conversation.isPinned && !isActive && "bg-background",
        className,
      )}
      role="option"
      aria-selected={isActive}
    >
      <Avatar
        src={avatarSrc}
        alt={displayName}
        size="lg"
        status={status}
        showStatus={isDirect}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={clsx(
                "font-semibold text-text-primary truncate",
                conversation.unreadCount > 0 && "text-text-primary",
              )}
            >
              {displayName}
            </span>

            {conversation.isMuted && (
              <SpeakerXMarkIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
            )}
            {conversation.isPinned && (
              <svg
                className="w-4 h-4 text-text-muted flex-shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M16 4a1 1 0 00-1.5-.87l-4 2.25A1 1 0 0010 5.5v6.19l-4.15 2.4A1 1 0 006 16v1a1 1 0 001 1h4v4a1 1 0 102 0v-4h4a1 1 0 001-1v-1a1 1 0 00-.15-.52L14 13.08V5.5a1 1 0 00-.5-.13l4-2.25A1 1 0 0016 4z" />
              </svg>
            )}
            {otherParticipant?.isBot === false && (
              <CheckCircleIcon className="w-4 h-4 text-primary flex-shrink-0" />
            )}
          </div>

          <span
            className={clsx(
              "text-xs flex-shrink-0",
              conversation.unreadCount > 0
                ? "text-primary font-medium"
                : "text-text-muted",
            )}
          >
            {timeStr}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isOwnLastMessage && lastMessage && (
              <span className="text-sm text-text-muted">{t("chat:message.senderYou")}</span>
            )}

            <span
              className={clsx(
                "text-sm truncate",
                conversation.unreadCount > 0
                  ? "text-text-secondary font-medium"
                  : "text-text-muted",
              )}
            >
              {preview}
            </span>
          </div>

          {conversation.unreadCount > 0 && (
            <Badge
              count={conversation.unreadCount}
              variant={conversation.isMuted ? "muted" : "primary"}
              size="sm"
            />
          )}
        </div>
      </div>
    </button>
  );
};

export default ConversationItem;
