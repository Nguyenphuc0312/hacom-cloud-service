import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ChatBubbleLeftIcon,
  DocumentIcon,
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
import { useAuthStore, useChatStore } from "../../../stores";
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
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";
import { MessageBodyRenderer } from "./MessageBodyRenderer";
import { MessageMeta } from "./MessageMeta";
import { MessageRow } from "./MessageRow";
import { MessageSurface } from "./MessageSurface";
import type { TimelineMergeLevel } from "../../../hooks/useMessageGrouping";
import type { ChatDensity } from "../../../stores/uiStore";
import { getTimelineDensityContract } from "../timelineDensity";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";

interface MessageClusterProps {
  message: Message;
  isOwn: boolean;
  mergeLevel?: TimelineMergeLevel;
  showAvatar: boolean;
  showSenderName?: boolean;
  showMeta?: boolean;
  showStatus?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  conversationType: Conversation["type"];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  isSelectionMode?: boolean;
  density?: ChatDensity;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  /** Viewer (admin/owner) được phép "Xóa ở mọi người" trên tin của người khác. */
  viewerCanRecallOthers?: boolean;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;
  onToggleTextExpand?: () => void;
  shouldAnimateInsert?: boolean;
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

export const MessageCluster: React.FC<MessageClusterProps> = ({
  message,
  isOwn,
  mergeLevel = "not-merged",
  showAvatar,
  showSenderName = false,
  showMeta = true,
  showStatus = false,
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
  density,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  shouldAnimateInsert = false,
  className,
}) => {
  const { t } = useTranslation();
  const contract = getTimelineDensityContract(density);
  const resendMessage = useChatStore((s) => s.resendMessage);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [isRailVisible, setIsRailVisible] = React.useState(false);
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);
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
    })
    : null;
  const replyTargetMessageId = message.replyTo || message.replyToMessage?.id;

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const showRail = React.useCallback(() => {
    setIsRailVisible(true);
  }, []);

  const hideRail = React.useCallback(
    (force = false) => {
      if (force || !isActionsOpen) {
        setIsRailVisible(false);
      }
    },
    [isActionsOpen],
  );

  React.useEffect(
    () => () => {
      clearLongPressTimer();
    },
    [clearLongPressTimer],
  );

  const handleRetry = React.useCallback(() => {
    if (!message.conversationId) return;
    void resendMessage(message.conversationId, message);
  }, [message, resendMessage]);

  const openActions = React.useCallback(() => {
    setIsActionsOpen(true);
    setIsRailVisible(true);
  }, []);

  const closeActions = React.useCallback(() => {
    setIsActionsOpen(false);
    hideRail(true);
  }, [hideRail]);

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
        // Admin/owner có quyền recall tin của người khác, không phụ thuộc 24h window.
        // Khi không truyền canDeleteForEveryone, policy fallback: isOwn && within 24h.
        canDeleteForEveryone:
          Boolean(onDelete) && !isOwn && viewerCanRecallOthers === true
            ? true
            : undefined,
        canRetry: isFailedMessage(message),
      }),
    [
      coarsePointer,
      isOwn,
      isSelectionMode,
      message,
      onDelete,
      onEdit,
      viewerCanRecallOthers,
    ],
  );

  const handleAction = React.useCallback(
    (actionId: MessageActionId) => {
      switch (actionId) {
        case "react":
          onReact(message.id, "\u{1F44D}");
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
        case "deleteForMe":
          if (onDelete) {
            void Promise.resolve(onDelete(message.id, "FOR_ME"));
          }
          closeActions();
          break;
        case "deleteForEveryone":
          if (onDelete) {
            // Khi !isOwn nghĩa là admin/owner đang xóa tin của người khác.
            // Pass flag để ChatPage hiện confirm copy khác.
            const adminCtx = !isOwn ? "ADMIN_DELETE" : undefined;
            void Promise.resolve(
              (onDelete as (
                id: string,
                mode?: "FOR_ME" | "FOR_EVERYONE",
                context?: "ADMIN_DELETE",
              ) => unknown)(message.id, "FOR_EVERYONE", adminCtx),
            );
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
      isOwn,
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

  const adminRecallLabelOverride = React.useMemo(
    () =>
      !isOwn && viewerCanRecallOthers
        ? ({
            deleteForEveryone: t("chat:message.actions.deleteForEveryoneAdmin", {
              defaultValue: "Xóa ở mọi người",
            }),
          } as const)
        : undefined,
    [isOwn, viewerCanRecallOthers, t],
  );

  const actionRail =
    actionPolicy.railActions.length > 0 ? (
      <MessageActions
        mode="rail"
        actions={actionPolicy.railActions}
        onAction={handleAction}
        actionLabelOverrides={adminRecallLabelOverride}
      />
    ) : null;

  return (
    <div
      className={clsx("group/message-cluster w-full", className)}
      onMouseEnter={showRail}
      onMouseLeave={() => hideRail()}
      onFocusCapture={showRail}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocused)) {
          hideRail();
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
            "chat-message-cluster-row flex w-full min-w-0 items-end",
            contract.cluster.rowGap,
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          {isGroupConversation && !isOwn && (
            <div className="chat-message-avatar-slot w-9 shrink-0 self-end">
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
              shouldAnimateInsert && "motion-message-insert",
            )}
          >
            {message.replyToMessage && (
              <button
                type="button"
                onClick={handleReplyPreviewClick}
                disabled={!replyTargetMessageId || isSelectionMode}
                className={clsx(
                  "flex w-full items-center border-l-[3px] text-left transition-colors",
                  contract.cluster.replyPreview,
                  replyTargetMessageId && !isSelectionMode
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default",
                  isOwn
                    ? "border-primary/70 bg-primary/5 text-text-primary dark:bg-primary/15"
                    : "border-primary/40 bg-surface-hover/80 text-text-primary dark:bg-surface-hover/30",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <ReplyTypeIcon
                    type={message.replyToMessage.type}
                    className="h-3.5 w-3.5 shrink-0 text-text-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-bold leading-none text-primary">
                      {replySenderDisplayName}
                    </span>
                    <p className="mt-1 truncate text-[12.5px] leading-tight text-text-secondary">
                      {message.replyToMessage.isDeleted
                        ? message.replyToMessage.lifecycleStatus ===
                            "deleted_admin"
                          ? t("chat:message.deletedByAdmin", {
                              defaultValue:
                                "Tin nhắn đã bị xóa bởi quản trị viên",
                            })
                          : message.replyToMessage.lifecycleStatus === "recalled"
                            ? t("chat:message.recalled", {
                                defaultValue: "Tin nhắn đã được thu hồi",
                              })
                            : t("chat:message.deleted", {
                                defaultValue: "Tin nhắn đã được thu hồi",
                              })
                        : getPreviewFromMessage({
                            contentFormat: message.replyToMessage.contentFormat,
                            content: message.replyToMessage.content,
                          })}
                    </p>
                  </div>
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
                mergeLevel={mergeLevel}
                hasError={isFailedMessage(message)}
                isPending={isPendingMessage(message)}
              >
                {isGroupConversation && !isOwn && showSenderName && (
                  <p className={clsx(contract.cluster.senderLabel, "truncate")}>
                    {senderDisplayName}
                  </p>
                )}

                {message.forwardedFrom && (
                  <div
                    className={clsx(
                      contract.cluster.forwardedBadge,
                      isOwn ? "text-text-inverse/82" : "text-text-secondary",
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
                  textRenderMode={textRenderMode}
                  isCollapsibleText={isCollapsibleText}
                  onToggleTextExpand={onToggleTextExpand}
                  onImageClick={onImageClick}
                  onFilePreview={onFilePreview}
                />
              </MessageSurface>
            </div>

            {showMeta && (
              <MessageMeta
                message={message}
                isOwn={isOwn}
                showStatus={showStatus}
                density={density}
              />
            )}

            {(message.reactions?.length ?? 0) > 0 && (
              <div
                className={clsx(
                  contract.cluster.reactionOffset,
                  isOwn ? "self-end" : "self-start",
                )}
              >
                <ReactionBar
                  reactions={message.reactions}
                  currentUserId={currentUserId}
                  onReact={(emoji) => onReact(message.id, emoji)}
                />
              </div>
            )}

            {threadCountValue > 0 && (
              <ThreadIndicator
                threadCount={threadCountValue}
                isOwn={isOwn}
                className={contract.cluster.threadOffset}
              />
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
        actionLabelOverrides={adminRecallLabelOverride}
      />
    </div>
  );
};

export default MessageCluster;
