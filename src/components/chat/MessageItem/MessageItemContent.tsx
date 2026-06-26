/**
 * MessageItemContent Component
 * Renders the actual content based on timeline item type
 * Responsible for: Conditional rendering of DateDivider, UnreadDivider, SystemMessage, or MessageCluster
 */

import React from "react";
import { DateDivider } from "../DateDivider";
import { UnreadDivider } from "../UnreadDivider";
import { MessageCluster } from "../message-layout/MessageCluster";
import { SystemMessage } from "../../message/SystemMessage";
import type { MessageItemContentProps } from "./types";
import { resolveLiveMessage } from "./utils";

/**
 * MessageItemContent - Router component that renders appropriate content based on item type
 * Supports: DateDivider, UnreadDivider, SystemMessage, MessageCluster
 * Each type has different spacing and rendering logic
 */
export const MessageItemContent: React.FC<MessageItemContentProps> = ({
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
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  textRenderMode = "expanded",
  isCollapsibleText = false,
  onToggleTextExpand,
  shouldAnimateInsert = false,
}) => {
  // Render date divider
  if (item.kind === "date") {
    return <DateDivider date={item.date} density={density} />;
  }

  // Render unread divider
  if (item.kind === "unread") {
    return <UnreadDivider density={density} />;
  }

  // Resolve the actual message
  const resolvedMessage = resolveLiveMessage(item, message);
  if (!resolvedMessage) {
    return null;
  }

  // Render system message (user joined, left, etc.)
  if (item.kind === "system") {
    return (
      <SystemMessage
        message={resolvedMessage}
        onNavigateToMessage={onNavigateToMessage}
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

  // Render regular message cluster
  if (item.kind === "message") {
    return (
      <div className="flex items-start gap-2">
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
            onPin={onPin}
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
    );
  }

  return null;
};

MessageItemContent.displayName = "MessageItemContent";
