# MEMORY_MEDIA_PHASE4

## Scope

Phase 4 targeted media/lightbox, thumbnail listener bounds, timeline jump index churn, and message debug churn. This change does not alter backend contracts or message truth.

## Files changed in this phase

- `src/pages/ChatPage.tsx`
- `src/components/modals/ImagePreviewModal.tsx`
- `src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx`
- `src/hooks/useBatchThumbnailUrl.ts`
- `src/hooks/useBatchThumbnailUrl.previewSignal.test.ts`

Note: the working tree also contains earlier Phase 2/3 files from the same performance hardening run.

## Lightbox/gallery behavior

Before:

- `ImagePreviewModalGallery` built a full image gallery from `data.messages`.
- It collected every missing image attachment id and fetched preview URLs for all of them through `Promise.allSettled`.
- A conversation with many images could mint preview URLs for the whole gallery on open.
- `previewUrls` was only component-local but not explicitly capped while the modal stayed open.

After:

- The gallery metadata is still built from the RTK message cache so next/prev and thumbnail grouping keep working.
- The clicked/current image uses the already-resolved URL immediately.
- Preview URL minting is lazy:
  - current index plus `LIGHTBOX_PRELOAD_RADIUS = 4` on each side;
  - at most 9 ids considered per navigation position;
  - at most `LIGHTBOX_PREVIEW_CONCURRENCY = 2` concurrent `fileApi.getPreviewUrl` calls.
- `previewUrls` is bounded by `LIGHTBOX_PREVIEW_URL_CAP = 64`.
- `previewUrls` and in-flight tracking are cleared when the modal switches conversation/source image.
- `ImagePreviewModal` now emits `onIndexChange` so the wrapper can preload around the actual next/prev position.

Expected request count:

- Before: opening a gallery with N uncached images could trigger up to N preview URL requests.
- After: opening triggers at most 9 requested ids, with concurrency 2; navigating 30 images requests only the windows crossed, not the whole gallery upfront.

## Thumbnail cache/listeners

Already fixed/kept:

- `THUMBNAIL_CACHE` is an `ExpiringLruCache`.
- Cache hit short-circuits fetch in `readCachedUrls`.
- `previewSignalListeners` deletes a fileId key when the Set becomes empty during unsubscribe.
- Hook unmount calls unsubscribe through the existing effect cleanup.

Changed in this run:

- `MAX_THUMBNAIL_CACHE_ENTRIES = 500` instead of the previous 1000.
- `MAX_PREVIEW_SIGNAL_KEYS = 500`.
- Empty listener Sets are pruned before adding a new key.
- If the listener key cap is reached, the hook logs a warning and relies on polling/TTL fallback instead of retaining unbounded listener keys.
- Test utility coverage now asserts the cache/listener caps.

## Timeline row index

Before:

- `SimpleVirtualizedChatTimeline` rebuilt `rowIndexByMessageId` on every `threadRows` change.
- The map included multiple alias keys per message and was paid even when there was no jump-to-message request.

After:

- The alias row index is built lazily only when `pendingJumpRef` has a message id to resolve.
- The lazy cache is invalidated by `threadRows` reference changes.
- Alias keys are deduped per message before insertion.
- `jumpToMessage`, highlight, and `scrollToIndex` flow are unchanged.

Risk:

- If a pending jump targets a message that is still not loaded, the retry effect still runs when `threadRows` changes.
- The lazy map still includes id/localId/stableId/clientMessageId aliases to preserve optimistic/server reconciliation jumps.

## Debug log churn

Before:

- Timeline virtual-list debug effect depended on the `messages` array reference and constructed details even when debug logging was disabled.

After:

- The effect gates with `isMessageDebugEnabled()` before creating the details object.
- Dependencies use `messages.length` and `latestMessageId` instead of the full array reference.
- Production keeps debug disabled unless `VITE_DEBUG_REALTIME=true` or `?debugMessages=1`.

## Verification

Passed:

- `npm run typecheck`
- `npm run build`
- `node .\node_modules\vitest\vitest.mjs run src\hooks\useBatchThumbnailUrl.previewSignal.test.ts src\features\chat\simple-virtual-timeline\simpleMessageChange.test.ts src\features\chat\simple-virtual-timeline\useSimpleChatScroll.test.tsx`

Build warnings:

- Existing Rollup warnings remain for `EmptyState` re-export chunk cycles, `apiContract` mixed static/dynamic import, `MaintenancePage` mixed static/dynamic import, and large chunks.

Not run:

- Browser/manual script for opening a real large-image conversation, next/prev 30 images, close modal, switch conversation, and jump-to-message. No authenticated browser fixture or seeded large media conversation was available in this turn.

## Regression notes

- Lightbox now may show thumbnail/current fallback briefly for non-neighbor images until the lazy preview URL is fetched after navigation.
- Preview URL request failure is swallowed per image so next/prev remains usable with fallback URL.
- Listener cap fallback means a very large number of simultaneously mounted unique thumbnail listeners may wait for TTL polling rather than immediate WS preview signal.
