import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
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
import { normalizeRoomType } from "../../lib/conversationAdapter";
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
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  className?: string;
}

const MessageStatusIcon: React.FC<{
  status: Message["status"];
  isOwn: boolean;
  onResend?: () => void;
}> = ({ status, isOwn, onResend }) => {
  const { t } = useTranslation();
  if (!isOwn) return null;

  if (status === "uploading") {
    return (
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-inverse/80 border-t-transparent"
        role="img"
        aria-label={t("chat:message.status.uploading")}
        title={t("chat:message.status.uploading")}
      >
        <span className="sr-only">{t("chat:message.status.uploading")}</span>
      </span>
    );
  }

  switch (status) {
    case MessageStatus.SENDING:
      return (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-inverse/80 border-t-transparent"
          role="img"
          aria-label={t("chat:message.status.sending")}
          title={t("chat:message.status.sending")}
        >
          <span className="sr-only">{t("chat:message.status.sending")}</span>
        </span>
      );
    case MessageStatus.SENT:
      return (
        <span
          role="img"
          aria-label={t("chat:message.status.sent")}
          title={t("chat:message.status.sent")}
        >
          <CheckIcon className="h-4 w-4 text-text-inverse/80" />
          <span className="sr-only">{t("chat:message.status.sent")}</span>
        </span>
      );
    case MessageStatus.DELIVERED:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="h-4 w-4 text-text-inverse/80" />
          <CheckIcon className="h-4 w-4 text-text-inverse/80" />
        </div>
      );
    case MessageStatus.READ:
      return (
        <div className="flex -space-x-1">
          <CheckIcon className="h-4 w-4 text-text-inverse" />
          <CheckIcon className="h-4 w-4 text-text-inverse" />
        </div>
      );
    case MessageStatus.FAILED:
      return (
        <button
          type="button"
          title={t("chat:message.status.retry")}
          onClick={onResend}
          className="h-4 w-4 text-danger/70 transition-transform duration-150 hover:scale-110 hover:text-danger focus:outline-none active:scale-95"
        >
          <ExclamationCircleIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">
            {t("chat:message.status.failedRetry")}
          </span>
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
  onEdit,
  onDelete,
  onImageClick,
  className,
}) => {
  const { t } = useTranslation();
  const resendMessage = useChatStore((s) => s.resendMessage);
  const bubbleRef = React.useRef<HTMLDivElement>(null);
  const actionsRef = React.useRef<HTMLDivElement>(null);
  const [isActionsPinned, setIsActionsPinned] = React.useState(false);
  const [hasFocusWithin, setHasFocusWithin] = React.useState(false);

  const timeStr = formatMessageTime(new Date(message.createdAt));
  const normalizedConversationType = normalizeRoomType(conversationType);
  const isGroupConversation =
    normalizedConversationType !== RoomType.PRIVATE &&
    normalizedConversationType !== RoomType.DIRECT;
  const isActionsVisibleForKeyboard = isActionsPinned || hasFocusWithin;

  const renderContent = () => {
    const attachments = Array.isArray(message.attachments)
      ? message.attachments
      : [];

    switch (message.type) {
      case MessageType.TEXT:
        return <TextMessage content={message.content} isOwn={isOwn} />;

      case MessageType.IMAGE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <ImageMessage
                key={attachment.id || `${message.id}-image-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                caption={index === 0 ? message.content : undefined}
                isOwn={isOwn}
                onClick={onImageClick}
              />
            ))}
          </div>
        ) : (
          <TextMessage content={message.content} isOwn={isOwn} />
        );

      case MessageType.FILE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <FileMessage
                key={attachment.id || `${message.id}-file-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                isOwn={isOwn}
              />
            ))}
          </div>
        ) : (
          <TextMessage content={message.content} isOwn={isOwn} />
        );

      case MessageType.VOICE:
        return attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment, index) => (
              <VoiceMessage
                key={attachment.id || `${message.id}-voice-${index}`}
                conversationId={message.conversationId}
                attachment={attachment}
                isOwn={isOwn}
              />
            ))}
          </div>
        ) : (
          <TextMessage content={message.content} isOwn={isOwn} />
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
      const firstActionButton =
        actionsRef.current?.querySelector<HTMLButtonElement>(
          "button[tabindex='0']",
        );
      firstActionButton?.focus();
    });
  };

  const bubbleRadiusClass = (() => {
    if (isOwn) {
      if (isGroupStart && isGroupEnd) return "rounded-xl rounded-br-sm";
      if (isGroupStart) return "rounded-xl rounded-br-sm";
      if (isGroupEnd) return "rounded-xl rounded-tr-sm";
      return "rounded-xl rounded-r-sm";
    }

    if (isGroupStart && isGroupEnd) return "rounded-xl rounded-bl-sm";
    if (isGroupStart) return "rounded-xl rounded-bl-sm";
    if (isGroupEnd) return "rounded-xl rounded-tl-sm";
    return "rounded-xl rounded-l-sm";
  })();

  const bubbleSender = isOwn ? t("chat:message.you") : message.senderName;

  return (
    <div
      className={clsx(
        "group flex w-fit max-w-[min(75%,36rem)] items-end gap-2 sm:max-w-[min(65%,36rem)]",
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
          <span className="mb-1 ml-1 text-xs font-medium text-primary">
            {message.senderName}
          </span>
        )}

        {message.replyToMessage && (
          <div
            className={clsx(
              "flex items-center gap-2 rounded-t-xl border-l-2 border-primary px-3 py-2 text-xs",
              isOwn
                ? "bg-primary/80 text-text-inverse/80"
                : "bg-surface-overlay text-text-secondary",
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
            "relative px-[var(--chat-bubble-px)] py-[var(--chat-bubble-py)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            bubbleRadiusClass,
            isOwn
              ? "bg-primary text-text-inverse"
              : "border border-border bg-surface text-text-primary shadow-xs",
            message.replyToMessage && "rounded-t-none",
          )}
          tabIndex={0}
          aria-label={t("chat:message.bubbleAria", {
            name: bubbleSender,
            time: timeStr,
          })}
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
                isOwn ? "text-text-inverse/90" : "text-text-muted",
              )}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l9 9h-6v4H9v-4H3l9-9zm0 18h10v2H2v-2h10z" />
              </svg>
              {t("chat:message.forwardedFrom", {
                name: message.forwardedFrom.username,
              })}
            </div>
          )}

          {renderContent()}

          <div
            className={clsx(
              "mt-1 flex items-center justify-end gap-1 text-xs leading-none",
              isOwn ? "text-text-inverse/90" : "text-text-muted",
            )}
          >
            {message.isEdited && <span>{t("chat:message.edited")}</span>}
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

          {isGroupEnd && !message.reactions?.length && (
            <div
              className={clsx(
                "absolute bottom-0 h-3 w-3",
                isOwn ? "-right-1.5 text-primary" : "-left-1.5 text-surface",
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
              onEdit={
                isOwn && onEdit
                  ? () => {
                      void Promise.resolve(onEdit(message));
                      closeActions();
                    }
                  : undefined
              }
              onDelete={() => {
                if (!onDelete) return;
                void Promise.resolve(onDelete(message.id));
                closeActions();
              }}
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
