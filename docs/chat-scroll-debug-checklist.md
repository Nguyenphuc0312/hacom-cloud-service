# Chat Scroll Debug Checklist

Enable debug traces before running the matrix:

```powershell
$env:VITE_CHAT_SCROLL_DEBUG="true"; npm run dev
```

In the browser console, inspect:

```js
window.__chatMessageDebugEvents?.filter((event) => event.scope === "chatScroll")
```

Required manual matrix:

1. Open a conversation with 100 messages. Expected: latest row is visible and `scroll_decision` logs `conversation_open_latest_bottom` then `bottom_applied`.
2. Open a conversation with 10,000 messages. Expected: latest row is visible, rendered DOM rows stay near the virtualizer window, not 10,000.
3. Open a conversation from cached old RTK data, then let refetch return a newer tail. Expected: restore is invalidated and bottom command wins.
4. Return to a conversation while reading history and latestKey is unchanged. Expected: `restore_history_position` applies once.
5. Return to a conversation while reading history and latestKey changed. Expected: no restore; latest bottom wins when unread/newer exists.
6. Stay near bottom and receive another user's message. Expected: `realtime_follow_if_near_bottom` and bottom follows smoothly.
7. Scroll up in history and receive another user's message. Expected: no scroll jump, new messages pill appears.
8. Scroll up in history and send your own message. Expected: `own_message_follow_bottom` wins and bottom follows.
9. Load older history from top. Expected: `load_older_anchor_restore` wins, viewport anchor is stable, no bottom command runs.
10. Load a slow image/media row. Expected: pinned bottom follows; reading history preserves anchor.
11. Switch conversations quickly 20 times. Expected: stale command logs `command_skipped_stale_conversation`, no old command applies to the new room.
12. Run with React StrictMode. Expected: duplicate effects do not cause restore to beat latest bottom.

Benchmark events to capture:

- `open_to_first_render`
- `open_to_bottom_applied`
- `bottom_apply_attempts`
- `restore_apply_attempts`
- `append_to_bottom_latency`
- `message-list-dom-node-count`
- `react-profiler-message-list`
