/**
 * MessageItem Component
 * Main orchestrator component for rendering timeline items
 * Handles: React.memo optimization, comparison logic, sub-component composition
 * 
 * Clean Architecture Pattern:
 * - Separates orchestration (this file) from UI rendering (sub-components)
 * - Sub-components each have single responsibility
 * - Utility functions centralized in utils.ts
 */

import React from "react";
import { recordChatRenderCount } from "../../../utils/chatPerformance";
import { MessageItemSelection } from "./MessageItemSelection";
import { MessageItemWrapper } from "./MessageItemWrapper";
import { MessageItemContent } from "./MessageItemContent";
import type { MessageItemProps } from "./types";
import {
  resolveLiveMessage,
  getLayoutSensitiveSignature,
} from "./utils";

/**
 * MessageItemComponent - Main render function
 * Handles orchestration and composition of sub-components
 * Records performance metrics for React DevTools profiling
 */
const MessageItemComponent: React.FC<MessageItemProps> = ({
  item,
  message,
  onReply,
  onReact,
  onForward,
  onPin,
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
  // Get the resolved message for logging
  const resolvedMessage = resolveLiveMessage(item, message);

  // Record render count for performance monitoring
  if (resolvedMessage) {
    recordChatRenderCount("MessageItem", resolvedMessage.id, {
      itemKind: item.kind,
      isSelectionMode,
      isSelected,
    });
  }

  // Handle selection toggle
  const handleToggleSelect = () => {
    if (isSelectionMode && onToggleSelect && resolvedMessage) {
      onToggleSelect(resolvedMessage.id);
    }
  };

  return (
    <MessageItemWrapper
      messageId={resolvedMessage?.id || item.key || "unknown"}
      isSelectionMode={isSelectionMode}
      isSelected={isSelected}
      density={density}
      item={item}
      onSelectionToggle={handleToggleSelect}
    >
      <div className="flex items-start gap-2">
        {/* Selection checkbox */}
        {resolvedMessage && (
          <MessageItemSelection
            isSelectionMode={isSelectionMode}
            isSelected={isSelected}
            messageId={resolvedMessage.id}
            onToggleSelect={onToggleSelect || (() => {})}
          />
        )}

        {/* Content renderer */}
        <div className="min-w-0 flex-1">
          <MessageItemContent
            item={item}
            message={message}
            onReply={onReply}
            onReact={onReact}
            onForward={onForward}
            onPin={onPin}
            onEdit={onEdit}
            onDelete={onDelete}
            onImageClick={onImageClick}
            onFilePreview={onFilePreview}
            density={density}
            isSelectionMode={isSelectionMode}
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
    </MessageItemWrapper>
  );
};

MessageItemComponent.displayName = "MessageItem";

/**
 * Comparison function for React.memo
 * Deep comparison logic to prevent unnecessary re-renders
 * Checks both item reference equality and layout-sensitive signatures
 */
const areEqualMessageItem = (
  prev: MessageItemProps,
  next: MessageItemProps,
): boolean => {
  const previousMessage = resolveLiveMessage(prev.item, prev.message);
  const nextMessage = resolveLiveMessage(next.item, next.message);

  // Fast path: same item reference means no changes
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
      prev.onPin === next.onPin &&
      prev.onEdit === next.onEdit &&
      prev.onDelete === next.onDelete &&
      prev.onImageClick === next.onImageClick &&
      prev.onFilePreview === next.onFilePreview &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onNavigateToMessage === next.onNavigateToMessage
    );
  }

  // Item reference changed, need deep comparison
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

  // Type-specific comparisons
  if (prev.item.kind === "date" && next.item.kind === "date") {
    return prev.item.date.getTime() === next.item.date.getTime();
  }

  if (prev.item.kind === "unread" && next.item.kind === "unread") {
    return true;
  }

  if (!previousMessage || !nextMessage) {
    return false;
  }

  // System message comparison
  if (prev.item.kind === "system" && next.item.kind === "system") {
    return (
      previousMessage.id === nextMessage.id &&
      getLayoutSensitiveSignature(previousMessage) ===
        getLayoutSensitiveSignature(nextMessage)
    );
  }

  // Regular message comparison
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

/**
 * Exported memoized component
 * Custom comparison function prevents re-renders when props haven't meaningfully changed
 * Improves performance for long message lists
 */
export const MessageItem = React.memo(MessageItemComponent, areEqualMessageItem);

export default MessageItem;
