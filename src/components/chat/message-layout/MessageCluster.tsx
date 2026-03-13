import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowPathIcon,
  ChatBubbleLeftIcon,
  DocumentIcon,
  ExclamationCircleIcon,
  PhotoIcon,
  SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { MessageActions } from "../../message/MessageActions";
import { ReactionBar } from "../../message/ReactionBar";
import { ThreadIndicator } from "../../message/ThreadIndicator";
import type { Attachment, Conversation, Message } from "../../../types";
import { RoomType } from "../../../types";
import { normalizeRoomType } from "../../../lib/conversationAdapter";
import { useChatStore } from "../../../stores";
import {
  isFailedMessage,
  isPendingMessage,
} from "../../../utils/messageTimeline";
import { MessageBodyRenderer } from "./MessageBodyRenderer";
import { MessageMeta } from "./MessageMeta";
import { MessageRow } from "./MessageRow";
import { MessageSurface } from "./MessageSurface";

interface MessageClusterProps {
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
  onFilePreview?: (attachment: Attachment) => void;
  currentUsername?: string;
  className?: string;
}

const ReplyTypeIcon: React.FC<{ type?: string; className?: string }> = ({
  type,
  className,
}) => {
  switch (type) {
    case "image":
      return <PhotoIcon className={className} />;
    case "file":
      return <DocumentIcon className={className} />;
    case "voice":
      return <SpeakerWaveIcon className={className} />;
    default:
      return <ChatBubbleLeftIcon className={className} />;
  }
};

const isCoarsePointer = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

const MessageDeliveryState: React.FC<{
  message: Message;
  isOwn: boolean;
  onRetry: () => void;
}> = ({ message, isOwn, onRetry }) => {
  const { t } = useTranslation();
  const failed = isFailedMessage(message);
  const pending = isPendingMessage(message);

  if (!isOwn || (!failed && !pending)) {
    return null;
  }

  const label =
    message.status === "uploading"
      ? t("chat:message.status.uploading")
      : failed
        ? t("chat:message.status.failedInline", {
            defaultValue: "Chua gui duoc",
          })
        : t("chat:message.status.sending");

  return (
    <div
      className={clsx(
        "mt-1.5 inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-xs backdrop-blur-sm",
        isOwn ? "self-end" : "self-start",
        failed
          ? "border-danger/20 bg-danger/10 text-danger"
          : "border-white/8 bg-[hsl(var(--color-chat-pill)/0.9)] text-text-secondary",
      )}
    >
      {failed ? (
        <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <ArrowPathIcon className="h-3.5 w-3.5 shrink-0 animate-spin" />
      )}
      <span className="truncate">{label}</span>
      {failed && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger transition-micro hover:bg-danger/10"
        >
          {t("chat:message.status.retry", { defaultValue: "Thu lai" })}
        </button>
      )}
    </div>
  );
};

export const MessageCluster: React.FC<MessageClusterProps> = ({
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
  onFilePreview,
  currentUsername,
  className,
}) => {
  const { t } = useTranslation();
  const resendMessage = useChatStore((s) => s.resendMessage);
  const [isRailVisible, setIsRailVisible] = React.useState(false);
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);
  const openRailTimerRef = React.useRef<number | null>(null);
  const closeRailTimerRef = React.useRef<number | null>(null);
  const normalizedConversationType = normalizeRoomType(conversationType);
  const isGroupConversation =
    normalizedConversationType !== RoomType.PRIVATE &&
    normalizedConversationType !== RoomType.DIRECT;
  const threadCountValue = (() => {
    const candidate = message as unknown as { threadCount?: unknown };
    return typeof candidate.threadCount === "number" ? candidate.threadCount : 0;
  })();

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const clearRailTimers = React.useCallback(() => {
    if (openRailTimerRef.current !== null) {
      window.clearTimeout(openRailTimerRef.current);
      openRailTimerRef.current = null;
    }
    if (closeRailTimerRef.current !== null) {
      window.clearTimeout(closeRailTimerRef.current);
      closeRailTimerRef.current = null;
    }
  }, []);

  const scheduleRailOpen = React.useCallback(() => {
    clearRailTimers();
    openRailTimerRef.current = window.setTimeout(() => {
      setIsRailVisible(true);
      openRailTimerRef.current = null;
    }, 70);
  }, [clearRailTimers]);

  const scheduleRailClose = React.useCallback((force = false) => {
    clearRailTimers();
    closeRailTimerRef.current = window.setTimeout(() => {
      if (force || !isActionsOpen) {
        setIsRailVisible(false);
      }
      closeRailTimerRef.current = null;
    }, 90);
  }, [clearRailTimers, isActionsOpen]);

  React.useEffect(
    () => () => {
      clearLongPressTimer();
      clearRailTimers();
    },
    [clearLongPressTimer, clearRailTimers],
  );

  const handleRetry = React.useCallback(() => {
    if (!message.conversationId) return;
    void resendMessage(message.conversationId, message);
  }, [message, resendMessage]);

  const openActions = React.useCallback(() => {
    clearRailTimers();
    setIsActionsOpen(true);
    setIsRailVisible(true);
  }, [clearRailTimers]);

  const closeActions = React.useCallback(() => {
    setIsActionsOpen(false);
    scheduleRailClose(true);
  }, [scheduleRailClose]);

  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(message.content || "");
    closeActions();
  }, [closeActions, message.content]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isCoarsePointer() || event.pointerType === "mouse") return;
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        openActions();
      }, 300);
    },
    [clearLongPressTimer, openActions],
  );

  const actionRail = (
    <MessageActions
      mode="rail"
      isOwn={isOwn}
      isOpen={isActionsOpen}
      onReact={() => onReact(message.id, "👍")}
      onReply={() => onReply(message)}
      onMore={openActions}
    />
  );

  return (
    <div
      className={clsx(
        "group/message-cluster w-full",
        className,
      )}
      onMouseEnter={scheduleRailOpen}
      onMouseLeave={() => scheduleRailClose()}
      onFocusCapture={() => {
        clearRailTimers();
        setIsRailVisible(true);
      }}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocused)) {
          scheduleRailClose();
        }
      }}
    >
      <MessageRow
        isOwn={isOwn}
        actionRail={
          <div
            className={clsx(
              "transition-fast",
              isRailVisible || isActionsOpen
                ? "pointer-events-auto translate-x-0 opacity-100"
                : isOwn
                  ? "pointer-events-none -translate-x-1 opacity-0"
                  : "pointer-events-none translate-x-1 opacity-0",
            )}
          >
            {actionRail}
          </div>
        }
      >
        <div
          className={clsx(
            "flex w-full min-w-0 items-end gap-1.5",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          {isGroupConversation && !isOwn && (
            <div className="w-9 shrink-0 self-end">
              {showAvatar ? (
                <Avatar
                  src={message.senderAvatar}
                  alt={message.senderName}
                  size="sm"
                />
              ) : null}
            </div>
          )}

          <div
            className={clsx(
              "min-w-0",
              isOwn ? "items-end" : "items-start",
              "flex max-w-[var(--chat-bubble-max)] flex-col",
            )}
          >
            {isGroupConversation && !isOwn && showSenderName && (
              <span className="mb-1 px-1 text-[11px] font-semibold text-primary/90">
                {message.senderName}
              </span>
            )}

            {message.replyToMessage && (
              <div
                className={clsx(
                  "mb-1 flex w-full items-center gap-2 rounded-2xl border-l-2 px-3 py-2 text-xs",
                  isOwn
                    ? "border-text-inverse/40 bg-text-inverse/10 text-text-inverse/78"
                    : "border-primary/55 bg-white/5 text-text-secondary",
                )}
              >
                <ReplyTypeIcon
                  type={message.replyToMessage.type}
                  className={clsx(
                    "h-3.5 w-3.5 shrink-0",
                    isOwn ? "text-text-inverse/65" : "text-text-muted",
                  )}
                />
                <div className="min-w-0">
                  <span className="font-semibold">
                    {message.replyToMessage.senderName}
                  </span>
                  <p className="mt-0.5 truncate leading-snug opacity-90">
                    {message.replyToMessage.isDeleted
                      ? t("chat:message.deleted", {
                          defaultValue: "Message deleted",
                        })
                      : message.replyToMessage.content}
                  </p>
                </div>
              </div>
            )}

            <div
              onPointerDown={handlePointerDown}
              onPointerUp={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              className="w-full"
            >
              <MessageSurface
                isOwn={isOwn}
                isGroupStart={isGroupStart}
                isGroupEnd={isGroupEnd}
                hasReplyPreview={Boolean(message.replyToMessage)}
                hasError={isFailedMessage(message)}
              >
                {message.forwardedFrom && (
                  <div
                    className={clsx(
                      "mb-2 flex items-center gap-1 text-xs",
                      isOwn ? "text-text-inverse/90" : "text-text-secondary",
                    )}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2l9 9h-6v4H9v-4H3l9-9zm0 18h10v2H2v-2h10z" />
                    </svg>
                    {t("chat:message.forwardedFrom", {
                      name: message.forwardedFrom.username,
                    })}
                  </div>
                )}

                <MessageBodyRenderer
                  message={message}
                  isOwn={isOwn}
                  currentUsername={currentUsername}
                  onImageClick={onImageClick}
                  onFilePreview={onFilePreview}
                />
              </MessageSurface>
            </div>

            <MessageMeta
              message={message}
              isOwn={isOwn}
              showStatus={isOwn && isGroupEnd}
            />

            {isOwn && isGroupEnd && (
              <MessageDeliveryState
                message={message}
                isOwn={isOwn}
                onRetry={handleRetry}
              />
            )}

            {(message.reactions?.length ?? 0) > 0 && (
              <div className={clsx("mt-1", isOwn ? "self-end" : "self-start")}>
                <ReactionBar
                  reactions={message.reactions}
                  onReact={(emoji) => onReact(message.id, emoji)}
                />
              </div>
            )}

            {threadCountValue > 0 && (
              <ThreadIndicator threadCount={threadCountValue} isOwn={isOwn} />
            )}
          </div>
        </div>
      </MessageRow>

      <MessageActions
        mode="sheet"
        isOwn={isOwn}
        isOpen={isActionsOpen}
        onClose={closeActions}
        onReact={() => onReact(message.id, "👍")}
        onReply={() => {
          onReply(message);
          closeActions();
        }}
        onCopy={handleCopy}
        onEdit={
          isOwn && onEdit
            ? () => {
                void Promise.resolve(onEdit(message));
                closeActions();
              }
            : undefined
        }
        onDelete={
          onDelete
            ? () => {
                void Promise.resolve(onDelete(message.id));
                closeActions();
              }
            : undefined
        }
        onRetry={isFailedMessage(message) ? handleRetry : undefined}
      />
    </div>
  );
};

export default MessageCluster;
