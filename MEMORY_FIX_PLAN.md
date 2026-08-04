# MEMORY_FIX_PLAN

Date: 2026-07-03

Scope: read-only audit of current `chat-web-client` memory/render state before any behavior fix. This plan cross-checks the H1-H5/M1-M6 suspects from `BUG WEB.docx` against current code, `MEMORY_AUDIT.md`, `MEMORY_RUNTIME_VERIFICATION.md`, and `MEMORY_RENDER_AUDIT.md`.

No runtime behavior was changed in this pass.

## Status Table

| Issue ID | File related | Current status | Code evidence | Risk if fixed | Proposed phase |
| --- | --- | --- | --- | --- | --- |
| H1 | `src/stores/chatStore.ts` | already fixed | `MAX_INACTIVE_CONVERSATION_MESSAGES = 120` at `src/stores/chatStore.ts:334`; `trimInactiveConversationMessages()` preserves retriable/pending local rows and trims inactive histories at `src/stores/chatStore.ts:1962`; `selectConversation()` calls `buildInactiveMessageTrimState(state, id)` at `src/stores/chatStore.ts:3660`. | Further trimming may break retry/reconcile UX or force extra history fetches after switching conversations. | No fix now; keep runtime soak only. |
| H2 | `src/features/api/chatApi.ts`, `src/features/chat/domain/messageMerge.ts` | already fixed | `getMessages` is still keyed by conversation via `serializeQueryArgs` at `src/features/api/chatApi.ts:576`, but merge routes through `mergeIncomingMessagesPage()` at `src/features/api/chatApi.ts:578`; `buildConversationMessagesCache()` applies `trimMessagesForBoundedCache()` and returns `boundedMessages` at `src/features/chat/domain/messageMerge.ts:151`; cap is `MAX_MESSAGES_PER_CONVERSATION_CACHE = 600` at `src/features/chat/domain/messageMerge.ts:64`. Test asserts 650 + pending becomes 600 at `src/features/chat/domain/messageMerge.test.ts:205`. | Lowering cap or changing merge semantics can break deep scroll, unread anchors, reply hydration, and optimistic send replacement. | No fix now; only tune cap with production evidence. |
| H3 | `src/components/chat/thread/MessageGroup.tsx`, `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx` | still present | Hot path still renders `SimpleVirtualizedChatTimeline -> MessageGroup` at `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx:526`; inner `MessageGroupItem` is a plain `const MessageGroupItem: React.FC` at `src/components/chat/thread/MessageGroup.tsx:198`; only parent `MessageGroup` is memoized at `src/components/chat/thread/MessageGroup.tsx:1025`. | Wrapping the inner component with `React.memo` may be a no-op or may be defeated by unstable function/array props; a custom comparator can accidentally hide status/reaction/read updates. | PR 2, after production/render probe identifies row rerender churn. |
| H4 | `src/components/message/ImageMessage.tsx`, `src/components/chat/message-layout/MessageBodyRenderer.tsx` | still present | `ImageMessage` is exported as a normal function component at `src/components/message/ImageMessage.tsx:54` and default-exported directly at `src/components/message/ImageMessage.tsx:560`; `MessageBodyRenderer` renders it for single image attachments at `src/components/chat/message-layout/MessageBodyRenderer.tsx:449`. | Memoization must compare attachment URL/status/dimensions and click metadata correctly; a bad comparator can leave stale thumbnails or broken preview opens. | PR 2, same render-only optimization batch as H3. |
| H5 | `src/services/enrichUserProfile.ts`, `src/services/userBatchLoader.ts`, `src/services/userProfileCache.ts`, `src/hooks/useBatchThumbnailUrl.ts` | partially fixed | `enrichUserProfile()` still gets called from hot surfaces, but skips if enriched name exists at `src/services/enrichUserProfile.ts:28`; `loadUserProfile()` uses cache + in-flight dedupe at `src/services/userBatchLoader.ts:225` and `src/services/userBatchLoader.ts:230`; summary cache has `maxEntries: 500` at `src/services/userBatchLoader.ts:47`; user profile cache has `maxEntries: 200` at `src/services/userProfileCache.ts:31`; thumbnail cache has `maxEntries: 1000` at `src/hooks/useBatchThumbnailUrl.ts:74`. | Moving enrichment out of render effects can change when names/avatar fallbacks appear; over-aggressive cache invalidation can increase network load. | PR 3 if profiler shows churn from profile/thumb hooks, otherwise leave. |
| M1 | `src/pages/ChatPage.tsx`, `src/hooks/useBatchThumbnailUrl.ts` | partially fixed | `ImagePreviewModalGallery` still scans cached `data.messages` and collects missing image attachment IDs at `src/pages/ChatPage.tsx:113`; it fetches all missing preview URLs in parallel with `attachmentIds.map(...)` at `src/pages/ChatPage.tsx:180`; abort cleanup exists at `src/pages/ChatPage.tsx:213`. Impact is reduced by H2 cap and shared thumbnail cache elsewhere, but this modal path uses per-attachment `fileApi.getPreviewUrl()`, not `fetchThumbnailUrlsShared()`. | Switching to shared batch fetch changes gallery URL timing and fallback behavior; must preserve current clicked image URL and initial index. | PR 1 if live modal traces show URL fan-out; otherwise PR 3. |
| M2 | `src/lib/blobPreviewCache.ts`, `src/store/index.ts`, `src/hooks/useBatchThumbnailUrl.ts` | already fixed | Blob cache is explicitly bounded and timed: `DEFAULT_TTL_MS = 10 * 60_000`, `MAX_ENTRIES = 32` at `src/lib/blobPreviewCache.ts:5`; all delete paths revoke object URLs via `URL.revokeObjectURL` at `src/lib/blobPreviewCache.ts:17`; `get()` expires stale entries at `src/lib/blobPreviewCache.ts:63`; `clear()` deletes all entries at `src/lib/blobPreviewCache.ts:77`; logout reset clears it at `src/store/index.ts:27`; `markPreviewReady()` deletes/revokes by file id at `src/hooks/useBatchThumbnailUrl.ts:132`. Tests cover expiry and LRU eviction at `src/lib/blobPreviewCache.test.ts:19`. | Further shortening TTL can make optimistic previews disappear before backend thumbnails are ready. | No fix now. |
| M3 | `src/hooks/useBatchThumbnailUrl.ts`, `src/utils/expiringLruCache.ts` | partially fixed | `THUMBNAIL_CACHE` is an `ExpiringLruCache` with `maxEntries: 1000` at `src/hooks/useBatchThumbnailUrl.ts:74`; LRU evicts oldest entries at `src/utils/expiringLruCache.ts:52`; `previewSignalListeners` removes empty sets on unsubscribe at `src/hooks/useBatchThumbnailUrl.ts:105`; `markPreviewReady()` / `markPreviewFailed()` evict cache entries at `src/hooks/useBatchThumbnailUrl.ts:132` and `src/hooks/useBatchThumbnailUrl.ts:144`. There is no hard cap on `previewSignalListeners`, but it is tied to mounted hooks and cleanup. | Adding a hard listener cap can drop legitimate mounted image listeners and delay preview refresh; reducing thumbnail cache can increase signed URL churn. | No immediate fix; add probe counters before changing. |
| M4 | `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx` | partially fixed | `rowIndexByMessageId` is rebuilt with `React.useMemo()` over `threadRows` at `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx:358`, and each message may add id/localId/stableId/clientMessageId aliases. The map is bounded indirectly by RTKQ cap and timeline rows, but it is still O(rows) per `threadRows` change. | Replacing it with incremental refs can break jump-to-message/highlight correctness and scroll anchor behavior. | PR 3 only if trace shows this map as CPU/heap hotspot. |
| M5 | `src/utils/messageDebug.ts`, `src/utils/chatPerformance.ts`, `src/stores/chatStore.ts`, `src/features/chat/hooks/useConversationSession.ts` | partially fixed | Most `logMessageDebug()` calls are disabled unless `VITE_DEBUG_REALTIME=true` or `?debugMessages=1` at `src/utils/messageDebug.ts:15`; however `alwaysOn` still exists at `src/utils/messageDebug.ts:32`, performance logging uses `alwaysOn: true` at `src/utils/chatPerformance.ts:79`, and some history/session logs force `alwaysOn` at `src/stores/chatStore.ts:4273` and `src/features/chat/hooks/useConversationSession.ts:393`. | Removing logs can reduce observability for flaky realtime/history bugs; changing `alwaysOn` should be gated by env and verified against support workflows. | PR 1, low-risk logging gate cleanup if production console/log volume is confirmed noisy. |
| M6 | `src/hooks/useWebSocket.ts` | partially fixed | `pollTailFetchTimers` is a module-level `Map` at `src/hooks/useWebSocket.ts:254`; each conversation key is debounced by clearing the existing timer at `src/hooks/useWebSocket.ts:258`, and the timer deletes its key before fetching at `src/hooks/useWebSocket.ts:263`. I did not find a global unmount/logout cleanup for this specific map. | Low memory risk because entries self-delete after 400ms; adding global cleanup must not cancel a legitimate poll-tail reconciliation while socket is still active. | PR 1 if touching cleanup/logging; otherwise leave. |
| Extra: TipTap duplicate link | `src/components/input/TipTapEditor.tsx` | already fixed | `StarterKit.configure({ link: false })` at `src/components/input/TipTapEditor.tsx:76`, then one explicit `Link.configure(...)` at `src/components/input/TipTapEditor.tsx:90`. `MEMORY_RENDER_AUDIT.md` also records no duplicate Link warning after rebuild. | Reverting can reintroduce noisy editor warnings and duplicate extension behavior. | No fix now. |
| Extra: `animate-pulse-online` in list/sidebar | `src/components/common/Avatar.tsx`, `src/components/chat/ChatHeader.tsx`, `src/components/layout/sidebar/RoomItem.tsx`, `tailwind.config.js` | already fixed | `Avatar` defaults `presenceAnimation = "none"` at `src/components/common/Avatar.tsx:87`; animation only applies when explicitly active/recent-online at `src/components/common/Avatar.tsx:124`; sidebar `RoomItem` passes `showStatus` but no `presenceAnimation` at `src/components/layout/sidebar/RoomItem.tsx:272`; only chat header opts into `presenceAnimation="recent-online"` at `src/components/chat/ChatHeader.tsx:172`; keyframes now use opacity/transform at `tailwind.config.js:270`. | Re-enabling animation in lists/sidebar can reintroduce paint-heavy idle work. | No fix now. |

## Items That Still Need Real Fix

1. M1: `ImagePreviewModalGallery` still fan-outs per-attachment preview URL requests when opening the image lightbox. It is bounded by the message cap, but it should probably reuse `fetchThumbnailUrlsShared()` or a chunked/batched fetch path.
2. H3/H4: `MessageGroupItem` and `ImageMessage` are not memoized on the current hot render path. Fix only with profiler/render-count evidence so comparators do not mask legitimate message state updates.
3. M5: `alwaysOn` debug/performance logs remain in a few chat history/session paths. Gate them if production logs are noisy.
4. M6: `pollTailFetchTimers` self-cleans after 400ms but has no explicit global cleanup. Low-risk cleanup candidate.
5. M4/H5: `rowIndexByMessageId` and profile/thumb enrichment are bounded/deduped, but still possible CPU churn candidates under real production datasets.

## Items That Do Not Need Fix Now

1. H1 legacy `chatStore` inactive conversation message retention is already trimmed.
2. H2 RTK Query `getMessages` cache is capped at 600 per conversation.
3. M2 `blobPreviewCache` has max entries, TTL, revoke-on-delete, and logout clearing.
4. M3 `THUMBNAIL_CACHE` has LRU/TTL and listener unsubscribe cleanup; no current proof that its size is the leak.
5. TipTap duplicate Link extension is already removed.
6. `animate-pulse-online` is no longer used by sidebar/list avatars by default.

## Proposed PR Order

1. **PR 1: Low-risk cleanup and instrumentation**
   - Gate remaining `alwaysOn` chat logs behind debug/dev or a dedicated env flag.
   - Add explicit cleanup for `pollTailFetchTimers` if it can be done without canceling active reconciliation.
   - Add probe counters for modal preview URL fan-out, thumbnail cache size, preview listener count, and row-index map size.

2. **PR 2: Render memoization with targeted tests**
   - Memoize `ImageMessage` with a narrow comparator over attachment id/status/url/dimensions plus click metadata.
   - Consider memoizing `MessageGroupItem` only after checking prop stability; prefer fixing unstable callbacks/objects first if comparator would be brittle.
   - Verify with render-count tests or a local trace, not only typecheck/build.

3. **PR 3: Media/profile churn reduction**
   - Move `ImagePreviewModalGallery` to shared batch thumbnail URL fetching or chunked fetch.
   - Only tune `rowIndexByMessageId`, `enrichUserProfile`, and thumbnail cache sizes if PR 1 counters show real pressure.

## Verification Required For This Audit

- `npm run typecheck`
- `npm run build`
