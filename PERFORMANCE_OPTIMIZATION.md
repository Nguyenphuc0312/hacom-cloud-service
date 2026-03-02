# ChatPage Performance Optimization — 10k+ Messages

## Summary of Changes Made

### 1. Structural Sharing in `useMessageGrouping` (HIGH IMPACT)

**File:** `src/hooks/useMessageGrouping.ts`

**Problem:** Every time the `messages` array changed (new message, reaction update, status change), the entire `TimelineItem[]` was rebuilt from scratch with new object references. Downstream `React.memo` comparisons always detected changes, causing all ~20 visible `TimelineRow` + `MessageItem` components to re-render.

**Fix:** After building the new `TimelineItem[]`, compare each item against the previous render's items by key. If an item is content-equal to its predecessor, reuse the previous reference. This ensures that when a single message arrives at the tail, only 1-2 items get new references — the other 9,998 keep stable references.

**Impact:** Reduces per-message re-renders from O(visible) to O(changed items). For a typical new-message-at-tail scenario: 2 MessageItem re-renders instead of ~20.

---

### 2. Deep Memoization on `MessageItem` (HIGH IMPACT)

**File:** `src/components/chat/MessageItem.tsx`

**Problem:** `React.memo(MessageItemComponent)` used default shallow comparison. Since `useMessageGrouping` produced new `TimelineItem` objects (before structural sharing), every visible item re-rendered.

**Fix:** Custom `areEqualMessageItem` comparator that:

- Fast-paths on reference equality (structural sharing hit)
- Compares timeline item properties: `kind`, `key`, `isGroupStart`, `isGroupEnd`, etc.
- Compares message content: `id`, `content`, `status`, `isEdited`, `isDeleted`, `isPinned`
- Structurally compares `reactions` array (emoji + count per entry)

**Impact:** Even without structural sharing, this prevents DOM updates for unchanged messages. With structural sharing, this is a secondary safety net.

---

### 3. Optimistic Reaction Updates (MEDIUM IMPACT)

**File:** `src/pages/ChatPage.tsx` — `handleReactMessage`

**Problem:** Reactions waited for the API response before updating the UI. This caused ~200-500ms latency per reaction click.

**Fix:**

- Compute the expected reaction state locally (toggle user in/out of reaction)
- Apply the optimistic state to the store immediately
- Then fire the API call
- On success: apply server's canonical state
- On failure: rollback to pre-optimistic state

**Impact:** Reactions appear instantly. Rollback is seamless if the API fails.

---

### 4. Stable Handler References (MEDIUM IMPACT)

**Files:** `src/pages/ChatPage.tsx` — `handleReactMessage`, `handleLoadOlderMessages`, `handleRetryMessages`

**Problem:** These handlers depended on `conversationMessages` (the full message array), `hasMoreMessages`, and `isLoadingMessagesByConversation` in their `useCallback` dependency arrays. Every incoming message caused these callbacks to be recreated, propagating new function references through `ChatWindow` → `MessageList` → all visible rows.

**Fix:** Read these values from the store at call time via `useChatStore.getState()` instead of capturing them as closure dependencies. This makes the handlers stable across message changes.

**Dependencies removed:**
| Handler | Removed deps |
|---------|-------------|
| `handleReactMessage` | `conversationMessages`, `t` |
| `handleLoadOlderMessages` | `conversationMessages`, `hasMoreMessages`, `isLoadingMessagesByConversation` |
| `handleRetryMessages` | `isLoadingMessagesByConversation` |

---

### 5. Scoped Zustand Selectors (MEDIUM IMPACT)

**File:** `src/pages/ChatPage.tsx`

**Problem:** The `useShallow` selector subscribed to `hasMoreMessages`, `isLoadingMessagesByConversation`, and `messageErrors` — all `Record<string, T>` objects. Any conversation's loading state change (including idle-prefetched adjacent rooms) created new object references, triggering ChatPage re-render.

**Fix:** Replaced with three scoped selectors that derive only the CURRENT conversation's values:

```tsx
const currentHasMore = useChatStore(
  (s) => s.hasMoreMessages[selectedConversationId] ?? true,
);
const currentIsLoading = useChatStore((s) =>
  Boolean(s.isLoadingMessagesByConversation[selectedConversationId]),
);
const currentMessageError = useChatStore(
  (s) => s.messageErrors[selectedConversationId] ?? null,
);
```

**Impact:** ChatPage no longer re-renders when adjacent conversations are prefetched.

---

### 6. `TimelineRow` `useLayoutEffect` Dependency Fix (LOW-MEDIUM IMPACT)

**File:** `src/components/chat/MessageList.tsx`

**Problem:** The measurement `useLayoutEffect` in `TimelineRow` depended on `data` (the entire `rowData` object). Any `rowData` change caused all visible rows to re-measure via `getBoundingClientRect()` — a forced layout/reflow.

**Fix:** Destructure `setItemSize` and `measureVersion` from `data` and depend on those stable values instead. Combined with structural sharing (stable `item` references), the effect only runs for items whose content actually changed.

---

## Refactor Plan: Hook Extraction Strategy

### Current State

`ChatPage.tsx` is ~900 lines with 12+ handlers, 8+ effects, and mixed concerns (room sync, message CRUD, room creation, UI state).

### Proposed Hook Extraction

#### Phase 1: `useChatRoomSync(conversationId)`

**Responsibility:** URL ↔ store synchronization, room validation, join/leave.

**Extract:**

- Room validation effect (lines ~195-245)
- Join/leave room + load messages effect (lines ~255-285)
- Direct conversation info hydration effect (lines ~475-505)
- Prefetch adjacent conversations effect (lines ~395-425)

**Returns:**

```ts
{
  isValidatingRoom: boolean;
}
```

**Rationale:** These effects are tightly coupled to `conversationId` URL param and don't depend on message content. Extracting them isolates navigation concerns from message rendering.

#### Phase 2: `useChatMessageHandlers(conversationId, currentUserSummary)`

**Responsibility:** Message CRUD operations.

**Extract:**

- `handleSendMessage`
- `handleReactMessage` (with optimistic updates)
- `handleEditMessage`
- `handleDeleteMessage`
- `handleLoadOlderMessages`
- `handleRetryMessages`

**Returns:**

```ts
{
  handleSendMessage: (...) => Promise<void>;
  handleReactMessage: (messageId: string, emoji: string) => Promise<void>;
  handleEditMessage: (messageId: string, content: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => Promise<void>;
  handleLoadOlderMessages: () => Promise<void>;
  handleRetryMessages: () => Promise<void>;
}
```

**Rationale:** All handlers follow the same pattern: guard → call API → update store. They're the most performance-sensitive code (callback stability matters) and benefit from isolation for testing.

#### Phase 3: `useChatRoomCreation()`

**Responsibility:** Direct/group room creation with conflict handling.

**Extract:**

- `handleStartChat`
- `handleCreateGroup`
- `isCreatingRoom` state
- `roomCreationLockRef`

**Returns:**

```ts
{
  handleStartChat: (userId: string) => Promise<void>;
  handleCreateGroup: (payload: { name: string; memberIds: string[] }) =>
    Promise<void>;
  isCreatingRoom: boolean;
}
```

### Post-Extraction ChatPage Structure

```tsx
export const ChatPage: React.FC = () => {
  const { conversationId } = useParams();
  const { user } = useAuthStore();
  const currentUserSummary = useMemo(() => ..., [user]);

  // Hooks
  const { isValidatingRoom } = useChatRoomSync(conversationId);
  const handlers = useChatMessageHandlers(selectedConversationId, currentUserSummary);
  const { handleStartChat, handleCreateGroup, isCreatingRoom } = useChatRoomCreation();

  // UI state (sidebar, info panel, modals)
  // ... ~30 lines of local state + simple handlers

  // JSX
  return <div>...</div>;
};
```

**Target:** ~200-250 lines for ChatPage, down from ~900.

---

## Performance Profiling Checklist

### Pre-Optimization Baseline

- [ ] Record a React DevTools Profiler trace with 1k messages loaded
- [ ] Note the "Render duration" for MessageList when a new message arrives
- [ ] Note the number of components that re-rendered (visible in flamegraph)
- [ ] Record a Chrome Performance trace (5s) during rapid message receipt
- [ ] Measure "Scripting" vs "Rendering" vs "Painting" breakdown

### After Each Optimization

- [ ] Re-record the same scenarios
- [ ] Compare render counts: how many MessageItem components re-rendered?
- [ ] Compare render duration: total ms for MessageList render pass
- [ ] Check for layout thrashing: forced reflows in Performance → "Layout" entries

### Specific Scenarios to Profile

#### Scenario 1: New Message at Tail (most common)

1. Load a conversation with 500+ messages
2. Start Profiler recording
3. Send 5 messages rapidly
4. Stop recording
5. **Expected:** Only 1-2 MessageItem re-renders per message, not ~20

#### Scenario 2: Reaction Toggle

1. Load a conversation with 500+ messages
2. Start Profiler recording
3. Toggle a reaction on a visible message
4. Stop recording
5. **Expected:** Only the reacted message's MessageItem re-renders

#### Scenario 3: Scroll Through History

1. Load a conversation with 1k+ messages
2. Start Performance recording
3. Scroll from bottom to top continuously for 5 seconds
4. Stop recording
5. **Expected:** No jank (all frames <16ms), smooth 60fps

#### Scenario 4: Conversation Switch

1. Have two conversations with 500+ messages each
2. Start Profiler recording
3. Switch between them 3 times rapidly
4. Stop recording
5. **Expected:** No stale renders, clean unmount/mount cycles

#### Scenario 5: Load Older Messages (Infinite Scroll)

1. Load a conversation with 500+ messages, more available on server
2. Start Profiler recording
3. Scroll to top to trigger load-more
4. Stop recording
5. **Expected:** Scroll position preserved, no visible jump, new items render at top

### Tools & Techniques

- **React DevTools Profiler:** Component-level render timing and "why did this render?"
- **Chrome Performance tab:** Frame-level analysis, layout thrashing detection
- **`React.Profiler` component:** Wrap `<MessageList>` for programmatic timing:
  ```tsx
  <React.Profiler id="MessageList" onRender={(id, phase, duration) => {
    if (duration > 16) console.warn(`${id} slow render: ${duration.toFixed(1)}ms`);
  }}>
    <MessageList ... />
  </React.Profiler>
  ```
- **`?debugMessages=1` query param:** Already enabled in codebase for breakpoint debugging
- **`why-did-you-render`:** Add temporarily for deep re-render analysis:
  ```bash
  npm install @welldone-software/why-did-you-render --save-dev
  ```

### Performance Budgets

| Metric                           | Target | Acceptable |
| -------------------------------- | ------ | ---------- |
| New message render (MessageList) | <4ms   | <8ms       |
| Reaction toggle render           | <2ms   | <6ms       |
| Scroll frame time                | <8ms   | <16ms      |
| Conversation switch (mount)      | <50ms  | <100ms     |
| Load-more (merge + render)       | <30ms  | <60ms      |
