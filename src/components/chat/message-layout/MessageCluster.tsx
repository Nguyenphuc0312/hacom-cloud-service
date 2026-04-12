import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftIcon,
  ClockIcon,
  DocumentIcon,
  ExclamationCircleIcon,
  PhotoIcon,
  SpeakerWaveIcon,
  TrashIcon,
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
  resolveMessageActions,
  type MessageActionId,
} from "../../../utils/messageActionPolicy";
import {
  isFailedMessage,
  isPendingMessage,
} from "../../../utils/messageTimeline";
import { logScrollTrace } from "../../../utils/scrollTrace";
import { resolveUserDisplayName } from "../../../features/chat/identity/resolveUserDisplayName";
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
  isSelectionMode?: boolean;
  onNavigateToMessage?: (messageId: string) => void;
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
  onRemove: () => void;
}> = ({ message, isOwn, onRetry, onRemove }) => {
  const { t } = useTranslation();
  const failed = isFailedMessage(message);
  const pending = isPendingMessage(message);

  if (!isOwn || (!failed && !pending)) {
    return null;
  }

  const label = failed
    ? t("chat:message.status.failedInline", {
        defaultValue: "Failed to send",
      })
    : t("chat:message.status.pendingInline", {
        defaultValue: "Sending",
      });

  const failureHint = failed
    ? message.errorMessage ||
      (message.failureReason === "network"
        ? t("chat:message.status.networkError", {
            defaultValue: "No network connection. Please retry.",
          })
        : message.failureReason === "timeout"
          ? t("chat:message.status.timeoutError", {
              defaultValue: "Message timed out. Please retry.",
            })
          : message.failureReason === "permission"
            ? t("chat:composer.permissionDenied", {
                defaultValue:
                  "You can no longer send messages in this conversation.",
              })
            : message.failureReason === "slow_mode"
              ? t("chat:message.status.slowModeError", {
                  defaultValue: "Slow mode is active. Please wait and retry.",
                })
              : message.failureReason === "backend_4xx"
                ? t("chat:message.status.backend4xxError", {
                    defaultValue: "Message was rejected. Please retry.",
                  })
                : message.failureReason === "backend_5xx"
                  ? t("chat:message.status.backend5xxError", {
                      defaultValue: "Server is busy. Please try again.",
                    })
                  : t("chat:message.status.unknownError", {
                      defaultValue: "Could not send message.",
                    }))
    : null;

  if (pending && !failed) {
    return (
      <div
        className={clsx(
          "mt-1.5 inline-flex max-w-full items-center gap-1.5 px-1 text-[11px] font-medium text-text-muted",
          isOwn ? "self-end" : "self-start",
        )}
      >
        <ClockIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "mt-1.5 inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-xs backdrop-blur-sm",
        isOwn ? "self-end" : "self-start",
        "border-danger/20 bg-danger/10 text-danger",
      )}
    >
      <ExclamationCircleIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {failureHint ? (
        <span className="hidden truncate text-danger/85 md:inline">
          {failureHint}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger transition-micro hover:bg-danger/10"
      >
        {t("chat:message.status.retry", { defaultValue: "Retry" })}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-danger transition-micro hover:bg-danger/10"
      >
        <TrashIcon className="h-3 w-3" />
        {t("chat:message.actions.delete", { defaultValue: "Delete" })}
      </button>
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
  isSelectionMode = false,
  onNavigateToMessage,
  currentUsername,
  className,
}) => {
  const { t } = useTranslation();
  const resendMessage = useChatStore((s) => s.resendMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const [isRailVisible, setIsRailVisible] = React.useState(false);
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);
  const openRailTimerRef = React.useRef<number | null>(null);
  const closeRailTimerRef = React.useRef<number | null>(null);
  const normalizedConversationType = normalizeRoomType(conversationType);
  const isGroupConversation =
    normalizedConversationType !== RoomType.PRIVATE &&
    normalizedConversationType !== RoomType.DIRECT;
  const coarsePointer = isCoarsePointer();
  const threadCountValue = (() => {
    const candidate = message as unknown as { threadCount?: unknown };
    return typeof candidate.threadCount === "number"
      ? candidate.threadCount
      : 0;
  })();
  const senderDisplayName = resolveUserDisplayName({
    displayName: message.senderName,
    username: message.senderId,
  });
  const replySenderDisplayName = message.replyToMessage
    ? resolveUserDisplayName({
        displayName: message.replyToMessage.senderName,
        username: message.replyToMessage.senderId,
      })
    : null;
  const forwardedFromName = message.forwardedFrom
    ? resolveUserDisplayName({
        displayName:
          (message.forwardedFrom as { displayName?: string | null })
            .displayName || message.forwardedFrom.username,
        username: message.forwardedFrom.username,
        employeeCode: (
          message.forwardedFrom as { employeeCode?: string | null }
        ).employeeCode,
      })
    : null;
  const replyTargetMessageId = message.replyTo || message.replyToMessage?.id;

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

  const scheduleRailClose = React.useCallback(
    (force = false) => {
      clearRailTimers();
      closeRailTimerRef.current = window.setTimeout(() => {
        if (force || !isActionsOpen) {
          setIsRailVisible(false);
        }
        closeRailTimerRef.current = null;
      }, 90);
    },
    [clearRailTimers, isActionsOpen],
  );

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

  const handleRemoveFailed = React.useCallback(() => {
    if (!message.conversationId) return;
    removeMessage(message.conversationId, message.id);
  }, [message.conversationId, message.id, removeMessage]);

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

  const actionPolicy = React.useMemo(
    () =>
      resolveMessageActions({
        message,
        isOwn,
        isCoarsePointer: coarsePointer,
        isSelectionMode,
        canEdit: Boolean(onEdit),
        canDelete: Boolean(onDelete),
        canRetry: isFailedMessage(message),
      }),
    [coarsePointer, isOwn, isSelectionMode, message, onDelete, onEdit],
  );

  const handleAction = React.useCallback(
    (actionId: MessageActionId) => {
      switch (actionId) {
        case "react":
          onReact(message.id, "👍");
          if (isActionsOpen) closeActions();
          break;
        case "reply":
          onReply(message);
          if (isActionsOpen) closeActions();
          break;
        case "copy":
          handleCopy();
          break;
        case "edit":
          if (onEdit) {
            void Promise.resolve(onEdit(message));
          }
          closeActions();
          break;
        case "delete":
          if (onDelete) {
            void Promise.resolve(onDelete(message.id));
          }
          closeActions();
          break;
        case "retry":
          handleRetry();
          closeActions();
          break;
        case "more":
          openActions();
          break;
      }
    },
    [
      closeActions,
      handleCopy,
      handleRetry,
      isActionsOpen,
      message,
      onDelete,
      onEdit,
      onReact,
      onReply,
      openActions,
    ],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!coarsePointer || event.pointerType === "mouse") return;
      if (actionPolicy.menuActions.length === 0) return;
      clearLongPressTimer();
      longPressTimerRef.current = window.setTimeout(() => {
        openActions();
      }, 300);
    },
    [
      actionPolicy.menuActions.length,
      clearLongPressTimer,
      coarsePointer,
      openActions,
    ],
  );

  const handleReplyPreviewClick = React.useCallback(() => {
    if (!replyTargetMessageId || isSelectionMode) return;

    logScrollTrace("reply_preview_clicked", {
      conversationId: message.conversationId,
      messageId: message.id,
      targetMessageId: replyTargetMessageId,
    });
    onNavigateToMessage?.(replyTargetMessageId);
  }, [
    isSelectionMode,
    message.conversationId,
    message.id,
    onNavigateToMessage,
    replyTargetMessageId,
  ]);

  const actionRail =
    actionPolicy.railActions.length > 0 ? (
      <MessageActions
        mode="rail"
        actions={actionPolicy.railActions}
        onAction={handleAction}
      />
    ) : null;

  return (
    <div
      className={clsx("group/message-cluster w-full", className)}
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
          actionRail ? (
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
          ) : null
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
                  alt={senderDisplayName}
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
                {senderDisplayName}
              </span>
            )}

            {message.replyToMessage && (
              <button
                type="button"
                onClick={handleReplyPreviewClick}
                disabled={!replyTargetMessageId || isSelectionMode}
                className={clsx(
                  "mb-1 flex w-full items-center gap-2 rounded-2xl border-l-2 px-3 py-2 text-left text-xs transition-colors",
                  replyTargetMessageId && !isSelectionMode
                    ? "cursor-pointer hover:bg-black/5"
                    : "cursor-default",
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
                    {replySenderDisplayName}
                  </span>
                  <p className="mt-0.5 truncate leading-snug opacity-90">
                    {message.replyToMessage.isDeleted
                      ? t("chat:message.deleted", {
                          defaultValue: "Message deleted",
                        })
                      : message.replyToMessage.content}
                  </p>
                </div>
              </button>
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
                isPending={isPendingMessage(message)}
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
                      name: forwardedFromName,
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
                onRemove={handleRemoveFailed}
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
        actions={actionPolicy.menuActions}
        isOpen={isActionsOpen}
        onAction={handleAction}
        onClose={closeActions}
      />
    </div>
  );
};

export default MessageCluster;
