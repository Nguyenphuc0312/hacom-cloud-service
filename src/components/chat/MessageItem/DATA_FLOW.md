/**
 * MessageItem Component - Data Flow & Architecture Diagram
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * This document visualizes how data flows through the MessageItem component
 * and how different parts interact in the Clean Architecture pattern.
 * 
 * 
 * 1. DATA FLOW - HIGH LEVEL
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   Parent Component (e.g., ConversationViewport)
 *         ↓
 *         └─→ Passes TimelineItem[] + Message callbacks
 *         
 *   MessageItem Component (Orchestrator)
 *   ├─→ Resolves message from item + props
 *   ├─→ Records performance metrics
 *   └─→ Composes sub-components
 *         ↓
 *         ├─→ MessageItemWrapper (styling container)
 *         │   ├─ Spacing classes (via getTimelineItemSpacingClass)
 *         │   ├─ Selection highlight styles
 *         │   └─ Click handler for selection
 *         │         ↓
 *         │         ├─→ MessageItemSelection (checkbox UI)
 *         │         │   └─ Only renders when in selection mode
 *         │         │
 *         │         └─→ MessageItemContent (content router)
 *         │             ├─ DateDivider        (if item.kind === 'date')
 *         │             ├─ UnreadDivider      (if item.kind === 'unread')
 *         │             ├─ SystemMessage      (if item.kind === 'system')
 *         │             └─ MessageCluster     (if item.kind === 'message')
 *         │                   ↓ (passes callbacks)
 *         │                   ├─ MessageBodyRenderer
 *         │                   ├─ MessageActions
 *         │                   ├─ ReactionBar
 *         │                   └─ ThreadIndicator
 *         │
 *         └─→ Return JSX to parent
 * 
 * 
 * 2. PROPS FLOW - DETAILED
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   Parent passes to MessageItem:
 *   ┌───────────────────────────────────────┐
 *   │ MessageItemProps (types.ts)           │
 *   ├───────────────────────────────────────┤
 *   │ Data:                                 │
 *   │  ├─ item: ConversationTimelineItem   │
 *   │  └─ message?: Message                 │
 *   │                                       │
 *   │ Callbacks:                            │
 *   │  ├─ onReply: (msg) => void           │
 *   │  ├─ onReact: (id, emoji) => void     │
 *   │  ├─ onForward?: (msg) => void        │
 *   │  ├─ onEdit?: (msg) => Promise        │
 *   │  ├─ onDelete?: (id, mode) => Promise │
 *   │  ├─ onImageClick?: (url) => void     │
 *   │  └─ onFilePreview?: (att) => void    │
 *   │                                       │
 *   │ State:                                │
 *   │  ├─ density: ChatDensity             │
 *   │  ├─ isSelectionMode: boolean         │
 *   │  ├─ isSelected: boolean              │
 *   │  ├─ textRenderMode: string           │
 *   │  └─ shouldAnimateInsert: boolean     │
 *   │                                       │
 *   │ Context:                              │
 *   │  ├─ currentUsername?: string         │
 *   │  └─ viewerCanRecallOthers?: boolean  │
 *   └───────────────────────────────────────┘
 *         ↓
 *   MessageItem.tsx processes and passes to sub-components
 *         ↓
 *   ┌─────────────────────────────────────────────────────┐
 *   │ MessageItemWrapper receives:                        │
 *   ├─────────────────────────────────────────────────────┤
 *   │ - messageId, isSelectionMode, isSelected           │
 *   │ - density, item                                     │
 *   │ - onSelectionToggle callback                        │
 *   │ - children (JSX)                                    │
 *   └─────────────────────────────────────────────────────┘
 *         ↓
 *   ┌─────────────────────────────────────────────────────┐
 *   │ MessageItemSelection receives:                      │
 *   ├─────────────────────────────────────────────────────┤
 *   │ - isSelectionMode, isSelected, messageId           │
 *   │ - onToggleSelect callback                           │
 *   │ - Only renders if isSelectionMode=true             │
 *   └─────────────────────────────────────────────────────┘
 *         ↓
 *   ┌─────────────────────────────────────────────────────┐
 *   │ MessageItemContent receives:                        │
 *   ├─────────────────────────────────────────────────────┤
 *   │ - item, message                                     │
 *   │ - All callbacks (onReply, onReact, etc.)           │
 *   │ - All state (density, isSelectionMode, etc.)       │
 *   │ - Routes to appropriate component based on type    │
 *   └─────────────────────────────────────────────────────┘
 * 
 * 
 * 3. COMPONENT HIERARCHY
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *                        MessageItem
 *                    (Orchestrator)
 *                            │
 *        ┌───────────────────┼───────────────────┐
 *        │                                       │
 *   MessageItemWrapper               MessageItemContent
 *   (Container/Styling)              (Content Router)
 *   ├─ Spacing classes                   ├─ if (kind='date')
 *   ├─ Selection styles                  │   └─ DateDivider
 *   └─ Click handler                     │
 *        │                               ├─ if (kind='unread')
 *        │                               │   └─ UnreadDivider
 *        ├─ MessageItemSelection         │
 *        │  └─ Checkbox UI               ├─ if (kind='system')
 *        │                               │   └─ SystemMessage
 *        └─ [content here]               │
 *                                        └─ if (kind='message')
 *                                            └─ MessageCluster
 *                                                ├─ MessageBodyRenderer
 *                                                ├─ MessageActions
 *                                                ├─ ReactionBar
 *                                                └─ ThreadIndicator
 * 
 * 
 * 4. STATE MACHINE - Item Type Routing
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   TimelineItem.kind
 *        ↓
 *        ├─→ "date"
 *        │   └─→ MessageItemContent renders DateDivider
 *        │       └─→ Shows date pill (e.g., "May 23, 2026")
 *        │
 *        ├─→ "unread"
 *        │   └─→ MessageItemContent renders UnreadDivider
 *        │       └─→ Shows "Unread" line
 *        │
 *        ├─→ "system"
 *        │   └─→ MessageItemContent renders SystemMessage
 *        │       └─→ Shows user joined/left/added/removed message
 *        │
 *        └─→ "message"
 *            └─→ MessageItemContent renders MessageCluster
 *                └─→ Shows actual message with all UI
 *                    ├─ Avatar
 *                    ├─ Sender name
 *                    ├─ Message content (text/image/file/voice/video)
 *                    ├─ Reactions
 *                    ├─ Reply preview (if replying)
 *                    ├─ Thread indicator (if has thread)
 *                    └─ Actions menu
 * 
 * 
 * 5. MEMOIZATION & COMPARISON LOGIC
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   React.memo wraps MessageItem with areEqualMessageItem comparator
 *        ↓
 *   Fast path: item reference === previous item
 *        ├─→ Check shallow equality of other props
 *        └─→ Return result early
 *        ↓
 *   Type-specific path:
 *        ├─→ For "date": compare date.getTime()
 *        ├─→ For "unread": always equal
 *        ├─→ For "system": compare getLayoutSensitiveSignature()
 *        └─→ For "message": compare multiple item properties + signature
 *        ↓
 *   Signature components:
 *        ├─→ Message core: type, senderName, content, status, sendState
 *        ├─→ Message flags: isEdited, isDeleted, isPinned
 *        ├─→ Message relations: replySignature, forwardedSignature
 *        ├─→ Message attachments: attachmentSignature
 *        ├─→ Message social: reactions, readBy count, mentions count
 *        └─→ Message threads: threadCount
 * 
 * 
 * 6. PURE FUNCTIONS - utils.ts Flow
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   resolveLiveMessage()
 *   ├─→ Input: ConversationTimelineItem, message?
 *   └─→ Output: Message | null
 *       └─→ If message prop provided → return it (takes precedence)
 *       └─→ Else if item.kind is "message" or "system" → return item.message
 *       └─→ Else → return null
 * 
 *   getLayoutSensitiveSignature()
 *   ├─→ Input: Message
 *   └─→ Output: string (deterministic signature)
 *       └─→ Combines all layout-affecting properties
 *       └─→ Used in memo comparison
 * 
 *   getAttachmentLayoutSignature()
 *   ├─→ Input: Attachment[]
 *   └─→ Output: string
 *       └─→ Maps each attachment to: id:type:size:dimensions...
 *       └─→ Used in message signature
 * 
 *   getReplyLayoutSignature()
 *   ├─→ Input: Message
 *   └─→ Output: string
 *       └─→ Generates signature of replyToMessage
 *       └─→ Detects when reply changed
 * 
 *   getForwardedSignature()
 *   ├─→ Input: Message
 *   └─→ Output: string
 *       └─→ Generates signature of forwardedFrom
 *       └─→ Detects when forward info changed
 * 
 * 
 * 7. CALLBACK FLOW - Selection Mode
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   User clicks checkbox
 *        ↓
 *   MessageItemSelection.onChange → e.stopPropagation()
 *        ↓
 *   Calls onToggleSelect(messageId)
 *        ↓
 *   MessageItem passes callback to MessageItemSelection
 *   (from parent props)
 *        ↓
 *   Parent component (e.g., ConversationViewport) handles it
 *        ├─→ Adds/removes from selectedSet
 *        └─→ Updates state
 *        ↓
 *   Parent re-renders with:
 *        ├─→ New selectedIds Set
 *        └─→ isSelectionMode=true/false
 *        ↓
 *   MessageItem receives new props
 *        ├─→ isSelected checks if id in selectedIds
 *        ├─→ isSelected={selectedIds.has(messageId)}
 *        └─→ Applied highlight styles via MessageItemWrapper
 * 
 * 
 * 8. CALLBACK FLOW - Message Actions
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   User clicks reaction emoji
 *        ↓
 *   MessageCluster.ReactionBar
 *        ↓
 *   Calls onReact(messageId, emoji)
 *        ↓
 *   MessageItem passes callback to MessageItemContent
 *        ↓
 *   MessageItemContent passes to MessageCluster
 *        ↓
 *   Parent component (ConversationViewport) handles
 *        └─→ Sends to API
 *        └─→ Updates Redux state
 *        └─→ Triggers re-render
 * 
 *   Similar for: onReply, onEdit, onDelete, onForward
 * 
 * 
 * 9. PERFORMANCE TRACKING
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   recordChatRenderCount(source, id, metadata)
 *        ↓
 *   Called in MessageItem.tsx during render
 *        ↓
 *   Records:
 *        ├─→ source = "MessageItem"
 *        ├─→ id = message.id
 *        ├─→ metadata = { itemKind, isSelectionMode, isSelected }
 *        ↓
 *   Data available in React DevTools Profiler
 *        └─→ Identify re-render hotspots
 * 
 * 
 * 10. TYPE SAFETY - TypeScript Flow
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 *   types.ts defines all interfaces
 *        ↓
 *        ├─→ MessageItemProps
 *        ├─→ MessageItemContentProps
 *        ├─→ MessageItemSelectionProps
 *        └─→ MessageItemWrapperProps
 *        ↓
 *   Each component receives typed props
 *        ↓
 *   TypeScript compiler checks at each layer
 *        ├─→ MessageItem.tsx: checks MessageItemProps
 *        ├─→ MessageItemContent: checks MessageItemContentProps
 *        ├─→ etc.
 *        ↓
 *   Compilation fails if types don't match
 *        └─→ Catches errors before runtime
 * 
 * 
 * ═════════════════════════════════════════════════════════════════════════════
 * KEY INSIGHTS
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * ✓ Each component has well-defined input/output
 * ✓ Data flows top-to-bottom (parent → child)
 * ✓ Callbacks flow bottom-to-top (child → parent)
 * ✓ State lives in parent, props in children
 * ✓ Pure functions are isolated in utils.ts
 * ✓ Type safety enforced at every layer
 * ✓ Memoization prevents unnecessary re-renders
 * ✓ Performance is observable and measurable
 * 
 */
