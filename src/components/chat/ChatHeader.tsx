import React from "react";
import clsx from "clsx";
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
  const otherUser = getOtherParticipant(conversation, currentUserId);
  const isOnline = otherUser?.status === "online";
  const isTyping = typingStatus?.isTyping;

  const getStatusText = () => {
    if (isTyping) {
      return null;
    }

    if (conversation.type === "group") {
      return `${conversation.participants?.length ?? 0} members`;
    }

    if (conversation.type === "channel") {
      return "Channel";
    }

    if (otherUser) {
      return isOnline ? "Online" : "Offline";
    }

    return "";
  };

  const displayName =
    conversation.name || otherUser?.displayName || otherUser?.username || "Conversation";

  return (
    <div
      className={clsx(
        "flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-2",
        className,
      )}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
          aria-label="Back"
        >
          <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
        </button>
      )}

      <button
        type="button"
        onClick={onInfoClick}
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-telegram-primary"
        aria-label="View conversation info"
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
        <h2 className="truncate text-sm font-semibold text-gray-900 sm:text-[15px]">
          {displayName}
        </h2>

        {isTyping ? (
          <TypingIndicator userName={typingStatus?.userName} />
        ) : (
          <p
            className={clsx(
              "truncate text-xs",
              isOnline ? "text-chat-online" : "text-gray-600",
            )}
          >
            {getStatusText()}
          </p>
        )}
      </button>

      <div className="flex items-center gap-1">
        {onCallClick && (
          <button
            type="button"
            onClick={onCallClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Voice call"
          >
            <PhoneIcon className="h-5 w-5 text-gray-600" />
          </button>
        )}

        {onVideoCallClick && (
          <button
            type="button"
            onClick={onVideoCallClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Video call"
          >
            <VideoCameraIcon className="h-5 w-5 text-gray-600" />
          </button>
        )}

        {onSearchClick && (
          <button
            type="button"
            onClick={onSearchClick}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 sm:inline-flex"
            aria-label="Search in chat"
          >
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-600" />
          </button>
        )}

        <button
          type="button"
          onClick={onInfoClick}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Toggle info panel"
        >
          <InformationCircleIcon className="h-5 w-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
