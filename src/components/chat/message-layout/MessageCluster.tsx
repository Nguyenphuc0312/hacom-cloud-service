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
import { MessageActionBar } from "../MessageActionBar";
import { QuickReactBar } from "../QuickReactBar";
import { ReactionBar } from "../ReactionBar";

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
  onForward?: (message: Message) => void;
  onPin?: (messageId: string) => void | Promise<void>;
  onUnpin?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  isSelectionMode?: boolean;
  density?: ChatDensity;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  /** Viewer (admin/owner) được phép "Xóa ở mọi người" trên tin của người khác. */
  viewerCanRecallOthers?: boolean;
  /** Viewer (admin/owner) được phép ghim tin nhắn. */
  viewerCanPin?: boolean;
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

export const MessageClusterComponent: React.FC<MessageClusterProps> = ({
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
  onForward,
  onPin,
  onUnpin,
  onImageClick,
  onFilePreview,
  isSelectionMode = false,
  density,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  viewerCanPin,
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
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);
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
  const replyTargetMessageId = message.replyTo || message.replyToMessage?.id;

  // Get user's current reaction emoji
  const myReactionEmoji = React.useMemo(() => {
    if (!currentUserId || !message.reactions) return null;
    const group = message.reactions.find((r) => r.userIds.includes(currentUserId));
    return group?.emoji ?? null;
  }, [message.reactions, currentUserId]);

  const handleReactionSelect = React.useCallback(
    (emoji: string) => {
      onReact(message.id, emoji);
    },
    [message.id, onReact],
  );

  const handleReactionToggle = React.useCallback(
    (emoji: string) => {
      // If same emoji, toggle off; otherwise, replace
      onReact(message.id, emoji);
    },
    [message.id, onReact],
  );

  const leaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const hideRail = React.useCallback(
    (force = false) => {
      if (force || !isActionsOpen) {
        setIsHovered(false);
        setShowReactionPicker(false);
      }
    },
    [isActionsOpen],
  );

  const handleClusterMouseEnter = React.useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleClusterMouseLeave = React.useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      hideRail();
      setIsHovered(false);
    }, 150);
  }, [hideRail]);

  React.useEffect(
    () => () => {
      clearLongPressTimer();
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    },
    [clearLongPressTimer],
  );

  const handleRetry = React.useCallback(() => {
    if (!message.conversationId) return;
    void resendMessage(message.conversationId, message);
  }, [message, resendMessage]);

  const openActions = React.useCallback(() => {
    setIsActionsOpen(true);
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
        canPin: viewerCanPin,
        isPinned: message.isPinned === true,
      }),
    [
      coarsePointer,
      isOwn,
      isSelectionMode,
      message,
      onDelete,
      onEdit,
      viewerCanRecallOthers,
      viewerCanPin,
    ],
  );

  const handleAction = React.useCallback(
    (actionId: MessageActionId) => {
      switch (actionId) {
        case "react":
          if (isActionsOpen) closeActions();
          setIsHovered(true);
          break;
        case "reply":
          onReply(message);
          if (isActionsOpen) closeActions();
          break;
        case "forward":
          if (onForward) {
            onForward(message);
          }
          closeActions();
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
        case "pin":
          if (onPin) {
            void Promise.resolve(onPin(message.id));
          }
          closeActions();
          break;
        case "unpin":
          if (onUnpin) {
            void Promise.resolve(onUnpin(message.id));
          }
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
      onForward,
      onPin,
      onUnpin,
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

  return (
    <div
      className={clsx("group/message-cluster w-full", className)}
      onMouseEnter={handleClusterMouseEnter}
      onMouseLeave={handleClusterMouseLeave}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocused)) {
          hideRail();
          setIsHovered(false);
        }
      }}
    >
      <MessageRow
        isOwn={isOwn}
        actionRail={
          isHovered ? (
            <div className="transition-fast pointer-events-auto opacity-100">
              <MessageActionBar
                isOutgoing={isOwn}
                onReplyClick={() => onReply(message)}
                onMoreClick={openActions}
                onForwardClick={onForward ? () => { onForward(message); hideRail(true); } : undefined}
                onReactClick={() => setShowReactionPicker((v) => !v)}
              />
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
                    ? "border-primary/70 bg-primary/10 text-text-primary dark:bg-primary/20"
                    : "border-primary/40 bg-surface-hover text-text-primary dark:bg-surface-hover/50",
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

            <div className="relative w-full">
              <QuickReactBar
                visible={showReactionPicker && !isSelectionMode}
                isMine={isOwn}
                currentUserReaction={myReactionEmoji}
                onReact={(emoji) => {
                  handleReactionSelect(emoji);
                  setShowReactionPicker(false);
                }}
                onClose={() => setShowReactionPicker(false)}
                onMouseEnter={handleClusterMouseEnter}
                onMouseLeave={handleClusterMouseLeave}
              />
              <div
                onPointerDown={handlePointerDown}
                onPointerUp={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onPointerCancel={clearLongPressTimer}
                className={clsx(
                  "flex w-full",
                  isOwn ? "justify-end" : "justify-start",
                )}
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
            </div>

            {showMeta && (
              <MessageMeta
                message={message}
                isOwn={isOwn}
                showStatus={showStatus}
                density={density}
              />
            )}

            <div
              className={clsx(
                contract.cluster.reactionOffset,
                isOwn ? "self-end" : "self-start",
              )}
            >
              {/* New unified ReactionBar */}
              <ReactionBar
                reactions={message.reactions}
                currentUserId={currentUserId}
                isOutgoing={isOwn}
                onReact={handleReactionSelect}
                onToggleReaction={handleReactionToggle}
              />
            </div>

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

export type { MessageClusterProps };
export const MessageCluster = React.memo(MessageClusterComponent);
