# Web Client Documentation References

**Date:** 2026-06-05
**Repo:** `chat-web-client`
**Purpose:** Redirect to existing documentation and consolidate key references.

---

## 1. Existing Documentation

The `chat-web-client` repository has comprehensive documentation already in place.

### 1.1. Primary Audit Document

| File | Lines | Purpose |
|---|---|---|
| `UI_AUDIT_REPORT.md` | 1288 | Full UI/UX audit — 15 critical findings, 15 deep-dive sections, scroll system analysis |

**Read this first.** This is the single most comprehensive audit document in the repository.

### 1.2. Refactor Plan

| File | Lines | Purpose |
|---|---|---|
| `REFACTOR_UI_PLAN.md` | 271 | Phased refactor plan with Definition of Done |

### 1.3. UI Specifications

| File | Purpose |
|---|---|
| `docs/CHAT_UI_SPEC.md` | Chat UI reference specifications |
| `docs/production-readiness-gate.md` | Production gate checklist |
| `docs/chat-scroll-debug-checklist.md` | Scroll debug guide |
| `docs/chat-performance-baseline.md` | Performance baseline |

### 1.4. Component Documentation

The `src/components/chat/MessageItem/` directory contains 7 documentation files:
- `ARCHITECTURE.md` — Architecture
- `BEFORE_AFTER_COMPARISON.md` — Before/after
- `DATA_FLOW.md` — Data flow
- `FINAL_SUMMARY.md` — Final summary
- `README.md` — Component docs
- `REFACTORING_SUMMARY.md` — Refactor summary

---

## 2. Key Findings from UI_AUDIT_REPORT.md

### 2.1. Critical Findings (P0)

| ID | Area | Issue | File |
|---|---|---|---|
| CF-01 | Conversation List | Unread badge disabled by `{null}` | `RoomItem.tsx:353` |
| CF-02 | Visual Design | Auth forms use hardcoded Tailwind colors | `PasswordLoginForm.tsx` |

### 2.2. Quick Wins

| Priority | Action | Files |
|---|---|---|
| Week 1 | Delete dead scroll hooks | `useVirtualizedMessages.ts`, `useTanStackVirtualizedMessages.ts`, wrapper `MessageBubble.tsx` |
| Week 1 | i18n hardcoded strings | `EmptyState.tsx`, `SidebarHeader.tsx`, `MessageInput.tsx` |
| Week 1 | Fix auth color tokens | `PasswordLoginForm.tsx` |
| Week 2 | Fix unread badge | `RoomItem.tsx:353`, `chatStoreUnread.ts` |
| Week 3 | Split MessageInput | `MessageInput.tsx` → ComposerToolbar, MentionPanel, AttachmentTray |
| Week 3 | Split ChatWindow | `ChatWindow.tsx` → overlay components |

### 2.3. What NOT to Touch

| System | Reason |
|---|---|
| `useSimpleChatScroll.ts` | Well-designed, no bugs found |
| Zustand + RTK architecture | Optimistic updates, deduplication all working |
| Message deduplication (`messageMerge.ts`) | Sophisticated logic, works correctly |
| TanStack Virtual setup | Working correctly |

---

## 3. Refactor Roadmap Summary

### Phase 0 — Cleanup Dead Code
- Delete: `useVirtualizedMessages.ts`, `useTanStackVirtualizedMessages.ts`, wrapper `MessageBubble.tsx`

### Phase 1 — Stabilize Core UX
- Fix unread badge bug
- Fix auth form color tokens
- i18n hardcoded strings

### Phase 2 — Polish Visual Consistency
- Design token compliance
- Border radius standardization
- Component splitting

### Phase 3 — Accessibility + Performance
- ARIA attributes
- React.memo on large components
- Strip debug logging

---

## 4. Scroll System Reference

The scroll system is well-documented in the full audit. Key reference:

```
src/features/chat/simple-virtual-timeline/useSimpleChatScroll.ts
```

**8 Rules implemented:**
1. Initial bottom scroll on mount
2. Own message appended → scrollToIndex
3. Remote while near-bottom → scrollToIndex
4. Remote while detached → pendingNewMessages counter
5. Older prepend restore → pendingPrependRestoreRef
6. Media settled → scrollToIndex if near-bottom
7. Jump to latest → scrollToIndex + clear badge
8. OnScroll → read-only state update

---

## 5. State Management Reference

- `src/stores/chatStore.ts` (~4600 lines) — Main chat state
- `src/stores/chatStoreUnread.ts` — Unread count with optimistic updates
- `src/stores/chatStoreOutbox.ts` — Message outbox with retry
- `src/features/api/chatApi.ts` — RTK Query endpoints

---

## 6. Testing Checklist Summary

The full audit includes a 60+ item QA checklist covering:
- Layout & Navigation
- Conversation List
- Message List
- Scroll Behavior (CRITICAL)
- Composer / Input Box
- Realtime Behavior
- Error Handling
- Accessibility
- Dark Mode
- i18n
- Performance
- Authentication & Session

---

**Last updated:** 2026-06-05
**Redirected from:** `docs/REFACTOR_UI_PLAN.md` (duplicate)
