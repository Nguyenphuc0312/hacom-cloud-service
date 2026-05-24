/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REFACTORING SUMMARY: MessageItem Component - Clean Architecture
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROJECT: chat-web-client / Frontend Modular Architecture
 * DATE: 2026-05-23
 * TYPE: Code Refactoring - Separation of Concerns + Clean Architecture
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BEFORE & AFTER COMPARISON
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * BEFORE:
 * -------
 * ✗ File: src/components/chat/MessageItem.tsx
 * ✗ Size: ~350 lines
 * ✗ Responsibilities: 
 *   - Orchestration
 *   - Item type routing (date, unread, system, message)
 *   - Selection checkbox rendering
 *   - Spacing & styling logic
 *   - Utility function definitions
 *   - React.memo comparison
 * 
 * ✗ Issues:
 *   - Hard to find specific logic
 *   - Difficult to test individual concerns
 *   - Cannot reuse sub-logic
 *   - High cognitive load when reading
 *   - Hard to onboard new developers
 *   - Difficult to maintain and debug
 * 
 * 
 * AFTER:
 * ------
 * ✓ Folder: src/components/chat/MessageItem/
 * ✓ Files: 8 files (6 source + 2 documentation)
 * ✓ Modular structure with clear responsibilities:
 * 
 *   MessageItem.tsx (50 lines)
 *   └─ Orchestrator - composes sub-components
 *   └─ React.memo with custom comparison
 *   └─ Performance tracking
 * 
 *   MessageItemContent.tsx (60 lines)
 *   └─ Content router
 *   └─ Renders correct component based on item type
 * 
 *   MessageItemSelection.tsx (35 lines)
 *   └─ Selection checkbox UI only
 *   └─ No other concerns
 * 
 *   MessageItemWrapper.tsx (35 lines)
 *   └─ Container styling
 *   └─ Spacing logic
 *   └─ Click handlers
 * 
 *   types.ts (80 lines)
 *   └─ All TypeScript interfaces
 *   └─ Centralized type definitions
 * 
 *   utils.ts (100 lines)
 *   └─ Pure utility functions
 *   └─ Signature generators
 *   └─ Message resolution
 * 
 *   index.ts (25 lines)
 *   └─ Public API barrel exports
 * 
 *   ARCHITECTURE.md (300+ lines)
 *   └─ Design documentation
 *   └─ Usage guidelines
 *   └─ Extension patterns
 * 
 *   README.md (200+ lines)
 *   └─ Quick start guide
 *   └─ Usage examples
 *   └─ Common patterns
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLDER STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * src/components/chat/
 * ├── MessageItem/                          ← NEW FOLDER
 * │   ├── MessageItem.tsx                   (Orchestrator)
 * │   ├── MessageItemContent.tsx            (Content Router)
 * │   ├── MessageItemSelection.tsx          (Selection UI)
 * │   ├── MessageItemWrapper.tsx            (Container)
 * │   ├── types.ts                          (Interfaces)
 * │   ├── utils.ts                          (Pure Functions)
 * │   ├── index.ts                          (Exports)
 * │   ├── ARCHITECTURE.md                   (Design Doc)
 * │   └── README.md                         (Quick Start)
 * │
 * ├── ChatHeader.tsx
 * ├── ConversationViewport.tsx
 * ├── DateDivider.tsx
 * ├── UnreadDivider.tsx
 * ├── message-layout/
 * │   ├── MessageCluster.tsx
 * │   └── ...
 * ├── message/
 * │   ├── MessageActions.tsx
 * │   ├── SystemMessage.tsx
 * │   └── ...
 * ├── index.ts                               (Exports updated)
 * └── ...
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CLEAN ARCHITECTURE PRINCIPLES APPLIED
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✓ SINGLE RESPONSIBILITY PRINCIPLE (SRP)
 *   - MessageItemSelection: Only render checkbox
 *   - MessageItemWrapper: Only handle styling & spacing
 *   - MessageItemContent: Only route content based on type
 *   - utils.ts: Only pure utility functions
 * 
 * ✓ SEPARATION OF CONCERNS (SOC)
 *   - UI logic ≠ Content rendering ≠ Styling ≠ Utilities
 *   - Each concern in its own module
 *   - Clear boundaries between components
 * 
 * ✓ DEPENDENCY INJECTION (DI)
 *   - Callbacks passed as props (onReply, onReact, etc.)
 *   - No direct state manipulation
 *   - Parent controls behavior
 * 
 * ✓ COMPOSITION PATTERN
 *   - Build complex UI from simple components
 *   - Each component independently testable
 *   - Easy to reuse and extend
 * 
 * ✓ MEMOIZATION FOR PERFORMANCE
 *   - React.memo with custom comparison
 *   - Reduces unnecessary re-renders
 *   - Observable performance improvements
 * 
 * ✓ PURE FUNCTIONS IN utils.ts
 *   - No side effects
 *   - Deterministic behavior
 *   - Easy to test
 *   - Easy to debug
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE-BY-FILE BREAKDOWN
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MessageItem.tsx (Orchestrator)                                          │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Compose sub-components into final message item                        │
 * │ - Handle React.memo optimization                                        │
 * │ - Implement custom equality comparison (areEqualMessageItem)           │
 * │ - Record performance metrics                                            │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Orchestration logic is complex and performance-critical               │
 * │ - Memo comparison deserves its own module                               │
 * │ - Core component logic should be focused                                │
 * │                                                                         │
 * │ Size: ~50 lines (focused)                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MessageItemContent.tsx (Content Router)                                 │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Route based on item.kind (date, unread, system, message)             │
 * │ - Render appropriate component for each type                            │
 * │ - Pass necessary props to child components                              │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Type-based routing is a distinct concern                              │
 * │ - Can be tested independently                                           │
 * │ - Makes conditional rendering explicit and readable                     │
 * │                                                                         │
 * │ Handles:                                                                │
 * │ - DateDivider: When item.kind === "date"                               │
 * │ - UnreadDivider: When item.kind === "unread"                           │
 * │ - SystemMessage: When item.kind === "system"                           │
 * │ - MessageCluster: When item.kind === "message"                         │
 * │                                                                         │
 * │ Size: ~60 lines (focused on routing)                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MessageItemSelection.tsx (Selection UI)                                 │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Render checkbox UI                                                    │
 * │ - Handle change and click events                                        │
 * │ - Provide accessibility label                                           │
 * │ - Prevent event bubbling                                                │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Selection is optional (not always shown)                              │
 * │ - Can be independently tested and styled                                │
 * │ - Could be replaced with different selection UI (radio, custom)        │
 * │                                                                         │
 * │ Single Responsibility:                                                  │
 * │ - Checkbox rendering only                                               │
 * │ - No logic about selection state management                             │
 * │ - No knowledge of parent's selection logic                              │
 * │                                                                         │
 * │ Size: ~35 lines (minimal)                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ MessageItemWrapper.tsx (Container)                                      │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Apply spacing classes                                                 │
 * │ - Apply selection highlight styling                                     │
 * │ - Handle click events in selection mode                                 │
 * │ - Wrap children with appropriate container div                          │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Styling/layout logic is separate from behavior                        │
 * │ - Can be modified independently                                         │
 * │ - Makes styling intent explicit                                         │
 * │                                                                         │
 * │ Type-safe:                                                              │
 * │ - Type guards ensure getTimelineItemSpacingClass receives correct type   │
 * │ - Props interface defines exact contract                                │
 * │                                                                         │
 * │ Size: ~35 lines (focused)                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ types.ts (Type Definitions)                                             │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Define all TypeScript interfaces                                      │
 * │ - Centralize type definitions                                           │
 * │ - Ensure type consistency across module                                 │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Types are shared across multiple components                           │
 * │ - Centralizing makes updates easier                                     │
 * │ - Single source of truth for contracts                                  │
 * │                                                                         │
 * │ Contains:                                                               │
 * │ - MessageItemProps (main component)                                     │
 * │ - MessageItemContentProps                                               │
 * │ - MessageItemSelectionProps                                             │
 * │ - MessageItemWrapperProps                                               │
 * │                                                                         │
 * │ Size: ~80 lines (comprehensive)                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ utils.ts (Pure Functions)                                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Generate signatures for message comparison                            │
 * │ - Resolve live message from timeline item                               │
 * │ - Provide deterministic utility functions                               │
 * │                                                                         │
 * │ Why separate?                                                           │
 * │ - Pure functions are easy to test and debug                             │
 * │ - Can be reused in other contexts                                       │
 * │ - No dependencies on React or other libraries                           │
 * │ - Can be optimized and cached independently                             │
 * │                                                                         │
 * │ Functions:                                                              │
 * │ - getAttachmentLayoutSignature()      (Attachment → string signature)   │
 * │ - getReplyLayoutSignature()           (Reply → string signature)        │
 * │ - getForwardedSignature()             (Forward → string signature)      │
 * │ - getLayoutSensitiveSignature()       (Full message comparison)         │
 * │ - resolveLiveMessage()                (Timeline item → Message)         │
 * │                                                                         │
 * │ Size: ~100 lines (utility-focused)                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ index.ts (Barrel Exports)                                               │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ Responsibility:                                                         │
 * │ - Define public API for the module                                      │
 * │ - Re-export all public items                                            │
 * │ - Hide internal implementation details                                  │
 * │                                                                         │
 * │ Public Exports:                                                         │
 * │ - MessageItem (main component)                                          │
 * │ - Sub-components (for advanced composition)                             │
 * │ - Type definitions (for consumers)                                      │
 * │ - Utility functions (for advanced use cases)                            │
 * │                                                                         │
 * │ Import Pattern:                                                         │
 * │ import { MessageItem } from '@/components/chat/MessageItem';            │
 * │ // Automatically loads index.ts                                         │
 * │                                                                         │
 * │ Size: ~25 lines (minimal)                                               │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * KEY IMPROVEMENTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. MAINTAINABILITY
 *    ✓ Smaller files (30-60 lines each vs 350 lines)
 *    ✓ Easier to understand at a glance
 *    ✓ Changes are localized to specific modules
 *    ✓ Reduced cognitive load
 * 
 * 2. TESTABILITY
 *    ✓ Each component can have focused unit tests
 *    ✓ Pure functions in utils.ts are trivial to test
 *    ✓ Mocking and stubbing becomes simpler
 *    ✓ Integration tests can test composition
 * 
 * 3. REUSABILITY
 *    ✓ Sub-components can be reused in other contexts
 *    ✓ Utility functions can be used elsewhere
 *    ✓ Types are exported for other modules
 * 
 * 4. EXTENSIBILITY
 *    ✓ Adding new features doesn't bloat existing files
 *    ✓ New selection types can extend MessageItemSelection
 *    ✓ New item types just add new routing in MessageItemContent
 *    ✓ New utilities go to utils.ts without affecting components
 * 
 * 5. PERFORMANCE
 *    ✓ React.memo optimization more clearly visible
 *    ✓ Comparison logic explicitly in one place
 *    ✓ Easy to identify performance bottlenecks
 *    ✓ Recording metrics integrated smoothly
 * 
 * 6. DEVELOPER EXPERIENCE
 *    ✓ New developers can focus on one component at a time
 *    ✓ Code review is simpler (smaller changes)
 *    ✓ Finding bugs is easier (smaller scope)
 *    ✓ Documentation is module-specific
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BACKWARDS COMPATIBILITY
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✓ Import paths unchanged
 *   import { MessageItem } from '@/components/chat/MessageItem';
 *   → Works exactly the same (index.ts exports)
 * 
 * ✓ Props interface unchanged
 *   MessageItemProps has same properties
 *   → No changes needed in parent components
 * 
 * ✓ Component behavior unchanged
 *   All logic is the same, just reorganized
 *   → No behavioral differences
 * 
 * ✓ Export in chat/index.ts updated
 *   Now imports from ./MessageItem (folder)
 *   → Automatic via index.ts convention
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * VALIDATION & TESTING
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✓ TypeScript typecheck: PASSED
 *   npm run typecheck → No errors
 * 
 * ✓ File structure: CREATED
 *   All 8 files in src/components/chat/MessageItem/ folder
 * 
 * ✓ Exports working: VERIFIED
 *   index.ts properly exports all public APIs
 * 
 * ✓ Imports updated: DONE
 *   Removed old MessageItem.tsx file
 *   index.ts in chat folder still references it (via folder)
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW TO USE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * No changes needed! Everything works the same:
 * 
 * import { MessageItem } from '@/components/chat';
 * // or
 * import { MessageItem } from '@/components/chat/MessageItem';
 * 
 * <MessageItem
 *   item={timelineItem}
 *   message={message}
 *   onReply={handleReply}
 *   {...otherProps}
 * />
 * 
 * For advanced usage, read:
 * - src/components/chat/MessageItem/ARCHITECTURE.md
 * - src/components/chat/MessageItem/README.md
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * NEXT STEPS (OPTIONAL EXTENSIONS)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Apply same pattern to other large components:
 *    - ChatHeader.tsx → ChatHeader folder
 *    - MessageActions.tsx → MessageActions folder
 *    - ConversationViewport.tsx → ConversationViewport folder
 * 
 * 2. Create comprehensive unit tests for each sub-component
 * 
 * 3. Extract reusable UI components to shared/common:
 *    - Create generic Selection component
 *    - Create generic Container wrapper
 * 
 * 4. Add storybook stories for each sub-component
 * 
 * 5. Document common patterns in project-wide guidelines
 * 
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
