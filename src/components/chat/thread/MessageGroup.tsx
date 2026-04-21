import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "../../common/Avatar";
import { MessageActions } from "../../message/MessageActions";
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
import type { ChatDensity } from "../../../stores/uiStore";
import type {
  ConversationThreadGroupRow,
  ConversationThreadMessageItem,
} from "../../../features/chat/hooks/useConversationThreadRows";
import { resolveThreadMessageRenderState } from "../messageListShared";

interface MessageGroupProps {
  row: ConversationThreadGroupRow;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onInspect?: (message: Message) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density?: ChatDensity;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
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

const MessageGroupItem: React.FC<{
  item: ConversationThreadMessageItem;
  isOwn: boolean;
  isGroupTail: boolean;
  bubblePosition: MessageBubblePosition;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onInspect?: (message: Message) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  isSelectionMode: boolean;
  isSelected: boolean;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  expandedLongMessageIds: Set<string>;
  onToggleLongMessageExpand: (messageId: string) => void;
  insertedMessageKeys: Set<string>;
  highlightedMessageId: string | null;
}> = ({
  item,
  isOwn,
  isGroupTail,
  bubblePosition,
  onReply,
  onReact,
  onInspect,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  isSelectionMode,
  isSelected,
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
  expandedLongMessageIds,
  onToggleLongMessageExpand,
  insertedMessageKeys,
  highlightedMessageId,
}) => {
  const { t } = useTranslation();
  const [isActionSheetOpen, setIsActionSheetOpen] = React.useState(false);
  const message = item.message;
  const resendMessage = useChatStore((state) => state.resendMessage);
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
        canRetry: isFailedMessage(message),
        canInspect: Boolean(onInspect),
      }),
    [coarsePointer, isOwn, isSelectionMode, message, onDelete, onEdit, onInspect],
  );
  const threadCount = getThreadCount(message);
  const isRichBubble =
    message.type !== "text" ||
    Boolean(message.replyToMessage) ||
    Boolean(message.forwardedFrom) ||
    message.isDeleted ||
    isFailedMessage(message) ||
    isPendingMessage(message);

  const inlineActions = coarsePointer
    ? actionPolicy.menuActions.length > 0
      ? (["more"] as MessageActionId[])
      : actionPolicy.railActions.slice(0, 1)
    : actionPolicy.railActions;

  const handleAction = React.useCallback(
    (actionId: MessageActionId) => {
      switch (actionId) {
        case "react":
          onReact(message.id, "\u{1F44D}");
          break;
        case "reply":
          onReply(message);
          break;
        case "copy":
          void navigator.clipboard.writeText(message.content || "");
          break;
        case "inspect":
          onInspect?.(message);
          break;
        case "edit":
          if (onEdit) {
            void Promise.resolve(onEdit(message));
          }
          break;
        case "delete":
          if (onDelete) {
            void Promise.resolve(onDelete(message.id));
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
    [message, onDelete, onEdit, onInspect, onReact, onReply, resendMessage],
  );

  return (
    <div
      className={clsx(
        "group/message-item relative flex max-w-[var(--chat-bubble-max)] gap-2",
        isOwn ? "self-end" : "self-start",
        insertedMessageKeys.has(getMessageStableKey(message)) &&
          isPendingMessage(message) &&
          "motion-message-insert",
      )}
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

      <div className="relative min-w-0 flex-1">
        {inlineActions.length > 0 && !isSelectionMode && (
          <div
            className={clsx(
              "pointer-events-none absolute -top-2 z-10 flex translate-y-0.5 opacity-0 transition-all duration-150",
              isOwn ? "right-0 justify-end" : "left-0 justify-start",
              coarsePointer && "pointer-events-auto opacity-100",
              "group-hover/message-item:pointer-events-auto group-hover/message-item:translate-y-0 group-hover/message-item:opacity-100",
              "group-focus-within/message-item:pointer-events-auto group-focus-within/message-item:translate-y-0 group-focus-within/message-item:opacity-100",
            )}
          >
            <MessageActions
              mode="inline"
              actions={inlineActions}
              onAction={handleAction}
            />
          </div>
        )}

        <MessageBubble
          isOwn={isOwn}
          position={bubblePosition}
          isRich={isRichBubble}
          isHighlighted={isHighlighted}
        >
          {message.replyToMessage && (
            <button
              type="button"
              onClick={() => {
                const targetId = message.replyTo || message.replyToMessage?.id;
                if (targetId) {
                  onNavigateToMessage?.(targetId);
                }
              }}
              className={clsx(
                "mb-2 flex w-full items-start gap-2 rounded-[12px] border-l-2 px-2.5 py-2 text-left transition-colors",
                isOwn
                  ? "border-text-primary/20 bg-text-primary/8 hover:bg-text-primary/12"
                  : "border-border-strong/70 bg-surface-overlay/78 hover:bg-surface-hover",
                !onNavigateToMessage && "cursor-default",
              )}
            >
              <div className="min-w-0">
                <div
                  className={clsx(
                    "text-[11px] font-semibold leading-4",
                    isOwn ? "text-text-primary/78" : "text-text-secondary",
                  )}
                >
                  {resolveUserDisplayName({
                    displayName: message.replyToMessage.senderName,
                    username: message.replyToMessage.senderId,
                  })}
                </div>
                <p
                  className={clsx(
                    "truncate text-[12px] leading-4",
                    isOwn ? "text-text-primary/68" : "text-text-muted",
                  )}
                >
                  {message.replyToMessage.isDeleted
                    ? t("chat:message.deleted", {
                        defaultValue: "Message deleted",
                      })
                    : message.replyToMessage.content}
                </p>
              </div>
            </button>
          )}

          {message.forwardedFrom && (
            <div
              className={clsx(
                "mb-2 text-[11px] font-medium leading-4",
                isOwn ? "text-text-primary/68" : "text-text-muted",
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
                isOwn ? "text-text-primary/64" : "text-text-muted/84",
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

      <MessageActions
        mode="sheet"
        actions={actionPolicy.menuActions}
        isOpen={isActionSheetOpen}
        onAction={handleAction}
        onClose={() => setIsActionSheetOpen(false)}
      />
    </div>
  );
};

export const MessageGroup: React.FC<MessageGroupProps> = ({
  row,
  onReply,
  onReact,
  onInspect,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  isSelectionMode = false,
  selectedMessageIds = new Set<string>(),
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
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
        "thread-message-group grid grid-cols-[36px,minmax(0,1fr)] gap-x-2.5",
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
        {!row.isOwn && row.showSenderName && (
          <div className="mb-1 px-1 text-[12px] font-medium leading-4 text-text-secondary/92">
            {senderDisplayName}
          </div>
        )}

        <div className="flex w-full flex-col gap-0.5">
          {row.items.map((item, index) => (
            <MessageGroupItem
              key={item.key}
              item={item}
              isOwn={row.isOwn}
              isGroupTail={index === row.items.length - 1}
              bubblePosition={resolveBubblePosition(index, row.items.length)}
              onReply={onReply}
              onReact={onReact}
              onInspect={onInspect}
              onEdit={onEdit}
              onDelete={onDelete}
              onImageClick={onImageClick}
              onFilePreview={onFilePreview}
              isSelectionMode={isSelectionMode}
              isSelected={selectedMessageIds.has(item.messageId)}
              onToggleSelect={onToggleSelect}
              onNavigateToMessage={onNavigateToMessage}
              currentUsername={currentUsername}
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
