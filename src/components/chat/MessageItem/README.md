/**
 * MessageItem Component Module
 * 
 * A Clean Architecture implementation of message item rendering with
 * modular, single-responsibility components.
 * 
 * See ARCHITECTURE.md for detailed design documentation.
 */

// ============================================================================
// QUICK START
// ============================================================================

// 1. Basic Import
import { MessageItem } from '@/components/chat/MessageItem';
import type { MessageItemProps } from '@/components/chat/MessageItem';

// 2. Use in render
<MessageItem
  item={timelineItem}
  message={message}
  onReply={handleReply}
  onReact={handleReact}
  onEdit={handleEdit}
  onDelete={handleDelete}
  density="comfortable"
/>

// ============================================================================
// DETAILED USAGE EXAMPLE
// ============================================================================

import React, { useCallback } from 'react';
import { MessageItem } from '@/components/chat/MessageItem';
import type { Message, Attachment } from '@/types';
import type { ConversationTimelineItem } from '@/features/chat/hooks/useConversationTimelineRows';

interface MessageListProps {
  items: ConversationTimelineItem[];
  messages: Record<string, Message>;
}

export const MessageList: React.FC<MessageListProps> = ({ items, messages }) => {
  // Define callbacks
  const handleReply = useCallback((message: Message) => {
    console.log('Reply to:', message.id);
    // Your logic here
  }, []);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    console.log('React with', emoji, 'to', messageId);
    // Your logic here
  }, []);

  const handleEdit = useCallback(async (message: Message) => {
    console.log('Edit:', message.id);
    // Your async logic here
  }, []);

  const handleDelete = useCallback(async (messageId: string, mode?: 'FOR_ME' | 'FOR_EVERYONE') => {
    console.log('Delete:', messageId, 'mode:', mode);
    // Your async logic here
  }, []);

  const handleForward = useCallback((message: Message) => {
    console.log('Forward:', message.id);
    // Your logic here
  }, []);

  const handleImageClick = useCallback((imageUrl: string) => {
    // Open image viewer
  }, []);

  const handleFilePreview = useCallback((attachment: Attachment) => {
    // Show file preview
  }, []);

  // Render
  return (
    <div className="flex flex-col gap-0">
      {items.map((item) => (
        <MessageItem
          key={item.key}
          item={item}
          message={messages[item.key]}
          onReply={handleReply}
          onReact={handleReact}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onForward={handleForward}
          onImageClick={handleImageClick}
          onFilePreview={handleFilePreview}
          density="comfortable"
          isSelectionMode={false}
          textRenderMode="expanded"
        />
      ))}
    </div>
  );
};

// ============================================================================
// ADVANCED USAGE - WITH SELECTION MODE
// ============================================================================

interface MessageListWithSelectionProps {
  items: ConversationTimelineItem[];
  messages: Record<string, Message>;
  selectedIds: Set<string>;
  onSelectionChange: (selectedIds: Set<string>) => void;
}

export const MessageListWithSelection: React.FC<MessageListWithSelectionProps> = ({
  items,
  messages,
  selectedIds,
  onSelectionChange,
}) => {
  const handleToggleSelect = useCallback((messageId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    onSelectionChange(newSelected);
  }, [selectedIds, onSelectionChange]);

  const handleDelete = useCallback(async (messageId: string) => {
    // Delete logic
  }, []);

  return (
    <div className="flex flex-col gap-0">
      {items.map((item) => (
        <MessageItem
          key={item.key}
          item={item}
          message={messages[item.key]}
          onReply={() => {}}
          onReact={() => {}}
          onDelete={handleDelete}
          density="comfortable"
          isSelectionMode={true}
          isSelected={selectedIds.has(item.key)}
          onToggleSelect={handleToggleSelect}
        />
      ))}
    </div>
  );
};

// ============================================================================
// FILE STRUCTURE & RESPONSIBILITIES
// ============================================================================

/*
MessageItem/
├── MessageItem.tsx
│   └── Main component
│       - Orchestrates sub-components
│       - React.memo optimization
│       - Custom comparison logic
│       - Performance tracking
│
├── MessageItemContent.tsx
│   └── Content routing
│       - Renders DateDivider for 'date' items
│       - Renders UnreadDivider for 'unread' items
│       - Renders SystemMessage for 'system' items
│       - Renders MessageCluster for 'message' items
│
├── MessageItemSelection.tsx
│   └── Selection checkbox UI
│       - Renders checkbox
│       - Prevents event bubbling
│       - i18n accessibility label
│
├── MessageItemWrapper.tsx
│   └── Container with styling
│       - Applies spacing classes
│       - Selection highlight styles
│       - Click handler for selection mode
│
├── types.ts
│   └── TypeScript interfaces
│       - MessageItemProps
│       - MessageItemContentProps
│       - MessageItemSelectionProps
│       - MessageItemWrapperProps
│
├── utils.ts
│   └── Pure utility functions
│       - getAttachmentLayoutSignature()
│       - getReplyLayoutSignature()
│       - getForwardedSignature()
│       - getLayoutSensitiveSignature()
│       - resolveLiveMessage()
│
├── index.ts
│   └── Public API barrel exports
│
└── ARCHITECTURE.md
    └── Detailed design documentation
*/

// ============================================================================
// COMMON PATTERNS & TIPS
// ============================================================================

/**
 * Pattern 1: Memoized Callback Handlers
 * 
 * Always memoize callbacks to prevent unnecessary re-renders of MessageItem
 */
const handleReply = useCallback((message: Message) => {
  // Implementation
}, []); // Empty deps if no dependencies

/**
 * Pattern 2: Handling Different Item Types
 * 
 * MessageItem automatically handles routing:
 * - item.kind === 'date'    → DateDivider
 * - item.kind === 'unread'  → UnreadDivider
 * - item.kind === 'system'  → SystemMessage
 * - item.kind === 'message' → MessageCluster
 * 
 * No need to check type in parent - just pass the item!
 */

/**
 * Pattern 3: Selection Mode
 * 
 * Enable selection by passing:
 * - isSelectionMode={true}
 * - isSelected={selectedIds.has(item.key)}
 * - onToggleSelect={handleToggleSelect}
 */

/**
 * Pattern 4: Density Settings
 * 
 * Affects spacing of items. Options:
 * - 'compact'     - Minimal spacing
 * - 'comfortable' - Default spacing
 * - 'expanded'    - Maximum spacing
 */

/**
 * Pattern 5: Long Text Handling
 * 
 * For messages with long text:
 * - textRenderMode='collapsed'  - Show first N lines with "expand" button
 * - textRenderMode='expanded'   - Show full text
 * - isCollapsibleText={true}    - Enable collapse/expand toggle
 * - onToggleTextExpand={() => {}} - Handle expand/collapse
 */

/**
 * Performance Tips:
 * 
 * 1. Keep callbacks memoized with useCallback
 * 2. Don't recreate MessageItem arrays on every render
 * 3. Use React.memo - already applied in component
 * 4. Monitor renderCount with recordChatRenderCount
 * 5. Avoid passing new objects/arrays as props
 */
