/* eslint-disable react-hooks/refs -- Immutable derived-row cache preserves item identity without scheduling a second render. */
import React from "react";
import {
  areTimelineItemsEqual,
  buildTimelineItems,
  messagesHaveSameGroupingInputs,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../utils/timelinePlanner";
import { getMessageStableKey } from "../utils/messageTimeline";
import type { Conversation, Message } from "../types";
import {
  getChatPerformanceDuration,
  getChatPerformanceTimestamp,
  recordChatPerformanceMeasure,
} from "../utils/chatPerformance";

export type {
  ClusterBreakReason,
  MessageTimelineItem,
  TimelineMergeLevel,
  TimelineSpacingToken,
  TimelineItem,
  UnreadTimelineMarker,
} from "../utils/timelinePlanner";

const DEFAULT_GROUPING_THRESHOLD_MS = 45 * 1000;

interface UseMessageGroupingParams {
  messages: Message[];
  currentUserId: string;
  conversationType: Conversation["type"];
  groupingThresholdMs?: number;
  unreadMarker?: UnreadTimelineMarker | null;
}

interface GroupingSnapshot {
  messages: Message[];
  items: TimelineItem[];
  currentUserId: string;
  conversationType: Conversation["type"];
  groupingThresholdMs: number;
  unreadMarker?: UnreadTimelineMarker | null;
}

interface GroupingCache {
  keyMap: Map<string, TimelineItem>;
  snapshot: GroupingSnapshot | null;
}

export const isAppendOnlyUpdate = (
  prev: Message[],
  next: Message[],
): boolean => {
  if (next.length <= prev.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) {
      return false;
    }
  }

  return true;
};

/**
 * In-place metadata fast path.
 *
 * When the message list keeps the same length, order and identity, and every
 * changed message preserves its grouping inputs (read/delivered/reaction/etc.),
 * the timeline STRUCTURE is unchanged — only the message payload inside some
 * rows differs. We reuse the previous items array and swap just the changed
 * message objects, instead of re-running the full O(n) grouping pass.
 *
 * Returns:
 *  - `null`  → not eligible; caller must fall back to a full/append rebuild.
 *  - prevItems (same reference) → eligible and nothing changed (lets the
 *    downstream derive hooks hit their own cache).
 *  - a new array → eligible; unchanged rows keep identity, changed rows are
 *    fresh objects carrying the new message.
 */
export const tryBuildInPlaceMetadataItems = (
  prevMessages: Message[],
  prevItems: TimelineItem[],
  nextMessages: Message[],
): TimelineItem[] | null => {
  if (prevMessages.length !== nextMessages.length) {
    return null;
  }

  const swapByKey = new Map<string, Message>();
  for (let i = 0; i < prevMessages.length; i += 1) {
    const previous = prevMessages[i];
    const next = nextMessages[i];
    if (previous === next) {
      continue;
    }
    // Different object at the same position. It must be the same logical
    // message (no insert/delete/reorder) AND must not change grouping output.
    if (getMessageStableKey(previous) !== getMessageStableKey(next)) {
      return null;
    }
    if (!messagesHaveSameGroupingInputs(previous, next)) {
      return null;
    }
    swapByKey.set(getMessageStableKey(next), next);
  }

  if (swapByKey.size === 0) {
    // New array reference but every element is identical — reuse prev items so
    // downstream consumers can short-circuit on reference equality.
    return prevItems;
  }

  return prevItems.map((item) => {
    if (item.kind === "message" || item.kind === "system") {
      const replacement = swapByKey.get(getMessageStableKey(item.message));
      if (replacement && replacement !== item.message) {
        return { ...item, message: replacement };
      }
    }
    return item;
  });
};

const buildKeyMap = (items: TimelineItem[]): Map<string, TimelineItem> => {
  const keyMap = new Map<string, TimelineItem>();
  for (const item of items) {
    keyMap.set(item.key, item);
  }
  return keyMap;
};

const findTimelineItemEndIndexForMessage = (
  items: TimelineItem[],
  message: Message,
): number => {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (
      (item.kind === "message" || item.kind === "system") &&
      item.message === message
    ) {
      return i + 1;
    }
  }

  return 0;
};

/**
 * Đảm bảo timeline có tối đa 1 unread divider, giữ vạch đầu tiên (ranh giới
 * read→unread đúng) và bỏ các vạch trùng. Cần thiết vì nhánh incremental-append
 * dựng lại slice đuôi (message đầu slice có previousMessage=undefined) khiến
 * fallback theo lastReadAt chèn thêm divider, ghép với vạch sẵn có trong prefix.
 * Trả về chính mảng cũ khi không có trùng để giữ identity (không phá memo).
 */
const dedupeUnreadDividers = (items: TimelineItem[]): TimelineItem[] => {
  let seenUnread = false;
  let hasDuplicate = false;
  for (const item of items) {
    if (item.kind === "unread") {
      if (seenUnread) {
        hasDuplicate = true;
        break;
      }
      seenUnread = true;
    }
  }
  if (!hasDuplicate) return items;

  let kept = false;
  return items.filter((item) => {
    if (item.kind !== "unread") return true;
    if (kept) return false;
    kept = true;
    return true;
  });
};

export const useMessageGrouping = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs = DEFAULT_GROUPING_THRESHOLD_MS,
  unreadMarker,
}: UseMessageGroupingParams): TimelineItem[] => {
  const cacheRef = React.useRef<GroupingCache>({
    keyMap: new Map(),
    snapshot: null,
  });

  const computed = React.useMemo(() => {
    const startedAt = getChatPerformanceTimestamp();
    const cache = cacheRef.current;
    const prevSnapshot = cache.snapshot;
    const hasCurrentSnapshot = Boolean(
      prevSnapshot &&
        prevSnapshot.messages === messages &&
        prevSnapshot.currentUserId === currentUserId &&
        prevSnapshot.conversationType === conversationType &&
        prevSnapshot.groupingThresholdMs === groupingThresholdMs &&
        prevSnapshot.unreadMarker === unreadMarker,
    );
    if (hasCurrentSnapshot && prevSnapshot) {
      const result = {
        items: prevSnapshot.items,
      };
      recordChatPerformanceMeasure(
        "message-grouping-derive",
        getChatPerformanceDuration(startedAt),
        {
          messageCount: messages.length,
          itemCount: result.items.length,
          cacheHit: true,
          incrementalAppend: false,
        },
      );
      return result;
    }

    const paramsUnchanged = Boolean(
      prevSnapshot &&
        prevSnapshot.currentUserId === currentUserId &&
        prevSnapshot.conversationType === conversationType &&
        prevSnapshot.groupingThresholdMs === groupingThresholdMs &&
        prevSnapshot.unreadMarker === unreadMarker,
    );

    // In-place metadata update (read/delivered/reaction/edit-without-relayout):
    // same length/order/identity, grouping inputs preserved → reuse structure.
    if (paramsUnchanged && prevSnapshot) {
      const inPlaceItems = tryBuildInPlaceMetadataItems(
        prevSnapshot.messages,
        prevSnapshot.items,
        messages,
      );
      if (inPlaceItems) {
        const reusedPrevItems = inPlaceItems === prevSnapshot.items;
        cacheRef.current = {
          keyMap: reusedPrevItems ? cache.keyMap : buildKeyMap(inPlaceItems),
          snapshot: {
            messages,
            items: inPlaceItems,
            currentUserId,
            conversationType,
            groupingThresholdMs,
            unreadMarker,
          },
        };
        recordChatPerformanceMeasure(
          "message-grouping-derive",
          getChatPerformanceDuration(startedAt),
          {
            messageCount: messages.length,
            itemCount: inPlaceItems.length,
            cacheHit: false,
            incrementalAppend: false,
            inPlaceMetadata: true,
            inPlaceNoChange: reusedPrevItems,
          },
        );
        return { items: inPlaceItems };
      }
    }

    const canIncrementallyAppend = Boolean(
      paramsUnchanged &&
        prevSnapshot &&
        isAppendOnlyUpdate(prevSnapshot.messages, messages),
    );

    let reconciliationStartIndex = 0;
    const rawItems = canIncrementallyAppend
      ? (() => {
          const prevMessages = prevSnapshot!.messages;
          const prevItems = prevSnapshot!.items;
          const recomputeFromIndex = Math.max(0, prevMessages.length - 1);
          const contextIndex = recomputeFromIndex - 1;
          const planningStartIndex = Math.max(0, contextIndex);
          const preservedPrefix =
            contextIndex >= 0
              ? prevItems.slice(
                  0,
                  findTimelineItemEndIndexForMessage(
                    prevItems,
                    prevMessages[contextIndex],
                  ),
                )
              : [];
          reconciliationStartIndex = preservedPrefix.length;
          const rebuiltTail = buildTimelineItems({
            messages: messages.slice(planningStartIndex),
            currentUserId,
            conversationType,
            groupingThresholdMs,
            unreadMarker,
          });
          const rebuiltTailStart =
            contextIndex >= 0
              ? findTimelineItemEndIndexForMessage(
                  rebuiltTail,
                  messages[contextIndex],
                )
              : 0;

          return preservedPrefix.concat(rebuiltTail.slice(rebuiltTailStart));
        })()
      : buildTimelineItems({
          messages,
          currentUserId,
          conversationType,
          groupingThresholdMs,
          unreadMarker,
        });

    const items = dedupeUnreadDividers(rawItems);

    const prevKeyMap = cache.keyMap;
    const nextKeyMap = canIncrementallyAppend
      ? prevKeyMap
      : new Map<string, TimelineItem>();

    for (let i = reconciliationStartIndex; i < items.length; i += 1) {
      const newItem = items[i];
      const prevItem = prevKeyMap.get(newItem.key);
      if (prevItem && areTimelineItemsEqual(prevItem, newItem)) {
        items[i] = prevItem;
      }
      nextKeyMap.set(items[i].key, items[i]);
    }

    const nextCache = {
      keyMap: nextKeyMap,
      snapshot: {
        messages,
        items,
        currentUserId,
        conversationType,
        groupingThresholdMs,
        unreadMarker,
      },
    };
    cacheRef.current = nextCache;

    recordChatPerformanceMeasure(
      "message-grouping-derive",
      getChatPerformanceDuration(startedAt),
      {
        messageCount: messages.length,
        itemCount: items.length,
        cacheHit: false,
        incrementalAppend: canIncrementallyAppend,
      },
    );

    return {
      items,
    };
  }, [
    conversationType,
    currentUserId,
    groupingThresholdMs,
    messages,
    unreadMarker,
  ]);

  return computed.items;
};

export default useMessageGrouping;
