/**
 * MessageItemWrapper Component
 * Container component that handles styling, spacing, and click events
 * Responsible for: Layout styling, selection mode click handling, selected state styling
 */

import React from "react";
import clsx from "clsx";
import { getTimelineItemSpacingClass } from "../timelineDensity";
import type { MessageItemWrapperProps } from "./types";
import type { MessageTimelineItem } from "../../../hooks/useMessageGrouping";

/**
 * MessageItemWrapper - Container div for message item
 * Applies conditional styling based on:
 * - Selection mode (cursor-pointer when active)
 * - Selected state (highlight background and ring)
 * - Density settings (spacing)
 * - Timeline item spacing
 */
export const MessageItemWrapper: React.FC<MessageItemWrapperProps> = ({
  messageId,
  isSelectionMode,
  isSelected,
  density = "comfortable",
  item,
  onSelectionToggle,
  children,
}) => {
  // Only call getTimelineItemSpacingClass for message items (not date/unread)
  // Type assertion safe because we checked item.kind
  const messageSpacingClass =
    item.kind === "message" || item.kind === "system"
      ? getTimelineItemSpacingClass(item as MessageTimelineItem, density)
      : "";

  const handleClick = () => {
    if (isSelectionMode) {
      onSelectionToggle();
    }
  };

  return (
    <div
      data-testid={`message-item-${messageId}`}
      data-message-id={messageId}
      data-message-selected={isSelected ? "true" : "false"}
      data-render-probe="message-item"
      className={clsx(
        messageSpacingClass,
        "msg-row-hover -mx-1 px-1",
        isSelectionMode && "cursor-pointer",
        isSelected &&
          "rounded-[14px] bg-[hsl(var(--chat-active-surface)/0.16)] ring-1 ring-[hsl(var(--chat-active-surface)/0.24)]",
      )}
      onClick={isSelectionMode ? handleClick : undefined}
    >
      {children}
    </div>
  );
};

MessageItemWrapper.displayName = "MessageItemWrapper";
