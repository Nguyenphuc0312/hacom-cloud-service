/* eslint-disable react-hooks/refs -- Immutable derived-row cache preserves item identity without scheduling a second render. */
import React from "react";
import {
  areTimelineItemsEqual,
  buildTimelineItems,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../utils/timelinePlanner";
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

    const canIncrementallyAppend = Boolean(
      prevSnapshot &&
        prevSnapshot.currentUserId === currentUserId &&
        prevSnapshot.conversationType === conversationType &&
        prevSnapshot.groupingThresholdMs === groupingThresholdMs &&
        prevSnapshot.unreadMarker === unreadMarker &&
        isAppendOnlyUpdate(prevSnapshot.messages, messages),
    );

    let reconciliationStartIndex = 0;
    const items = canIncrementallyAppend
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
