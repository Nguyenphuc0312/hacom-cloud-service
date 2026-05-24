import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { MessageActions } from "../../message/MessageActions";
import { ThreadIndicator } from "../../message/ThreadIndicator";
import { MessageBodyRenderer } from "../message-layout/MessageBodyRenderer";
import { MessageMeta } from "../message-layout/MessageMeta";
import { MessageBubble, type MessageBubblePosition } from "./MessageBubble";
import type { Attachment, Message } from "../../../types";
import { useChatStore, useAuthStore } from "../../../stores";
import {
  type MessageActionId,
  resolveMessageActions,
} from "../../../utils/messageActionPolicy";
import {
  isFailedMessage,
  isPendingMessage,
  getMessageStableKey,
} from "../../../utils/messageTimeline";
import { resolveUserDisplayName } from "../../../features/chat/identity/resolveUserDisplayName";
import { getPreviewFromMessage } from "../../../utils/messageContent.utils";
import type { ChatDensity } from "../../../stores/uiStore";
import type {
  ConversationThreadGroupRow,
  ConversationThreadMessageItem,
} from "../../../features/chat/hooks/useConversationThreadRows";
import { resolveThreadMessageRenderState } from "../messageListShared";
import { recordChatRenderCount } from "../../../utils/chatPerformance";
import { QUICK_REACTIONS, EXTENDED_REACTIONS } from "../../../constants/emojis";
import { MessageActionBar } from "../MessageActionBar";
import { QuickReactBar } from "../QuickReactBar";
import { ReactionBar } from "../ReactionBar";

interface MessageGroupProps {
  row: ConversationThreadGroupRow;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward?: (message: Message) => void;
  onInspect?: (message: Message) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density?: ChatDensity;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  viewerCanRecallOthers?: boolean;
  expandedLongMessageIds: Set<string>;
  onToggleLongMessageExpand: (messageId: string) => void;
  insertedMessageKeys: Set<string>;
  highlightedMessageId: string | null;
}

const isCoarsePointer = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

const getThreadCount = (message: Message): number => {
  const candidate = message as Message & { threadCount?: number };
  return typeof candidate.threadCount === "number" ? candidate.threadCount : 0;
};

const resolveBubblePosition = (
  index: number,
  total: number,
): MessageBubblePosition => {
  if (total <= 1) {
    return "single";
  }

  if (index === 0) {
    return "first";
  }

  if (index === total - 1) {
    return "last";
  }

  return "middle";
};

/** Mobile full-screen emoji overlay — mirrors EmojiReactionPicker but centered */
const MobileEmojiOverlay: React.FC<{
  onSelect: (emoji: string) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const [showMore, setShowMore] = React.useState(false);
  const emojis = showMore ? EXTENDED_REACTIONS : QUICK_REACTIONS;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Đóng"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-4 shadow-elev3">
        <p className="mb-3 text-center text-xs font-semibold text-text-secondary">
          Chọn biểu cảm
        </p>
        <div className={clsx("flex flex-wrap justify-center gap-1", showMore && "max-w-xs mx-auto")}>
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Thả reaction ${emoji}`}
              onClick={() => { onSelect(emoji); onClose(); }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-all duration-100 hover:scale-110 hover:bg-surface-hover active:scale-95"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            aria-label={showMore ? "Thu gọn" : "Thêm"}
            onClick={() => setShowMore((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-overlay ring-1 ring-border transition-all duration-100 hover:scale-110 hover:bg-surface-hover"
          >
            <Plus
              size={16}
              strokeWidth={2.2}
              className={clsx("transition-transform duration-200 text-text-secondary", showMore && "rotate-45")}
            />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const MessageGroupItem: React.FC<{
  item: ConversationThreadMessageItem;
  isOwn: boolean;
  isGroupTail: boolean;
  bubblePosition: MessageBubblePosition;
  showSenderName?: boolean;
  senderDisplayName?: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  viewerCanRecallOthers?: boolean;
  expandedLongMessageIds: Set<string>;
  onToggleLongMessageExpand: (messageId: string) => void;
  insertedMessageKeys: Set<string>;
  highlightedMessageId: string | null;
}> = ({
  item,
  isOwn,
  isGroupTail,
  bubblePosition,
  showSenderName = false,
  senderDisplayName,
  onReply,
  onReact,
  onForward,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  expandedLongMessageIds,
  onToggleLongMessageExpand,
  insertedMessageKeys,
  highlightedMessageId,
}) => {
    const { t } = useTranslation();
    const currentUserId = useAuthStore((s) => s.user?.id);
    const [isActionSheetOpen, setIsActionSheetOpen] = React.useState(false);
    const [showReactionPicker, setShowReactionPicker] = React.useState(false);
    const [showMobileReact, setShowMobileReact] = React.useState(false);
    const [isHovered, setIsHovered] = React.useState(false);
    const leaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const message = item.message;
    recordChatRenderCount("MessageGroupItem", message.id, {
      isOwn,
      isSelectionMode,
      isSelected,
      isGroupTail,
    });
    const resendMessage = useChatStore((state) => state.resendMessage);
    // Fallback hydrate: when API trả về `replyTo` mà không có `replyToMessage`
    // (legacy messages, missing reply_snapshot), nhìn vào messageById index để
    // tự dựng quote preview từ message gốc đang có trong store.
    const replyTargetFromStore = useChatStore((state) =>
      !message.replyToMessage && message.replyTo
        ? state.messageById[message.replyTo]
        : undefined,
    );
    const resolvedReplyPreview = React.useMemo(() => {
      if (message.replyToMessage) return message.replyToMessage;
      if (!message.replyTo) return undefined;
      if (replyTargetFromStore) {
        return {
          id: replyTargetFromStore.id,
          senderId: replyTargetFromStore.senderId,
          senderName: replyTargetFromStore.senderName,
          senderAvatar: replyTargetFromStore.senderAvatar,
          content: replyTargetFromStore.content,
          contentFormat: replyTargetFromStore.contentFormat,
          type: replyTargetFromStore.type,
          isDeleted: replyTargetFromStore.isDeleted,
          createdAt: replyTargetFromStore.createdAt as unknown as Date,
          attachments: replyTargetFromStore.attachments,
        } as Message["replyToMessage"];
      }
      return undefined;
    }, [message.replyToMessage, message.replyTo, replyTargetFromStore]);
    const isHighlighted =
      highlightedMessageId === message.id ||
      highlightedMessageId === message.localId ||
      highlightedMessageId === message.stableId ||
      highlightedMessageId === message.clientMessageId;
    const renderState = resolveThreadMessageRenderState(
      item,
      expandedLongMessageIds,
    );
    const coarsePointer = isCoarsePointer();

    // Get user's current reaction emoji
    const myReactionEmoji = React.useMemo(() => {
      if (!currentUserId || !message.reactions) return null;
      const group = message.reactions.find((r) => r.userIds.includes(currentUserId));
      return group?.emoji ?? null;
    }, [message.reactions, currentUserId]);

    const handleReactionSelect = React.useCallback(
      (emoji: string) => {
        onReact(message.id, emoji);
        setShowMobileReact(false);
      },
      [message.id, onReact],
    );

    const handleReactionToggle = React.useCallback(
      (emoji: string) => {
        onReact(message.id, emoji);
      },
      [message.id, onReact],
    );

    const actionPolicy = React.useMemo(
      () =>
        resolveMessageActions({
          message,
          isOwn,
          isCoarsePointer: coarsePointer,
          isSelectionMode,
          canRetry: isFailedMessage(message),
          canForward: Boolean(onForward),
        }),
      [
        coarsePointer,
        isOwn,
        isSelectionMode,
        message,
        onForward,
      ],
    );
    const threadCount = getThreadCount(message);
    const isRichBubble =
      message.type !== "text" ||
      Boolean(message.replyToMessage) ||
      Boolean(message.replyTo) ||
      Boolean(message.forwardedFrom) ||
      message.isDeleted ||
      isFailedMessage(message) ||
      isPendingMessage(message);

    const inlineActions = coarsePointer ? [] : actionPolicy.railActions;

    const handleItemMouseEnter = React.useCallback(() => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = null;
      }
      setIsHovered(true);
    }, []);

    const handleItemMouseLeave = React.useCallback(() => {
      leaveTimerRef.current = setTimeout(() => {
        setIsHovered(false);
        // Never close showReactionPicker on mouseleave — it self-closes via
        // click-outside (document mousedown) or ESC. Closing here would make
        // it impossible to drag the mouse from the action bar into the picker.
      }, 180);
    }, []);

    React.useEffect(
      () => () => {
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
      },
      [],
    );

    const handleAction = React.useCallback(
      (actionId: MessageActionId) => {
        switch (actionId) {
          case "react":
            setIsActionSheetOpen(false);
            setShowMobileReact((prev) => !prev);
            return;

          case "reply":
            onReply(message);
            break;
          case "forward":
            if (onForward) {
              onForward(message);
            }
            break;
          case "copy":
            void navigator.clipboard.writeText(message.content || "");
            break;
          case "retry":
            if (message.conversationId) {
              void resendMessage(message.conversationId, message);
            }
            break;
          case "more":
            setIsActionSheetOpen(true);
            return;
        }

        setIsActionSheetOpen(false);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [message, onDelete, onEdit, onForward, onReact, onReply, resendMessage, isOwn],
    );

    const actionRail =
      inlineActions.length > 0 && !isSelectionMode ? (
        <div
          onMouseEnter={handleItemMouseEnter}
          onMouseLeave={handleItemMouseLeave}
          className={clsx(
            "absolute top-1 z-20 hidden transition-all duration-150 md:block",
            isOwn ? "right-full mr-2" : "left-full ml-2",
            (isHovered || showReactionPicker)
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-0.5 opacity-0",
          )}
        >
          <MessageActionBar
            isOutgoing={isOwn}
            onReplyClick={() => onReply(message)}
            onForwardClick={
              onForward
                ? () => {
                    onForward(message);
                    setIsHovered(false);
                  }
                : undefined
            }
            onReactClick={() => setShowReactionPicker((v) => !v)}
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
      ) : null;

    return (
      <div
        className={clsx(
          "group/message-item relative flex max-w-[var(--chat-bubble-max)] gap-2",
          isOwn ? "self-end" : "self-start",
          insertedMessageKeys.has(getMessageStableKey(message)) &&
          isPendingMessage(message) &&
          "motion-message-insert",
        )}
        onMouseEnter={handleItemMouseEnter}
        onMouseLeave={handleItemMouseLeave}
        onFocusCapture={handleItemMouseEnter}
        onBlurCapture={(event) => {
          const nextFocused = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(nextFocused)) {
            setIsHovered(false);
          }
        }}
        data-testid={`message-item-${message.id}`}
        data-message-id={message.id}
      >
        {isSelectionMode && (
          <div className="flex shrink-0 items-start pt-1.5">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(message.id)}
              className="h-4 w-4 cursor-pointer rounded border-border text-primary focus:ring-primary/30"
              aria-label={t("chat:selection.selectMessage", {
                defaultValue: "Chọn tin nhắn",
              })}
            />
          </div>
        )}

        <div
          className={clsx(
            "flex min-w-0 flex-1 items-start",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          <div className={clsx(
            "min-w-0 max-w-full flex flex-col",
            isOwn ? "items-end" : "items-start",
          )}>
            <div className="relative">
              {actionRail}
            <MessageBubble
              isOwn={isOwn}
              position={bubblePosition}
              isRich={isRichBubble}
              isHighlighted={isHighlighted}
            >
              {showSenderName && senderDisplayName && (
                <p className="mb-1 truncate text-[12px] font-semibold leading-[1.15] text-primary">
                  {senderDisplayName}
                </p>
              )}

              {message.replyToMessage && (
                <button
                  type="button"
                  onClick={() => {
                    const targetId =
                      message.replyTo || resolvedReplyPreview?.id;
                    if (targetId) {
                      onNavigateToMessage?.(targetId);
                    }
                  }}
                  className={clsx(
                    "mb-2 flex w-full items-start gap-2 rounded-[12px] border-l-2 px-2.5 py-2 text-left transition-colors",
                    isOwn
                      ? "border-[hsl(var(--chat-bubble-sent-text))/0.2] bg-[hsl(var(--chat-bubble-sent-text))/0.08] hover:bg-[hsl(var(--chat-bubble-sent-text))/0.12]"
                      : "border-border-strong/70 bg-surface-overlay/78 hover:bg-surface-hover",
                    !onNavigateToMessage && "cursor-default",
                  )}
                >
                  <div className="min-w-0">
                    <div
                      className={clsx(
                        "text-[11px] font-semibold leading-4",
                        isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.78]" : "text-text-secondary",
                      )}
                    >
                      {resolvedReplyPreview
                        ? resolveUserDisplayName({
                          displayName: resolvedReplyPreview.senderName,
                          username: resolvedReplyPreview.senderId,
                        })
                        : t("chat:message.replyingTo", {
                          defaultValue: "Tin nhắn được trả lời",
                        })}
                    </div>
                    <p
                      className={clsx(
                        "truncate text-[12px] leading-4",
                        isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.68]" : "text-text-muted",
                      )}
                    >
                      {!resolvedReplyPreview
                        ? t("chat:message.replyLoading", {
                          defaultValue: "Đang tải tin nhắn...",
                        })
                        : resolvedReplyPreview.isDeleted
                          ? resolvedReplyPreview.lifecycleStatus ===
                            "deleted_admin"
                            ? t("chat:message.deletedByAdmin", {
                              defaultValue:
                                "Tin nhắn đã bị xóa bởi quản trị viên",
                            })
                            : resolvedReplyPreview.lifecycleStatus === "recalled"
                              ? t("chat:message.recalled", {
                                defaultValue: "Tin nhắn đã được thu hồi",
                              })
                              : t("chat:message.deleted", {
                                defaultValue: "Tin nhắn đã được thu hồi",
                              })
                          : getPreviewFromMessage({
                            contentFormat: resolvedReplyPreview.contentFormat,
                            content: resolvedReplyPreview.content,
                          })}
                    </p>
                  </div>
                </button>
              )}

              <MessageBodyRenderer
                message={message}
                isOwn={isOwn}
                currentUsername={currentUsername}
                textRenderMode={renderState.renderMode}
                isCollapsibleText={renderState.isCollapsible}
                onToggleTextExpand={() => onToggleLongMessageExpand(message.id)}
                onImageClick={onImageClick}
                onFilePreview={onFilePreview}
              />

              {isGroupTail && (
                <MessageMeta
                  message={message}
                  isOwn={isOwn}
                  showStatus={item.showStatus}
                  density="comfortable"
                  layout="inline"
                  className={clsx(
                    "mt-1 justify-end text-[11px]",
                    isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.64]" : "text-text-muted/84",
                  )}
                />
              )}
            </MessageBubble>
            </div>

            {(message.reactions?.length ?? 0) > 0 && (
              <div className="mt-1">
                <ReactionBar
                  reactions={message.reactions}
                  currentUserId={currentUserId}
                  isOutgoing={isOwn}
                  onReact={handleReactionSelect}
                  onToggleReaction={handleReactionToggle}
                />
              </div>
            )}

            {threadCount > 0 && (
              <ThreadIndicator
                threadCount={threadCount}
                isOwn={isOwn}
                className="mt-1"
              />
            )}
          </div>
        </div>

        <MessageActions
          mode="sheet"
          actions={actionPolicy.menuActions}
          isOpen={isActionSheetOpen}
          onAction={handleAction}
          onClose={() => setIsActionSheetOpen(false)}
        />

        {/* Mobile emoji picker — full-screen overlay shown via long-press action sheet */}
        {showMobileReact && coarsePointer && (
          <MobileEmojiOverlay
            onSelect={handleReactionSelect}
            onClose={() => setShowMobileReact(false)}
          />
        )}
      </div>
    );
  };

export const MessageGroup: React.FC<MessageGroupProps> = ({
  row,
  onReply,
  onReact,
  onForward,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  isSelectionMode = false,
  selectedMessageIds = new Set<string>(),
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  expandedLongMessageIds,
  onToggleLongMessageExpand,
  insertedMessageKeys,
  highlightedMessageId,
}) => {
  const leadMessage = row.items[0]?.message;
  if (!leadMessage) {
    return null;
  }

  const senderDisplayName = resolveUserDisplayName({
    displayName: leadMessage.senderName,
    username: leadMessage.senderId,
  });

  return (
    <section
      className={clsx(
        "thread-message-group grid grid-cols-[36px,minmax(0,1fr)] gap-x-2.5 pb-1.5",
        row.isOwn && "grid-cols-[minmax(0,1fr)]",
      )}
    >
      {!row.isOwn && (
        <div className="flex justify-center pt-0.5">
          {row.showAvatar ? (
            <Avatar
              src={leadMessage.senderAvatar}
              alt={senderDisplayName}
              size="sm"
              className="thread-message-avatar"
            />
          ) : (
            <div className="h-8 w-8" aria-hidden="true" />
          )}
        </div>
      )}

      <div
        className={clsx(
          "min-w-0",
          row.isOwn ? "items-end" : "items-start",
          "flex flex-col",
        )}
      >
        <div className="flex w-full flex-col gap-1">
          {row.items.map((item, index) => (
            <MessageGroupItem
              key={item.key}
              item={item}
              isOwn={row.isOwn}
              isGroupTail={index === row.items.length - 1}
              bubblePosition={resolveBubblePosition(index, row.items.length)}
              showSenderName={index === 0 && !row.isOwn && row.showSenderName}
              senderDisplayName={senderDisplayName}
              onReply={onReply}
              onReact={onReact}
              onForward={onForward}
              onEdit={onEdit}
              onDelete={onDelete}
              onImageClick={onImageClick}
              onFilePreview={onFilePreview}
              isSelectionMode={isSelectionMode}
              isSelected={selectedMessageIds.has(item.messageId)}
              onToggleSelect={onToggleSelect}
              onNavigateToMessage={onNavigateToMessage}
              currentUsername={currentUsername}
              viewerCanRecallOthers={viewerCanRecallOthers}
              expandedLongMessageIds={expandedLongMessageIds}
              onToggleLongMessageExpand={onToggleLongMessageExpand}
              insertedMessageKeys={insertedMessageKeys}
              highlightedMessageId={highlightedMessageId}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MessageGroup;
