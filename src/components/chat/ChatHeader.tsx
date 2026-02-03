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
      return null; // Will show typing indicator instead
    }

    if (conversation.type === "group") {
      return `${conversation.participants.length} thành viên`;
    }

    if (conversation.type === "channel") {
      return "Kênh";
    }

    if (otherUser) {
      if (isOnline) {
        return "Đang hoạt động";
      }
      return "Ngoại tuyến";
    }

    return "";
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200",
        className,
      )}
    >
      {/* Back button (mobile) */}
      {onBack && (
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors lg:hidden"
          aria-label="Quay lại"
        >
          <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
        </button>
      )}

      {/* Avatar */}
      <button
        onClick={onInfoClick}
        className="shrink-0"
        aria-label="Xem thông tin"
      >
        <Avatar
          src={conversation.avatar}
          alt={conversation.name}
          size="md"
          status={otherUser?.status}
          showStatus={conversation.type === "private"}
        />
      </button>

      {/* Name and status */}
      <button onClick={onInfoClick} className="flex-1 min-w-0 text-left">
        <h2 className="font-semibold text-gray-900 truncate">
          {conversation.name}
        </h2>

        {isTyping ? (
          <TypingIndicator userName={typingStatus?.userName} />
        ) : (
          <p
            className={clsx(
              "text-sm truncate",
              isOnline ? "text-chat-online" : "text-gray-500",
            )}
          >
            {getStatusText()}
          </p>
        )}
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Voice call */}
        {onCallClick && (
          <button
            onClick={onCallClick}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Voice call"
          >
            <PhoneIcon className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Video call */}
        {onVideoCallClick && (
          <button
            onClick={onVideoCallClick}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Video call"
          >
            <VideoCameraIcon className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Search in chat */}
        {onSearchClick && (
          <button
            onClick={onSearchClick}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Search in chat"
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-600" />
          </button>
        )}

        {/* Info panel toggle */}
        <button
          onClick={onInfoClick}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Toggle info panel"
        >
          <InformationCircleIcon className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
