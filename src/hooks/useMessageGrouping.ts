import React from "react";
import type { Conversation, Message } from "../types";
import { isSameDay } from "../utils/formatTime";
import {
  getMessageSemanticFamily,
  getMessageStableKey,
  hasMessageLayoutDecorator,
  isFailedMessage,
  isPendingMessage,
  type MessageSemanticFamily,
} from "../utils/messageTimeline";

const DEFAULT_GROUPING_THRESHOLD_MS = 90 * 1000;

export type ClusterBreakReason =
  | "sender"
  | "date"
  | "time_gap"
  | "semantic_family"
  | "decorator"
  | "status"
  | "edited"
  | "system"
  | "timeline_decorator";

export interface UnreadTimelineMarker {
  lastReadMessageId?: string;
  lastReadAt?: Date | string;
  active?: boolean;
}

const getTimelineMessageKey = (message: Message): string =>
  getMessageStableKey(message);

export type MessageTimelineItem = {
  kind: "message";
  key: string;
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
  isGroupStart: boolean;
  isGroupEnd: boolean;
  conversationType: Conversation["type"];
  semanticFamily: MessageSemanticFamily;
  clusterBreakBefore?: ClusterBreakReason;
  clusterBreakAfter?: ClusterBreakReason;
};

export type TimelineItem =
  | { kind: "date"; key: string; date: Date }
  | { kind: "system"; key: string; message: Message }
  | { kind: "unread"; key: string }
  | MessageTimelineItem;

interface UseMessageGroupingParams {
  messages: Message[];
  currentUserId: string;
  conversationType: Conversation["type"];
  groupingThresholdMs?: number;
  unreadMarker?: UnreadTimelineMarker | null;
}

const isGroupConversation = (conversationType: Conversation["type"]): boolean =>
  conversationType !== "private" && conversationType !== "direct";

const resolveClusterBreakReason = (
  previousMessage: Message | undefined,
  nextMessage: Message | undefined,
  groupingThresholdMs: number,
): ClusterBreakReason | null => {
  if (!previousMessage || !nextMessage) return "timeline_decorator";
  if (previousMessage.type === "system" || nextMessage.type === "system") {
    return "system";
  }
  if (previousMessage.senderId !== nextMessage.senderId) {
    return "sender";
  }

  const previousTime = new Date(previousMessage.createdAt);
  const nextTime = new Date(nextMessage.createdAt);
  if (!isSameDay(previousTime, nextTime)) {
    return "date";
  }

  const diff = Math.abs(nextTime.getTime() - previousTime.getTime());
  if (diff > groupingThresholdMs) {
    return "time_gap";
  }

  const previousFamily = getMessageSemanticFamily(previousMessage);
  const nextFamily = getMessageSemanticFamily(nextMessage);
  if (previousFamily !== nextFamily) {
    return "semantic_family";
  }

  if (
    hasMessageLayoutDecorator(previousMessage) ||
    hasMessageLayoutDecorator(nextMessage)
  ) {
    return "decorator";
  }

  if (
    isFailedMessage(previousMessage) ||
    isFailedMessage(nextMessage) ||
    isPendingMessage(previousMessage) !== isPendingMessage(nextMessage)
  ) {
    return "status";
  }

  if (previousMessage.isEdited || nextMessage.isEdited) {
    return "edited";
  }

  return null;
};

const shouldInsertUnreadDivider = (
  message: Message,
  previousMessage: Message | undefined,
  unreadMarker?: UnreadTimelineMarker | null,
): boolean => {
  if (!unreadMarker?.active) return false;

  if (unreadMarker.lastReadMessageId) {
    return previousMessage?.id === unreadMarker.lastReadMessageId;
  }

  if (!unreadMarker.lastReadAt) return false;
  const lastReadTime = new Date(unreadMarker.lastReadAt).getTime();
  const previousTime = previousMessage
    ? new Date(previousMessage.createdAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const currentTime = new Date(message.createdAt).getTime();

  return previousTime <= lastReadTime && currentTime > lastReadTime;
};

const areTimelineItemsEqual = (a: TimelineItem, b: TimelineItem): boolean => {
  if (a === b) return true;
  if (a.kind !== b.kind || a.key !== b.key) return false;

  if (a.kind === "date" && b.kind === "date") {
    return a.date.getTime() === b.date.getTime();
  }

  if (a.kind === "unread" && b.kind === "unread") {
    return true;
  }

  if (a.kind === "system" && b.kind === "system") {
    return a.message === b.message;
  }

  if (a.kind === "message" && b.kind === "message") {
    return (
      a.message === b.message &&
      a.isOwn === b.isOwn &&
      a.showAvatar === b.showAvatar &&
      a.showSenderName === b.showSenderName &&
      a.isGroupStart === b.isGroupStart &&
      a.isGroupEnd === b.isGroupEnd &&
      a.conversationType === b.conversationType &&
      a.semanticFamily === b.semanticFamily &&
      a.clusterBreakBefore === b.clusterBreakBefore &&
      a.clusterBreakAfter === b.clusterBreakAfter
    );
  }

  return false;
};

export const useMessageGrouping = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs = DEFAULT_GROUPING_THRESHOLD_MS,
  unreadMarker,
}: UseMessageGroupingParams): TimelineItem[] => {
  const prevKeyMapRef = React.useRef<Map<string, TimelineItem>>(new Map());

  return React.useMemo(() => {
    const items: TimelineItem[] = [];
    const isGroupChat = isGroupConversation(conversationType);

    messages.forEach((message, index) => {
      if (!message) return;

      const previousMessage = messages[index - 1];
      const nextMessage = messages[index + 1];
      const beforeBreak = resolveClusterBreakReason(
        previousMessage,
        message,
        groupingThresholdMs,
      );
      const afterBreak = resolveClusterBreakReason(
        message,
        nextMessage,
        groupingThresholdMs,
      );
      const shouldInsertDateDivider =
        index === 0 ||
        !previousMessage ||
        !isSameDay(
          new Date(message.createdAt),
          new Date(previousMessage.createdAt),
        );

      if (shouldInsertDateDivider) {
        items.push({
          kind: "date",
          key: `date-${getTimelineMessageKey(message)}`,
          date: new Date(message.createdAt),
        });
      }

      if (shouldInsertUnreadDivider(message, previousMessage, unreadMarker)) {
        items.push({
          kind: "unread",
          key: `unread-${getTimelineMessageKey(message)}`,
        });
      }

      if (message.type === "system") {
        items.push({
          kind: "system",
          key: `system-${getTimelineMessageKey(message)}`,
          message,
        });
        return;
      }

      const isOwn = message.senderId === currentUserId;
      const isGroupStart = beforeBreak !== null;
      const isGroupEnd = afterBreak !== null;

      items.push({
        kind: "message",
        key: `message-${getTimelineMessageKey(message)}`,
        message,
        isOwn,
        showAvatar: isGroupChat && !isOwn && isGroupEnd,
        showSenderName: isGroupChat && !isOwn && isGroupStart,
        isGroupStart,
        isGroupEnd,
        conversationType,
        semanticFamily: getMessageSemanticFamily(message),
        clusterBreakBefore: beforeBreak ?? undefined,
        clusterBreakAfter: afterBreak ?? undefined,
      });
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
