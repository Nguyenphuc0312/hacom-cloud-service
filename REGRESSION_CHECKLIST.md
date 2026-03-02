# Coverage Gap Closure — Regression Checklist

## P0 Features

### 1. Message Search (SearchPanel)

- [ ] Click search icon in ChatHeader → SearchPanel opens
- [ ] Type query → results appear after 400ms debounce
- [ ] Matching text is highlighted in results
- [ ] Click result → navigates/scrolls to message
- [ ] Scroll to bottom → loads more results (infinite scroll)
- [ ] Empty query shows placeholder state
- [ ] No results shows empty state
- [ ] Press Escape → panel closes
- [ ] Switching conversations closes panel

### 2. Pinned Messages (PinnedMessagesPanel)

- [ ] Pinned messages panel renders in ChatWindow
- [ ] Each pinned message shows sender avatar, content, time
- [ ] Click pinned message → jumps to message in conversation
- [ ] Pin/unpin action accessible from MessageActions menu
- [ ] Optimistic UI: pin/unpin reflected immediately
- [ ] Revert on API failure
- [ ] Loading skeleton shown during fetch
- [ ] Empty state when no pinned messages

### 3. Unread Count Badge

- [ ] ConversationItem already shows `conversation.unreadCount` via Badge component
- [ ] Badge renders correct count from server data
- [ ] Badge hidden when count is 0

### 4. Change Password (SecuritySection in Settings)

- [ ] SecuritySection renders in SettingsPage
- [ ] Form has current password, new password, confirm password fields
- [ ] Password strength indicator shown for new password
- [ ] Submit calls `authApi.changePassword()`
- [ ] Success toast shown on success → form clears
- [ ] Wrong current password → field-level error
- [ ] Validation: passwords must match, complexity enforced

### 5. Reset Password Page

- [ ] `/reset-password?token=...` route loads ResetPasswordPage
- [ ] Missing token → shows invalid token error state
- [ ] Form: new password + confirm + strength indicator
- [ ] Submit → calls `authApi.resetPassword(token, password)`
- [ ] Success → shows success screen with "Go to login" link
- [ ] Invalid/expired token → shows error with "Request new link"
- [ ] Back to login link works

## P1 Features

### 6. Sent Friend Requests Tab

- [ ] FriendRequestsPanel has Received / Sent tabs
- [ ] Received tab shows pending count badge
- [ ] Received tab lists incoming requests with accept/reject buttons
- [ ] Sent tab lists sent requests with cancel button
- [ ] Empty states shown for each tab

### 7. Cancel Friend Request

- [ ] Cancel button calls `friendshipApi.cancelFriendRequest()`
- [ ] Request removed from list on success
- [ ] Error toast on failure

### 8. Pending Request Badge

- [ ] Pending count fetched via `friendshipApi.getPendingCount()`
- [ ] Badge renders on Received tab header

### 9. Block/Unblock Users (BlockedUsersSection)

- [ ] BlockedUsersSection renders in SettingsPage
- [ ] Lists all blocked users with avatar, name, username
- [ ] Unblock button removes user optimistically
- [ ] Success/error toasts shown
- [ ] Empty state when no blocked users

### 10. Delete Account (DangerZoneSection)

- [ ] DangerZoneSection renders at bottom of SettingsPage
- [ ] Red-bordered section with warning
- [ ] Click "Delete" → shows confirmation with password input
- [ ] Cancel → hides confirmation
- [ ] Submit with wrong password → field error
- [ ] Submit with correct password → account deleted, logged out
- [ ] Success toast shown

## P2 Features (API layer ready, UI can be wired incrementally)

### 11. Update Username

- [ ] `userApi.updateUsername()` ready in api.ts

### 12. Friendship Status Check

- [ ] `friendshipApi.getFriendshipStatus()` ready in api.ts
- [ ] `useFriendship.checkFriendshipStatus()` available in hook

### 13. Single Message Fetch

- [ ] `messageApi.getMessageById()` ready in api.ts

## Integration Points

### MessageActions

- [ ] Pin/Unpin button appears in message action bar
- [ ] Shows "Pin" for unpinned messages, "Unpin" for pinned
- [ ] `onPin` callback properly wired

### ChatWindow

- [ ] SearchPanel renders below ChatHeader when search is active
- [ ] PinnedMessagesPanel renders below ChatHeader when pinned view is active
- [ ] Panels are mutually exclusive (opening one closes the other)
- [ ] Panels close when switching conversations

### SettingsPage

- [ ] SecuritySection appears after ChatSection
- [ ] BlockedUsersSection appears after SecuritySection
- [ ] DangerZoneSection appears last (before version)
- [ ] All sections use SettingsSection wrapper with icons

### Routing

- [ ] `/reset-password` route accessible as public route
- [ ] Lazy-loaded component works correctly

### i18n

- [ ] All new keys present in en.json
- [ ] All new keys present in vi.json
- [ ] Language switching works for new strings

### Hooks

- [ ] useMessageSearch exported from hooks/index.ts
- [ ] usePinnedMessages exported from hooks/index.ts
- [ ] useFriendship exported from hooks/index.ts
