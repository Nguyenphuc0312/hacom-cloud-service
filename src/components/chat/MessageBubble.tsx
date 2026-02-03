import React, { useState } from "react";
import clsx from "clsx";
import {
  CheckIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";
import { Avatar } from "../common/Avatar";
import { TextMessage } from "../message/TextMessage";
import { ImageMessage } from "../message/ImageMessage";
import { FileMessage } from "../message/FileMessage";
import { VoiceMessage } from "../message/VoiceMessage";
import { MessageActions } from "../message/MessageActions";
import { ReactionBar } from "../message/ReactionBar";
import type { Message, Conversation } from "../../types";
import { MessageStatus, MessageType, RoomType } from "../../types";
import { formatMessageTime } from "../../utils/formatTime";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  conversationType: Conversation["type"];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

const MessageStatusIcon: React.FC<{
  status: Message["status"];
  isOwn: boolean;
}> = ({ status, isOwn }) => {
  if (!isOwn) return null;

  switch (status) {
    case MessageStatus.SENDING:
      return <ClockIcon className="w-3.5 h-3.5 text-white/60" />;
    case MessageStatus.SENT:
      return <CheckIcon className="w-3.5 h-3.5 text-white/60" />;
    case MessageStatus.DELIVERED:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="w-3.5 h-3.5 text-white/60" />
          <CheckIcon className="w-3.5 h-3.5 text-white/60" />
        </div>
      );
    case MessageStatus.READ:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="w-3.5 h-3.5 text-white" />
          <CheckIcon className="w-3.5 h-3.5 text-white" />
        </div>
      );
    case MessageStatus.FAILED:
      return <ExclamationCircleIcon className="w-4 h-4 text-red-300" />;
    default:
      return null;
  }
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar,
  conversationType,
  onReply,
  onReact,
  onImageClick,
  className,
}) => {
  const [showActions, setShowActions] = useState(false);

  const timeStr = formatMessageTime(new Date(message.createdAt));

  const renderContent = () => {
    switch (message.type) {
      case MessageType.TEXT:
        return <TextMessage content={message.content} isOwn={isOwn} />;

      case MessageType.IMAGE:
        return (
          message.attachments?.[0] && (
            <ImageMessage
              attachment={message.attachments[0]}
              caption={message.content}
              isOwn={isOwn}
              onClick={onImageClick}
            />
          )
        );

      case MessageType.FILE:
        return (
          message.attachments?.[0] && (
            <FileMessage attachment={message.attachments[0]} isOwn={isOwn} />
          )
        );

      case MessageType.VOICE:
        return (
          message.attachments?.[0] && (
            <VoiceMessage attachment={message.attachments[0]} isOwn={isOwn} />
          )
        );

      default:
        return <TextMessage content={message.content} isOwn={isOwn} />;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setShowActions(false);
  };

  return (
    <div
      className={clsx(
        "flex gap-2 max-w-[85%] group",
        isOwn ? "ml-auto flex-row-reverse" : "mr-auto",
        className,
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar for group chats */}
      {conversationType !== RoomType.PRIVATE &&
        conversationType !== RoomType.DIRECT &&
        !isOwn && (
          <div className="shrink-0 w-8">
            {showAvatar && (
              <Avatar
                src={message.senderAvatar}
                alt={message.senderName}
                size="sm"
              />
            )}
          </div>
        )}

      {/* Message bubble */}
      <div className="flex flex-col">
        {/* Sender name for group chats */}
        {conversationType !== RoomType.PRIVATE &&
          conversationType !== RoomType.DIRECT &&
          !isOwn &&
          showAvatar && (
            <span className="text-xs font-medium text-telegram-primary mb-1 ml-1">
              {message.senderName}
            </span>
          )}

        {/* Reply preview */}
        {message.replyToMessage && (
          <div
            className={clsx(
              "flex items-center gap-2 px-3 py-2 rounded-t-2xl border-l-2 border-telegram-primary text-xs",
              isOwn
                ? "bg-telegram-primary/80 text-white/80"
                : "bg-gray-200 text-gray-600",
            )}
          >
            <span className="font-medium">
              {message.replyToMessage.senderName}
            </span>
            <span className="truncate">{message.replyToMessage.content}</span>
          </div>
        )}

        {/* Main bubble */}
        <div
          className={clsx(
            "relative px-3 py-2 rounded-2xl",
            isOwn
              ? "bg-telegram-primary text-white rounded-br-md"
              : "bg-white text-gray-900 rounded-bl-md shadow-sm",
            message.replyToMessage && "rounded-t-none",
            isOwn ? "animate-slide-in-right" : "animate-slide-in-left",
          )}
        >
          {/* Forwarded label */}
          {message.forwardedFrom && (
            <div
              className={clsx(
                "flex items-center gap-1 text-xs mb-1",
                isOwn ? "text-white/70" : "text-gray-500",
              )}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l9 9h-6v4H9v-4H3l9-9zm0 18h10v2H2v-2h10z" />
              </svg>
              Chuyển tiếp từ {message.forwardedFrom.username}
            </div>
          )}

          {/* Content */}
          {renderContent()}

          {/* Time and status */}
          <div
            className={clsx(
              "flex items-center justify-end gap-1 mt-1",
              isOwn ? "text-white/70" : "text-gray-400",
            )}
          >
            {message.isEdited && <span className="text-[10px]">đã sửa</span>}
            <span className="text-[10px]">{timeStr}</span>
            <MessageStatusIcon status={message.status} isOwn={isOwn} />
          </div>

          {/* Bubble tail */}
          <div
            className={clsx(
              "absolute bottom-0 w-3 h-3",
              isOwn
                ? "-right-1.5 text-telegram-primary"
                : "-left-1.5 text-white",
            )}
          >
            <svg
              viewBox="0 0 12 12"
              fill="currentColor"
              className={clsx(isOwn ? "rotate-90" : "-rotate-90")}
            >
              <path d="M0 0 L12 0 L12 12 Q12 0 0 0 Z" />
            </svg>
          </div>
        </div>

        {/* Reactions */}
        {(message.reactions?.length ?? 0) > 0 && (
          <div className={clsx("mt-1", isOwn ? "self-end" : "self-start")}>
            <ReactionBar
              reactions={message.reactions}
              onReact={(emoji) => onReact(message.id, emoji)}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      {showActions && (
        <div
          className={clsx(
            "shrink-0 self-center",
            isOwn ? "order-first" : "order-last",
          )}
        >
          <MessageActions
            isOwn={isOwn}
            onReply={() => onReply(message)}
            onForward={() => {}}
            onCopy={handleCopy}
            onEdit={isOwn ? () => {} : undefined}
            onDelete={() => {}}
          />
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
