/**
 * MessageItem Types
 * Centralized type definitions for MessageItem component and its sub-components
 * Ensures consistency and maintainability across the message rendering layer
 */

import type { Message, Attachment } from "../../../types";
import type { ConversationTimelineItem } from "../../../features/chat/hooks/useConversationTimelineRows";
import type { ChatDensity } from "../../../stores/uiStore";
import type { LongMessageRenderMode } from "../../../utils/longMessagePolicy";

/**
 * Main props for MessageItem component
 * Handles rendering of timeline items including messages, date dividers, and system messages
 */
export interface MessageItemProps {
  // Timeline item data
  item: ConversationTimelineItem;
  message?: Message;

  // Message action callbacks
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;

  // UI action callbacks
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;

  // Display settings
  density?: ChatDensity;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;

  // Selection mode
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (messageId: string) => void;

  // Additional context
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;

  // Permission flags
  viewerCanRecallOthers?: boolean;

  // Animation
  shouldAnimateInsert?: boolean;

  // Text expand toggle
  onToggleTextExpand?: () => void;
}

/**
 * Props for MessageItemContent sub-component
 * Renders the actual content based on item type
 */
export interface MessageItemContentProps {
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
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  viewerCanRecallOthers?: boolean;
  textRenderMode?: LongMessageRenderMode;
  isCollapsibleText?: boolean;
  onToggleTextExpand?: () => void;
  shouldAnimateInsert?: boolean;
}

/**
 * Props for MessageItemSelection sub-component
 * Handles the checkbox for selecting messages
 */
export interface MessageItemSelectionProps {
  isSelectionMode: boolean;
  isSelected: boolean;
  messageId: string;
  onToggleSelect: (messageId: string) => void;
}

/**
 * Props for MessageItemWrapper sub-component
 * Handles styling, spacing, and click event handlers
 */
export interface MessageItemWrapperProps {
  messageId: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  density?: ChatDensity;
  item: ConversationTimelineItem;
  onSelectionToggle: () => void;
  children: React.ReactNode;
}
