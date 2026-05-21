import React from "react";
import clsx from "clsx";
import { DateDivider } from "./DateDivider";
import { UnreadDivider } from "./UnreadDivider";
import { MessageCluster } from "./message-layout/MessageCluster";
import { SystemMessage } from "../message/SystemMessage";
import type { Message, Attachment } from "../../types";
import type { ConversationTimelineItem } from "../../features/chat/hooks/useConversationTimelineRows";
import type { ChatDensity } from "../../stores/uiStore";
import { getTimelineItemSpacingClass } from "./timelineDensity";
import type { LongMessageRenderMode } from "../../utils/longMessagePolicy";
import { recordChatRenderCount } from "../../utils/chatPerformance";

interface MessageItemProps {
  item: ConversationTimelineItem;
  message?: Message;
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
  density?: ChatDensity;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  /** Viewer được phép "Xóa ở mọi người" trên tin của người khác (admin/owner). */
  viewerCanRecallOthers?: boolean;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;
  onToggleTextExpand?: () => void;
  shouldAnimateInsert?: boolean;
}

const getAttachmentLayoutSignature = (
  attachments?: Attachment[],
): string => {
  if (!attachments || attachments.length === 0) return "";

  return attachments
    .map((attachment) =>
      [
        attachment.id,
        attachment.type,
        attachment.fileName,
        attachment.fileSize,
        attachment.width,
        attachment.height,
        attachment.thumbnailUrl,
      ].join(":"),
    )
    .join("|");
};

const getReplyLayoutSignature = (message: Message): string => {
  const reply = message.replyToMessage;
  if (!reply) return "";
  const replyAttachments = (
    reply as Message["replyToMessage"] & { attachments?: Attachment[] }
  ).attachments;

  return [
    reply.id,
    reply.type,
    reply.senderName,
    reply.content,
    reply.isDeleted,
    getAttachmentLayoutSignature(replyAttachments),
  ].join(":");
};

const getForwardedSignature = (message: Message): string => {
  const forwardedFrom = message.forwardedFrom;
  if (!forwardedFrom) return "";

  return [
    "id" in forwardedFrom ? forwardedFrom.id : "",
    "username" in forwardedFrom ? forwardedFrom.username : "",
  ].join(":");
};

const getLayoutSensitiveSignature = (message: Message): string =>
  [
    message.type,
    message.senderName,
    message.content,
    message.status,
    message.sendState,
    message.isEdited,
    message.isDeleted,
    message.isPinned,
    getReplyLayoutSignature(message),
    getForwardedSignature(message),
    getAttachmentLayoutSignature(message.attachments),
    (message.reactions ?? [])
      .map((reaction) => `${reaction.emoji}:${reaction.count}`)
      .join("|"),
    (message.readBy ?? []).length,
    (message.mentions ?? []).length,
    (message as { threadCount?: number }).threadCount ?? 0,
  ].join("::");

const resolveLiveMessage = (
  item: ConversationTimelineItem,
  message?: Message,
): Message | null =>
  message ??
  (item.kind === "message" || item.kind === "system" ? item.message : null);

const MessageItemComponent: React.FC<MessageItemProps> = ({
  item,
  message,
  onReply,
  onReact,
  onForward,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  density = "comfortable",
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  shouldAnimateInsert = false,
}) => {
  if (item.kind === "date") {
    return <DateDivider date={item.date} density={density} />;
  }

  if (item.kind === "unread") {
    return <UnreadDivider density={density} />;
  }

  const resolvedMessage = resolveLiveMessage(item, message);
  if (!resolvedMessage) {
    return null;
  }

  recordChatRenderCount("MessageItem", resolvedMessage.id, {
    itemKind: item.kind,
    isSelectionMode,
    isSelected,
  });

  if (item.kind === "system") {
    return (
      <SystemMessage
        message={resolvedMessage}
        className={
          density === "compact"
            ? "my-1"
            : density === "expanded"
              ? "my-3"
              : "my-2"
        }
      />
    );
  }

  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(resolvedMessage.id);
    }
  };

  const messageSpacingClass = getTimelineItemSpacingClass(
    item,
    density,
  );

  return (
    <div
      data-testid={`message-item-${resolvedMessage.id}`}
      data-message-id={resolvedMessage.id}
      className={clsx(
        messageSpacingClass,
        "msg-row-hover -mx-1 px-1",
        isSelectionMode && "cursor-pointer",
        isSelected &&
          "rounded-[14px] bg-[hsl(var(--chat-active-surface)/0.16)] ring-1 ring-[hsl(var(--chat-active-surface)/0.24)]",
      )}
      onClick={isSelectionMode ? handleClick : undefined}
    >
      <div className="flex items-start gap-2">
        {isSelectionMode && (
          <div className="flex shrink-0 items-center pt-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(resolvedMessage.id)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
              aria-label={`Select message`}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <MessageCluster
            message={resolvedMessage}
            isOwn={item.isOwn}
            mergeLevel={item.mergeLevel}
            showAvatar={item.showAvatar}
            showSenderName={item.showSenderName}
            showMeta={item.showMeta}
            showStatus={item.showStatus}
            isGroupStart={item.isGroupStart}
            isGroupEnd={item.isGroupEnd}
            conversationType={item.conversationType}
            onReply={onReply}
            onReact={onReact}
            onForward={onForward}
            onEdit={onEdit}
            onDelete={onDelete}
            onImageClick={onImageClick}
            onFilePreview={onFilePreview}
            isSelectionMode={isSelectionMode}
            density={density}
            onNavigateToMessage={onNavigateToMessage}
            currentUsername={currentUsername}
            viewerCanRecallOthers={viewerCanRecallOthers}
            textRenderMode={textRenderMode}
            isCollapsibleText={isCollapsibleText}
            onToggleTextExpand={onToggleTextExpand}
            shouldAnimateInsert={shouldAnimateInsert}
          />
        </div>
      </div>
    </div>
  );
};

const areEqualMessageItem = (
  prev: MessageItemProps,
  next: MessageItemProps,
): boolean => {
  const previousMessage = resolveLiveMessage(prev.item, prev.message);
  const nextMessage = resolveLiveMessage(next.item, next.message);

  if (prev.item === next.item) {
    return (
      previousMessage === nextMessage &&
      prev.density === next.density &&
      prev.isSelectionMode === next.isSelectionMode &&
      prev.isSelected === next.isSelected &&
      prev.currentUsername === next.currentUsername &&
      prev.textRenderMode === next.textRenderMode &&
      prev.isCollapsibleText === next.isCollapsibleText &&
      prev.shouldAnimateInsert === next.shouldAnimateInsert &&
      prev.onReply === next.onReply &&
      prev.onReact === next.onReact &&
      prev.onForward === next.onForward &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onImageClick === next.onImageClick &&
      prev.onFilePreview === next.onFilePreview &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onNavigateToMessage === next.onNavigateToMessage
    );
  }

  if (prev.item.kind !== next.item.kind) return false;
  if (prev.item.key !== next.item.key) return false;
  if (prev.density !== next.density) return false;
  if (prev.isSelectionMode !== next.isSelectionMode) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.currentUsername !== next.currentUsername) return false;
  if (prev.textRenderMode !== next.textRenderMode) return false;
  if (prev.isCollapsibleText !== next.isCollapsibleText) return false;
  if (prev.shouldAnimateInsert !== next.shouldAnimateInsert) return false;
  if (prev.onNavigateToMessage !== next.onNavigateToMessage) return false;

  if (prev.item.kind === "date" && next.item.kind === "date") {
    return prev.item.date.getTime() === next.item.date.getTime();
  }

  if (prev.item.kind === "unread" && next.item.kind === "unread") {
    return true;
  }

  if (!previousMessage || !nextMessage) {
    return false;
  }

  if (prev.item.kind === "system" && next.item.kind === "system") {
    return (
      previousMessage.id === nextMessage.id &&
      getLayoutSensitiveSignature(previousMessage) ===
        getLayoutSensitiveSignature(nextMessage)
    );
  }

  if (prev.item.kind === "message" && next.item.kind === "message") {
    if (prev.item.isOwn !== next.item.isOwn) return false;
    if (prev.item.mergeLevel !== next.item.mergeLevel) return false;
    if (prev.item.showAvatar !== next.item.showAvatar) return false;
    if (prev.item.showSenderName !== next.item.showSenderName) return false;
    if (prev.item.showMeta !== next.item.showMeta) return false;
    if (prev.item.showStatus !== next.item.showStatus) return false;
    if (prev.item.spacingToken !== next.item.spacingToken) return false;
    if (prev.item.isGroupStart !== next.item.isGroupStart) return false;
    if (prev.item.isGroupEnd !== next.item.isGroupEnd) return false;
    if (previousMessage.id !== nextMessage.id) return false;

    return (
      getLayoutSensitiveSignature(previousMessage) ===
      getLayoutSensitiveSignature(nextMessage)
    );
  }

  return false;
};

export const MessageItem = React.memo(MessageItemComponent, areEqualMessageItem);

export default MessageItem;
