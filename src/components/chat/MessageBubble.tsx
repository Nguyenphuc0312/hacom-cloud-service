import React from "react";
import clsx from "clsx";
import { CheckIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
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
import { useChatStore } from "../../stores";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  conversationType: Conversation["type"];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

const MessageStatusIcon: React.FC<{
  status: Message["status"];
  isOwn: boolean;
  onResend?: () => void;
}> = ({ status, isOwn, onResend }) => {
  if (!isOwn) return null;

  if (status === "uploading") {
    return (
      <span
        className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent"
        role="img"
        aria-label="Uploading"
        title="Uploading"
      >
        <span className="sr-only">Uploading</span>
      </span>
    );
  }

  switch (status) {
    case MessageStatus.SENDING:
      return (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/80 border-t-transparent"
          role="img"
          aria-label="Sending"
          title="Sending"
        >
          <span className="sr-only">Sending</span>
        </span>
      );
    case MessageStatus.SENT:
      return (
        <span role="img" aria-label="Sent" title="Sent">
          <CheckIcon className="h-3.5 w-3.5 text-white/80" />
          <span className="sr-only">Sent</span>
        </span>
      );
    case MessageStatus.DELIVERED:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="h-3.5 w-3.5 text-white/80" />
          <CheckIcon className="h-3.5 w-3.5 text-white/80" />
        </div>
      );
    case MessageStatus.READ:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="h-3.5 w-3.5 text-white" />
          <CheckIcon className="h-3.5 w-3.5 text-white" />
        </div>
      );
    case MessageStatus.FAILED:
      return (
        <button
          type="button"
          title="Retry"
          onClick={onResend}
          className="h-4 w-4 text-red-300 transition-transform duration-150 hover:scale-110 hover:text-red-500 focus:outline-none active:scale-95"
        >
          <ExclamationCircleIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Failed to send. Click to retry.</span>
        </button>
      );
    default:
      return null;
  }
};

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar,
  showSenderName = false,
  isGroupStart = true,
  isGroupEnd = true,
  conversationType,
  onReply,
  onReact,
  onImageClick,
  className,
}) => {
  const resendMessage = useChatStore((s) => s.resendMessage);
  const bubbleRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const [isActionsPinned, setIsActionsPinned] = React.useState(false);
  const [hasFocusWithin, setHasFocusWithin] = React.useState(false);

  const timeStr = formatMessageTime(new Date(message.createdAt));
  const isGroupConversation =
    conversationType !== RoomType.PRIVATE && conversationType !== RoomType.DIRECT;
  const isActionsVisibleForKeyboard = isActionsPinned || hasFocusWithin;

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
    void navigator.clipboard.writeText(message.content);
    setIsActionsPinned(false);
    bubbleRef.current?.focus();
  };

  const handleResend = () => {
    if (message.conversationId) {
      void resendMessage(message.conversationId, message);
    }
  };

  const closeActions = () => {
    setIsActionsPinned(false);
    bubbleRef.current?.focus();
  };

  const openActionsWithKeyboard = () => {
    setIsActionsPinned(true);
    requestAnimationFrame(() => {
      const firstActionButton = actionsRef.current?.querySelector<HTMLButtonElement>(
        "button[tabindex='0']",
      );
      firstActionButton?.focus();
    });
  };

  const bubbleRadiusClass = (() => {
    if (isOwn) {
      if (isGroupStart && isGroupEnd) return "rounded-2xl rounded-br-md";
      if (isGroupStart) return "rounded-2xl rounded-br-md";
      if (isGroupEnd) return "rounded-2xl rounded-tr-md";
      return "rounded-2xl rounded-r-md";
    }

    if (isGroupStart && isGroupEnd) return "rounded-2xl rounded-bl-md";
    if (isGroupStart) return "rounded-2xl rounded-bl-md";
    if (isGroupEnd) return "rounded-2xl rounded-tl-md";
    return "rounded-2xl rounded-l-md";
  })();

  return (
    <div
      className={clsx(
        "group flex w-fit max-w-[min(82%,40rem)] items-end gap-2",
        isOwn ? "ml-auto flex-row-reverse" : "mr-auto",
        className,
      )}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={(event) => {
        const nextFocusedElement = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocusedElement)) {
          setHasFocusWithin(false);
          setIsActionsPinned(false);
        }
      }}
    >
      {isGroupConversation && !isOwn && (
        <div className="w-8 shrink-0 self-end">
          {/* Keep slot width for grouped messages to align bubbles */}
          {showAvatar && (
            <Avatar
              src={message.senderAvatar}
              alt={message.senderName}
              size="sm"
            />
          )}
        </div>
      )}

      <div className="relative flex min-w-0 flex-col">
        {isGroupConversation && !isOwn && showSenderName && (
          <span className="mb-1 ml-1 text-xs font-medium text-telegram-primary">
            {message.senderName}
          </span>
        )}

        {message.replyToMessage && (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-t-2xl border-l-2 border-telegram-primary px-3 py-2 text-xs",
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

        <div
          ref={bubbleRef}
          className={clsx(
            "relative px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-telegram-primary/30",
            bubbleRadiusClass,
            isOwn ? "bg-telegram-primary text-white" : "bg-white text-gray-900 shadow-sm",
            message.replyToMessage && "rounded-t-none",
            isOwn ? "animate-slide-in-right" : "animate-slide-in-left",
          )}
          tabIndex={0}
          aria-label={`${isOwn ? "Ban" : message.senderName} luc ${timeStr}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openActionsWithKeyboard();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              closeActions();
            }
          }}
        >
          {message.forwardedFrom && (
            <div
              className={clsx(
                "mb-1 flex items-center gap-1 text-xs",
                isOwn ? "text-white/90" : "text-gray-500",
              )}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l9 9h-6v4H9v-4H3l9-9zm0 18h10v2H2v-2h10z" />
              </svg>
              Forwarded from {message.forwardedFrom.username}
            </div>
          )}

          {renderContent()}

          <div
            className={clsx(
              "mt-1 flex items-center justify-end gap-1 text-xs leading-none",
              isOwn ? "text-white/90" : "text-gray-500",
            )}
          >
            {message.isEdited && <span>edited</span>}
            <span>{timeStr}</span>
            {isOwn && (
              <span className="inline-flex h-4 w-4 items-center justify-center">
                <MessageStatusIcon
                  status={message.status}
                  isOwn={isOwn}
                  onResend={handleResend}
                />
              </span>
            )}
          </div>

          {isGroupEnd && (
            <div
              className={clsx(
                "absolute bottom-0 h-3 w-3",
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
          )}
        </div>

        {(message.reactions?.length ?? 0) > 0 && (
          <div className={clsx("mt-1", isOwn ? "self-end" : "self-start")}>
            <ReactionBar
              reactions={message.reactions}
              onReact={(emoji) => onReact(message.id, emoji)}
            />
          </div>
        )}

        <div
          ref={actionsRef}
          className={clsx(
            "absolute top-0 z-10 transition-opacity duration-150",
            isActionsVisibleForKeyboard
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            isOwn ? "-left-2 -translate-x-full" : "-right-2 translate-x-full",
          )}
        >
          <div className="px-2">
            <MessageActions
              isOwn={isOwn}
              onReply={() => {
                onReply(message);
                closeActions();
              }}
              onForward={() => {}}
              onCopy={handleCopy}
              onEdit={isOwn ? () => {} : undefined}
              onDelete={() => {}}
              isVisible={isActionsVisibleForKeyboard}
              onClose={closeActions}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const MessageBubble = React.memo(MessageBubbleComponent);

export default MessageBubble;
