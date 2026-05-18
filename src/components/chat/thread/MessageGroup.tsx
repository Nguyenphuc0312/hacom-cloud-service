import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { MessageActions } from "../../message/MessageActions";
import { EmojiReactionPicker } from "../../message/EmojiReactionPicker";
import { ReactionBar } from "../../message/ReactionBar";
import { ThreadIndicator } from "../../message/ThreadIndicator";
import { MessageBodyRenderer } from "../message-layout/MessageBodyRenderer";
import { MessageMeta } from "../message-layout/MessageMeta";
import { MessageBubble, type MessageBubblePosition } from "./MessageBubble";
import type { Attachment, Message } from "../../../types";
import { useChatStore } from "../../../stores";
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

interface MessageGroupProps {
  row: ConversationThreadGroupRow;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
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
const QUICK_EMOJIS_MOBILE = ["👍", "❤️", "😆", "😮", "😢", "😡"] as const;
const EXTENDED_EMOJIS_MOBILE = [
  "👍", "👎", "❤️", "🔥", "🎉", "😆", "😮", "😢", "😡", "🤩",
  "🥹", "😍", "🤔", "👏", "💯", "✅", "🙏", "😭", "🫡", "💪",
  "😴", "🤣", "😅", "😬", "🥲", "😤", "😩", "🤯", "🤗", "😎",
] as const;

const MobileEmojiOverlay: React.FC<{
  onSelect: (emoji: string) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const [showMore, setShowMore] = React.useState(false);
  const emojis = showMore ? EXTENDED_EMOJIS_MOBILE : QUICK_EMOJIS_MOBILE;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-text-primary/30 p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Đóng"
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface p-4 shadow-elev3 dark:bg-surface-raised">
        <p className="mb-3 text-center text-xs font-semibold text-text-secondary">
          Chọn biểu cảm
        </p>
        <div className={clsx("flex flex-wrap justify-center gap-1", showMore && "max-w-xs mx-auto")}>
          {emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`React với ${emoji}`}
              onClick={() => { onSelect(emoji); onClose(); }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-all duration-100 hover:scale-110 hover:bg-surface-overlay active:scale-95 dark:hover:bg-surface-overlay"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            aria-label={showMore ? "Thu gọn" : "Thêm"}
            onClick={() => setShowMore((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-overlay ring-1 ring-border transition-all duration-100 hover:scale-110 hover:bg-surface-hover dark:bg-surface-overlay dark:ring-white/10 dark:hover:bg-surface-active"
          >
            <Plus
              size={16}
              strokeWidth={2.2}
              className={clsx("transition-transform duration-200 text-text-secondary dark:text-text-secondary", showMore && "rotate-45")}
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
    const [isActionSheetOpen, setIsActionSheetOpen] = React.useState(false);
    const [isActionRailVisible, setIsActionRailVisible] = React.useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
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
    const hideActionRailTimerRef = React.useRef<number | null>(null);
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
    const actionPolicy = React.useMemo(
      () =>
        resolveMessageActions({
          message,
          isOwn,
          isCoarsePointer: coarsePointer,
          isSelectionMode,
          canEdit: Boolean(onEdit),
          canDelete: Boolean(onDelete),
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

    const clearHideActionRailTimer = React.useCallback(() => {
      if (hideActionRailTimerRef.current === null) {
        return;
      }

      window.clearTimeout(hideActionRailTimerRef.current);
      hideActionRailTimerRef.current = null;
    }, []);

    const showActionRail = React.useCallback(() => {
      clearHideActionRailTimer();
      setIsActionRailVisible(true);
    }, [clearHideActionRailTimer]);

    const hideActionRail = React.useCallback(
      (withDelay = true) => {
        clearHideActionRailTimer();

        if (!withDelay) {
          setIsActionRailVisible(false);
          return;
        }

        hideActionRailTimerRef.current = window.setTimeout(() => {
          setIsActionRailVisible(false);
          hideActionRailTimerRef.current = null;
        }, 120);
      },
      [clearHideActionRailTimer],
    );

    React.useEffect(
      () => () => {
        clearHideActionRailTimer();
      },
      [clearHideActionRailTimer],
    );

    const handleAction = React.useCallback(
      (actionId: MessageActionId) => {
        switch (actionId) {
          case "react":
            setIsActionSheetOpen(false);
            setShowEmojiPicker((prev) => !prev);
            return;

          case "reply":
            onReply(message);
            break;
          case "copy":
            void navigator.clipboard.writeText(message.content || "");
            break;
          case "edit":
            if (onEdit) {
              void Promise.resolve(onEdit(message));
            }
            break;
          case "deleteForMe":
            if (onDelete) {
              void Promise.resolve(onDelete(message.id, "FOR_ME"));
            }
            break;
          case "deleteForEveryone":
            if (onDelete) {
              const adminCtx = !isOwn ? "ADMIN_DELETE" : undefined;
              void Promise.resolve(
                (onDelete as (
                  id: string,
                  mode?: "FOR_ME" | "FOR_EVERYONE",
                  context?: "ADMIN_DELETE",
                ) => unknown)(message.id, "FOR_EVERYONE", adminCtx),
              );
            }
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
      [message, onDelete, onEdit, onReact, onReply, resendMessage, isOwn],
    );

    const isActionRailActive = isActionRailVisible || isActionSheetOpen || showEmojiPicker;

    const handleEmojiSelect = React.useCallback(
      (emoji: string) => {
        onReact(message.id, emoji);
        setShowEmojiPicker(false);
      },
      [message.id, onReact],
    );

    const closeEmojiPicker = React.useCallback(() => {
      setShowEmojiPicker(false);
    }, []);

    const actionRail =
      inlineActions.length > 0 && !isSelectionMode ? (
        <div
          onMouseEnter={showActionRail}
          onMouseLeave={() => {
            if (!showEmojiPicker) hideActionRail(true);
          }}
          className={clsx(
            "absolute top-1 z-20 hidden transition-all duration-150 md:block",
            isOwn ? "right-full mr-2" : "left-full ml-2",
            isActionRailActive
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-0.5 opacity-0",
          )}
        >
          {/* Emoji picker floats above the action rail */}
          {showEmojiPicker && (
            <EmojiReactionPicker
              onSelect={handleEmojiSelect}
              onClose={closeEmojiPicker}
              isOwn={isOwn}
            />
          )}
          <MessageActions
            mode="inline"
            actions={inlineActions}
            onAction={handleAction}
            actionLabelOverrides={adminRecallLabelOverride}
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
        onMouseEnter={showActionRail}
        onMouseLeave={() => hideActionRail(true)}
        onFocusCapture={showActionRail}
        onBlurCapture={(event) => {
          const nextFocused = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(nextFocused)) {
            hideActionRail(false);
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
                defaultValue: "Select message",
              })}
            />
          </div>
        )}

        {actionRail}

        <div
          className={clsx(
            "flex min-w-0 flex-1 items-start",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          <div className="min-w-0 max-w-full">
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

              {message.forwardedFrom && (
                <div
                  className={clsx(
                    "mb-2 text-[11px] font-medium leading-4",
                    isOwn ? "text-[hsl(var(--chat-bubble-sent-text))/0.68]" : "text-text-muted",
                  )}
                >
                  {t("chat:message.forwardedFrom", {
                    defaultValue: "Forwarded from {{name}}",
                    name: resolveUserDisplayName({
                      displayName:
                        (message.forwardedFrom as { displayName?: string | null })
                          .displayName || message.forwardedFrom.username,
                      username: message.forwardedFrom.username,
                    }),
                  })}
                </div>
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

            {(message.reactions?.length ?? 0) > 0 && (
              <div className="mt-1">
                <ReactionBar
                  reactions={message.reactions}
                  onReact={(emoji) => onReact(message.id, emoji)}
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
          actionLabelOverrides={adminRecallLabelOverride}
        />

        {/* Mobile emoji picker — full-screen overlay (desktop uses inline picker above rail) */}
        {showEmojiPicker && coarsePointer && (
          <MobileEmojiOverlay
            onSelect={handleEmojiSelect}
            onClose={closeEmojiPicker}
          />
        )}
      </div>
    );
  };

export const MessageGroup: React.FC<MessageGroupProps> = ({
  row,
  onReply,
  onReact,
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
