import React from "react";
import {
  areTimelineItemsEqual,
  buildTimelineItems,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../utils/timelinePlanner";
import type { Conversation, Message } from "../types";

export type {
  ClusterBreakReason,
  MessageTimelineItem,
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

export const useMessageGrouping = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs = DEFAULT_GROUPING_THRESHOLD_MS,
  unreadMarker,
}: UseMessageGroupingParams): TimelineItem[] => {
  const prevKeyMapRef = React.useRef<Map<string, TimelineItem>>(new Map());

  return React.useMemo(() => {
    const items = buildTimelineItems({
      messages,
      currentUserId,
      conversationType,
      groupingThresholdMs,
      unreadMarker,
    });

    const prevKeyMap = prevKeyMapRef.current;
    const nextKeyMap = new Map<string, TimelineItem>();

    for (let i = 0; i < items.length; i += 1) {
      const newItem = items[i];
      const prevItem = prevKeyMap.get(newItem.key);
      if (prevItem && areTimelineItemsEqual(prevItem, newItem)) {
        items[i] = prevItem;
      }
      nextKeyMap.set(items[i].key, items[i]);
    }

    prevKeyMapRef.current = nextKeyMap;
    return items;
  }, [
    conversationType,
    currentUserId,
    groupingThresholdMs,
    messages,
    unreadMarker,
  ]);
};

export default useMessageGrouping;
