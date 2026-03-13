import React from "react";
import clsx from "clsx";
import { DateDivider } from "./DateDivider";
import { UnreadDivider } from "./UnreadDivider";
import { MessageBubble } from "./MessageBubble";
import { SystemMessage } from "../message/SystemMessage";
import type { Message, Attachment } from "../../types";
import type { TimelineItem } from "../../hooks/useMessageGrouping";
import type { ChatDensity } from "../../stores/uiStore";

interface MessageItemProps {
  item: TimelineItem;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  density?: ChatDensity;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;
  currentUsername?: string;
}

const MessageItemComponent: React.FC<MessageItemProps> = ({
  item,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onImageClick,
  onFilePreview,
  density = "comfortable",
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
  currentUsername,
}) => {
  const isCompact = density === "compact";
  const isExpanded = density === "expanded";

  if (item.kind === "date") {
    return <DateDivider date={item.date} className={isExpanded ? "my-7" : undefined} />;
  }

  if (item.kind === "unread") {
    return <UnreadDivider className={isExpanded ? "my-6" : undefined} />;
  }

  if (item.kind === "system") {
    return (
      <SystemMessage
        message={item.message}
        className={isCompact ? "my-1" : isExpanded ? "my-3" : "my-2"}
      />
    );
  }

  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(item.message.id);
    }
  };

  return (
    <div
      className={clsx(
        item.isGroupEnd
          ? isCompact
            ? "mb-2.5"
            : isExpanded
              ? "mb-5"
            : "mb-3.5"
          : isCompact
            ? "mb-px"
            : isExpanded
              ? "mb-1"
            : "mb-[3px]",
        "msg-row-hover -mx-1 px-1",
        isSelectionMode && "cursor-pointer",
        isSelected && "bg-primary/6 rounded-md",
      )}
      onClick={isSelectionMode ? handleClick : undefined}
    >
      <div className="flex items-start gap-2">
        {isSelectionMode && (
          <div className="flex shrink-0 items-center pt-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect?.(item.message.id)}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
              aria-label={`Select message`}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <MessageBubble
            message={item.message}
            isOwn={item.isOwn}
            showAvatar={item.showAvatar}
            showSenderName={item.showSenderName}
            isGroupStart={item.isGroupStart}
            isGroupEnd={item.isGroupEnd}
            conversationType={item.conversationType}
            onReply={onReply}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            onImageClick={onImageClick}
            onFilePreview={onFilePreview}
            isSelectionMode={isSelectionMode}
            density={density}
            currentUsername={currentUsername}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Custom equality comparator for MessageItem.
 * Compares item content (not identity) to prevent unnecessary re-renders
 * when useMessageGrouping rebuilds TimelineItem objects with identical content.
 * Critical for 10k+ message lists where only 1-2 items typically change.
 */
const areEqualMessageItem = (
  prev: MessageItemProps,
  next: MessageItemProps,
): boolean => {
  // Fast path: exact same item reference (structural sharing hit)
  if (prev.item === next.item) {
    return (
      prev.density === next.density &&
      prev.isSelectionMode === next.isSelectionMode &&
      prev.isSelected === next.isSelected &&
      prev.currentUsername === next.currentUsername &&
      prev.onReply === next.onReply &&
      prev.onReact === next.onReact &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onImageClick === next.onImageClick &&
      prev.onFilePreview === next.onFilePreview &&
      prev.onToggleSelect === next.onToggleSelect
    );
  }

  // Different item reference — compare structurally
  if (prev.item.kind !== next.item.kind) return false;
  if (prev.item.key !== next.item.key) return false;
  if (prev.density !== next.density) return false;
  if (prev.isSelectionMode !== next.isSelectionMode) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.currentUsername !== next.currentUsername) return false;

  if (prev.item.kind === "date" && next.item.kind === "date") {
    return prev.item.date.getTime() === next.item.date.getTime();
  }

  if (prev.item.kind === "unread" || prev.item.kind === "system") {
    if (prev.item.kind === "system" && next.item.kind === "system") {
      return prev.item.message === next.item.message;
    }
    return true;
  }

  if (prev.item.kind === "message" && next.item.kind === "message") {
    if (prev.item.isOwn !== next.item.isOwn) return false;
    if (prev.item.showAvatar !== next.item.showAvatar) return false;
    if (prev.item.showSenderName !== next.item.showSenderName) return false;
    if (prev.item.isGroupStart !== next.item.isGroupStart) return false;
    if (prev.item.isGroupEnd !== next.item.isGroupEnd) return false;

    const prevMsg = prev.item.message;
    const nextMsg = next.item.message;
    if (prevMsg === nextMsg) return true; // same reference
    if (prevMsg.id !== nextMsg.id) return false;
    if (prevMsg.content !== nextMsg.content) return false;
    if (prevMsg.status !== nextMsg.status) return false;
    if (prevMsg.isEdited !== nextMsg.isEdited) return false;
    if (prevMsg.isDeleted !== nextMsg.isDeleted) return false;
    if (prevMsg.isPinned !== nextMsg.isPinned) return false;

    // Compare reactions structurally
    const prevReactions = prevMsg.reactions;
    const nextReactions = nextMsg.reactions;
    if (prevReactions !== nextReactions) {
      const prevLen = prevReactions?.length ?? 0;
      const nextLen = nextReactions?.length ?? 0;
      if (prevLen !== nextLen) return false;
      if (prevReactions && nextReactions) {
        for (let i = 0; i < prevLen; i++) {
          if (
            prevReactions[i].emoji !== nextReactions[i].emoji ||
            prevReactions[i].count !== nextReactions[i].count
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }

  return false;
};

export const MessageItem = React.memo(
  MessageItemComponent,
  areEqualMessageItem,
);

export default MessageItem;
