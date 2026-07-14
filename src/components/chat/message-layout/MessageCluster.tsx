import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { ReplyPreview } from "./ReplyPreview";
import { MessageActions } from "../../message/MessageActions";
import { ThreadIndicator } from "../../message/ThreadIndicator";
import type { Attachment, Conversation, ImageClickPayload, Message } from "../../../types";
import { MessageType, RoomType } from "../../../types";
import { normalizeRoomType } from "../../../lib/conversationAdapter";
import { useAuthStore } from "../../../stores";
import { useRetrySendMessage } from "../../../features/chat/hooks/useSendMessage";
import { UserProfile } from "../../info/UserProfile";
import { DraggableProfileModal } from "../../info/DraggableProfileModal";
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
import { useEnrichedProfileStore } from "../../../stores/enrichedProfileStore";
import { enrichUserProfile } from "../../../services/enrichUserProfile";
import { MessageBodyRenderer } from "./MessageBodyRenderer";
import { MessageMeta } from "./MessageMeta";
import { MessageRow } from "./MessageRow";
import { MessageSurface } from "./MessageSurface";
import { MessageEditHistoryModal } from "../../message/MessageEditHistoryModal";
import type { TimelineMergeLevel } from "../../../hooks/useMessageGrouping";
import type { ChatDensity } from "../../../stores/uiStore";
import { getTimelineDensityContract } from "../timelineDensity";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";
import { MessageActionBar } from "../MessageActionBar";
import { QuickReactBar } from "../QuickReactBar";
import { ReactionBar } from "../ReactionBar";
import { dispatchStartDirectMessage } from "../../../features/chat/events/chatUiEvents";
import { copyTextToClipboard } from "../../../utils/clipboard";
import { getCopyableMessageText } from "../../../utils/messageCopy";
import { toast } from "../../ui";
import { logger } from "../../../utils/logger";

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
  onStartSelectionMode?: () => void;
  onToggleSelect?: (messageId: string) => void;
  onImageClick?: (payload: ImageClickPayload) => void;
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
  onForward,
  onPin,
  onUnpin,
  onStartSelectionMode,
  onToggleSelect,
  onImageClick,
  onFilePreview,
  isSelectionMode = false,
  density,
  onNavigateToMessage,
  currentUsername,
  viewerCanPin,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  shouldAnimateInsert = false,
  className,
}) => {
  const { t } = useTranslation();
  const contract = getTimelineDensityContract(density);
  const retrySendMessage = useRetrySendMessage();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [isActionsOpen, setIsActionsOpen] = React.useState(false);
  const [isHovered, setIsHovered] = React.useState(false);
  const [showReactionPicker, setShowReactionPicker] = React.useState(false);
  const [copiedMessageId, setCopiedMessageId] = React.useState<string | null>(null);
  const [savedMessageIds, setSavedMessageIds] = React.useState<Set<string>>(
    () => new Set<string>(),
  );
  const [editHistoryMessageId, setEditHistoryMessageId] = React.useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const copiedTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalizedConversationType = normalizeRoomType(conversationType);
  const isGroupConversation =
    normalizedConversationType !== RoomType.PRIVATE &&
    normalizedConversationType !== RoomType.DIRECT;
  const coarsePointer = isCoarsePointer();
  // ponytail: poll AND reminder render as a horizontally-centered card (Zalo-style,
  // like a date/system row), never an own/right bubble — drop avatar/sender-label/
  // bubble-chrome. Same layout treatment for both interactive cards.
  const isPoll = message.type === MessageType.POLL || message.type === MessageType.REMINDER;
  const threadCountValue = (() => {
    const candidate = message as unknown as { threadCount?: unknown };
    return typeof candidate.threadCount === "number"
      ? candidate.threadCount
      : 0;
  })();
  const enrichedSenderName = useEnrichedProfileStore(
    React.useMemo(() => (s) => s.nameByUserId[message.senderId], [message.senderId]),
  );
  const replySenderId = message.replyToMessage?.senderId;
  const enrichedReplySenderName = useEnrichedProfileStore(
    React.useMemo(() => (s) => (replySenderId ? s.nameByUserId[replySenderId] : undefined), [replySenderId]),
  );
  React.useEffect(() => {
    enrichUserProfile(message.senderId);
    if (replySenderId) enrichUserProfile(replySenderId);
  }, [message.senderId, replySenderId]);

  const senderDisplayName =
    enrichedSenderName ??
    resolveUserDisplayName({
      displayName: message.senderName,
      username: message.senderId,
    });
  const replySenderDisplayName = message.replyToMessage
    ? (enrichedReplySenderName ??
      resolveUserDisplayName({
        displayName: message.replyToMessage.senderName,
        username: message.replyToMessage.senderId,
      }))
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
  // Keep isActionsOpen in a ref so the leave callback reads fresh value without stale closure.
  const isActionsOpenRef = React.useRef(isActionsOpen);

  React.useEffect(() => {
    isActionsOpenRef.current = isActionsOpen;
  }, [isActionsOpen]);

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
    // Only hide the action bar rail on leave — never close the reaction picker here.
    // The picker (showReactionPicker) is self-contained: it closes when the user picks
    // an emoji, clicks outside (document mousedown), or presses ESC. Tying its
    // lifetime to hover state makes it impossible to drag the mouse from the action
    // picker lifetime to hover state (picker self-closes via outside click / ESC).
    leaveTimerRef.current = setTimeout(() => {
      if (!isActionsOpenRef.current) {
        setIsHovered(false);
      }
    }, 150);
  }, []);

  React.useEffect(
    () => () => {
      clearLongPressTimer();
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [clearLongPressTimer],
  );

  const handleRetry = React.useCallback(() => {
    if (!message.conversationId) return;
    void retrySendMessage(message).catch(() => undefined);
  }, [message, retrySendMessage]);

  const openActions = React.useCallback(() => {
    setIsActionsOpen(true);
  }, []);

  const closeActions = React.useCallback(() => {
    setIsActionsOpen(false);
    hideRail(true);
  }, [hideRail]);

  const handleCopy = React.useCallback(async () => {
    const text = getCopyableMessageText(message);
    if (!text) {
      toast.error(
        t("chat:message.copyFailure", {
          defaultValue: "Không thể sao chép tin nhắn",
        }),
      );
      closeActions();
      return;
    }

    const success = await copyTextToClipboard(text);
    if (success) {
      toast.success(
        t("chat:message.copySuccess", {
          defaultValue: "Đã sao chép tin nhắn",
        }),
      );
      setCopiedMessageId(message.id);
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        setCopiedMessageId((current) =>
          current === message.id ? null : current,
        );
      }, 1200);
    } else {
      logger.debug(
        "message_copy",
        "clipboard_write_failed",
        { messageId: message.id, messageType: message.type },
        { debugOnly: true },
      );
      toast.error(
        t("chat:message.copyFailure", {
          defaultValue: "Không thể sao chép tin nhắn",
        }),
      );
    }
    closeActions();
  }, [closeActions, message, t]);

  const actionPolicy = React.useMemo(
    () =>
      resolveMessageActions({
        message,
        isOwn,
        isCoarsePointer: coarsePointer,
        isSelectionMode,
        canRetry: isFailedMessage(message),
        canPin: viewerCanPin,
        isPinned: message.isPinned === true,
        isSaved: savedMessageIds.has(message.id),
        canForward: Boolean(onForward),
        canSelect: Boolean(onStartSelectionMode && onToggleSelect),
      }),
    [
      coarsePointer,
      isOwn,
      isSelectionMode,
      message,
      onForward,
      onStartSelectionMode,
      onToggleSelect,
      savedMessageIds,
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
          void handleCopy();
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
          } else if (onPin) {
            void Promise.resolve(onPin(message.id));
          }
          closeActions();
          break;
        case "save":
          setSavedMessageIds((previous) => new Set(previous).add(message.id));
          toast.success(
            t("chat:message.saveSuccess", { defaultValue: "Đã lưu tin nhắn" }),
          );
          closeActions();
          break;
        case "unsave":
          setSavedMessageIds((previous) => {
            const next = new Set(previous);
            next.delete(message.id);
            return next;
          });
          toast.success(
            t("chat:message.unsaveSuccess", { defaultValue: "Đã bỏ lưu tin nhắn" }),
          );
          closeActions();
          break;
        case "select":
          onStartSelectionMode?.();
          onToggleSelect?.(message.id);
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
      onForward,
      onPin,
      onStartSelectionMode,
      onToggleSelect,
      onUnpin,
      onReply,
      openActions,
      t,
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

  const railActions = actionPolicy.railActions;
  const hasRailAction = React.useCallback(
    (actionId: MessageActionId) => railActions.includes(actionId),
    [railActions],
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
        isOwn={isPoll ? false : isOwn}
        actionRail={
          (isHovered || showReactionPicker) && railActions.length > 0 ? (
            <div
              className="transition-fast pointer-events-auto opacity-100"
              onMouseEnter={handleClusterMouseEnter}
            >
              <MessageActionBar
                onReplyClick={
                  hasRailAction("reply") ? () => onReply(message) : undefined
                }
                onForwardClick={
                  hasRailAction("forward") && onForward
                    ? () => { onForward(message); hideRail(true); }
                    : undefined
                }
                onCopyClick={
                  hasRailAction("copy") ? () => { void handleCopy(); } : undefined
                }
                onMoreClick={
                  hasRailAction("more") ? openActions : undefined
                }
                copied={copiedMessageId === message.id}
                onReactClick={
                  hasRailAction("react")
                    ? () => setShowReactionPicker((v) => !v)
                    : undefined
                }
                reactionPickerNode={
                  showReactionPicker && !isSelectionMode ? (
                    <QuickReactBar
                      visible={true}
                      align="center"
                      currentUserReaction={myReactionEmoji}
                      onReact={(emoji) => {
                        handleReactionSelect(emoji);
                        setShowReactionPicker(false);
                      }}
                      onClose={() => setShowReactionPicker(false)}
                    />
                  ) : undefined
                }
              />
            </div>
          ) : null
        }
      >
        <div
          className={clsx(
            "chat-message-cluster-row flex w-full min-w-0 items-end",
            contract.cluster.rowGap,
            isPoll ? "justify-center" : isOwn ? "justify-end" : "justify-start",
          )}
        >
          {isGroupConversation && !isOwn && !isPoll && (
            <div className="chat-message-avatar-slot w-9 shrink-0 self-end">
              {showAvatar ? (
                <Avatar
                  src={message.senderAvatar}
                  alt={senderDisplayName}
                  size="sm"
                  onClick={() => setViewingUserId(message.senderId)}
                />
              ) : null}
            </div>
          )}

          <div
            className={clsx(
              "min-w-0 relative",
              isPoll ? "items-center" : isOwn ? "items-end" : "items-start",
              "flex max-w-[var(--chat-bubble-max)] flex-col",
              shouldAnimateInsert && "motion-message-insert",
            )}
          >
            <div
              className={clsx(
                "flex w-full",
                isPoll ? "justify-center" : isOwn ? "justify-end" : "justify-start",
              )}
            >
              {/* Wrapper inline để pill absolute neo đúng vào bubble */}
              <div className={clsx("relative", message.reactions && message.reactions.length > 0 && "mb-2")}>
                <div
                  onPointerDown={handlePointerDown}
                  onPointerUp={clearLongPressTimer}
                  onPointerLeave={clearLongPressTimer}
                  onPointerCancel={clearLongPressTimer}
                >
                  <MessageSurface
                    isOwn={isOwn}
                    isGroupStart={isGroupStart}
                    isGroupEnd={isGroupEnd}
                    mergeLevel={mergeLevel}
                    hasError={isFailedMessage(message)}
                    isPending={isPendingMessage(message)}
                    bare={isPoll}
                  >
                    {isGroupConversation && !isOwn && showSenderName && !isPoll && (
                      <p className={clsx(contract.cluster.senderLabel, "truncate")}>
                        {senderDisplayName}
                      </p>
                    )}

                    {message.replyToMessage && (
                      <ReplyPreview
                        replyToMessage={message.replyToMessage}
                        replySenderDisplayName={replySenderDisplayName}
                        replyTargetMessageId={replyTargetMessageId}
                        isSelectionMode={isSelectionMode}
                        isOwn={isOwn}
                        replyPreviewClass={contract.cluster.replyPreview}
                        conversationId={message.conversationId}
                        onClick={handleReplyPreviewClick}
                      />
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
            </div>

            {/* Reaction pill neo vào góc dưới của bubble */}
            {message.reactions && message.reactions.length > 0 && (
              <div
                className={clsx(
                  "absolute bottom-0 translate-y-1/2 z-10 pointer-events-auto",
                  isOwn ? "right-0" : "left-0",
                )}
              >
                <ReactionBar
                  reactions={message.reactions}
                  currentUserId={currentUserId}
                  isOutgoing={isOwn}
                  onReact={handleReactionSelect}
                  onToggleReaction={handleReactionToggle}
                  conversationId={message.conversationId}
                />
              </div>
            )}

            {showMeta && (
              <MessageMeta
                message={message}
                isOwn={isOwn}
                showStatus={showStatus}
                density={density}
                onRetry={handleRetry}
                onViewEditHistory={
                  message.isEdited
                    ? (id) => setEditHistoryMessageId(id)
                    : undefined
                }
                className={
                  message.type === MessageType.POLL || message.type === MessageType.REMINDER
                    ? "!text-[#1565C0]/70"
                    : undefined
                }
              />
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
      />

      {editHistoryMessageId && (
        <MessageEditHistoryModal
          messageId={editHistoryMessageId}
          onClose={() => setEditHistoryMessageId(null)}
        />
      )}

      {viewingUserId && (
        <DraggableProfileModal onClose={() => setViewingUserId(null)}>
          <UserProfile
            userId={viewingUserId}
            currentUserId={currentUserId ?? ""}
            conversationContext="group"
            initialUser={
              viewingUserId === message.senderId
                ? { id: message.senderId, username: message.senderId, displayName: message.senderName ?? undefined, avatar: message.senderAvatar ?? undefined }
                : null
            }
            onClose={() => setViewingUserId(null)}
            onStartConversation={(uid) => {
              setViewingUserId(null);
              dispatchStartDirectMessage({ userId: uid });
            }}
          />
        </DraggableProfileModal>
      )}
    </div>
  );
};

export type { MessageClusterProps };
export const MessageCluster = React.memo(MessageClusterComponent);
