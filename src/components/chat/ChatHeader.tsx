import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftIcon,
  PhoneIcon,
  VideoCameraIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../common/Avatar";
import { TypingIndicator } from "../common/TypingIndicator";
import type { Conversation, TypingStatus } from "../../types";
import { getOtherParticipant } from "../../utils/messageHelpers";

interface ChatHeaderProps {
  conversation: Conversation;
  currentUserId: string;
  typingStatus?: TypingStatus;
  onBack?: () => void;
  onInfoClick: () => void;
  onCallClick?: () => void;
  onVideoCallClick?: () => void;
  onSearchClick?: () => void;
  className?: string;
}

const iconButtonClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary";

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  conversation,
  currentUserId,
  typingStatus,
  onBack,
  onInfoClick,
  onCallClick,
  onVideoCallClick,
  onSearchClick,
  className,
}) => {
  const { t } = useTranslation();
  const otherUser = getOtherParticipant(conversation, currentUserId);
  const isOnline = otherUser?.status === "online";
  const isTyping = typingStatus?.isTyping;

  const getStatusText = () => {
    if (isTyping) {
      return null;
    }

    if (conversation.type === "group") {
      return t("chat:header.members", {
        count: conversation.participants?.length ?? 0,
      });
    }

    if (conversation.type === "channel") {
      return t("chat:header.channel");
    }

    if (otherUser) {
      return isOnline ? t("common:status.online") : t("common:status.offline");
    }

    return "";
  };

  const displayName =
    conversation.name ||
    otherUser?.displayName ||
    otherUser?.username ||
    t("common:labels.conversation");

  return (
    <div
      className={clsx(
        "flex items-center gap-2 border-b border-border bg-surface px-4 py-2",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className={clsx(iconButtonClass, "lg:hidden")}
          aria-label={t("chat:header.back")}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
      )}

      <button
        type="button"
        onClick={onInfoClick}
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        aria-label={t("chat:header.viewInfo")}
      >
        <Avatar
          src={conversation.avatar}
          alt={displayName}
          size="md"
          status={otherUser?.status}
          showStatus={
            conversation.type === "private" || conversation.type === "direct"
          }
        />
      </button>

      <button type="button" onClick={onInfoClick} className="min-w-0 flex-1 text-left">
        <h2 className="truncate text-sm font-semibold text-text-primary sm:text-base">
          {displayName}
        </h2>

        {isTyping ? (
          <TypingIndicator userName={typingStatus?.userName} />
        ) : (
          <p className={clsx("truncate text-xs", isOnline ? "text-success" : "text-text-secondary")}>
            {getStatusText()}
          </p>
        )}
      </button>

      <div className="flex items-center gap-1">
        {onCallClick && (
          <button
            type="button"
            onClick={onCallClick}
            className={iconButtonClass}
            aria-label={t("chat:header.voiceCall")}
          >
            <PhoneIcon className="h-5 w-5" />
          </button>
        )}

        {onVideoCallClick && (
          <button
            type="button"
            onClick={onVideoCallClick}
            className={iconButtonClass}
            aria-label={t("chat:header.videoCall")}
          >
            <VideoCameraIcon className="h-5 w-5" />
          </button>
        )}

        {onSearchClick && (
          <button
            type="button"
            onClick={onSearchClick}
            className={clsx(iconButtonClass, "hidden sm:inline-flex")}
            aria-label={t("chat:header.searchInChat")}
          >
            <MagnifyingGlassIcon className="h-5 w-5" />
          </button>
        )}

        <button
          type="button"
          onClick={onInfoClick}
          className={iconButtonClass}
          aria-label={t("chat:header.toggleInfoPanel")}
        >
          <InformationCircleIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
