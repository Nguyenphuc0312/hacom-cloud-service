import React from "react";
import type { Conversation, Message } from "../types";
import { isSameDay } from "../utils/formatTime";

const DEFAULT_GROUPING_THRESHOLD_MS = 5 * 60 * 1000;

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
}

const isGroupConversation = (conversationType: Conversation["type"]): boolean =>
  conversationType !== "private" && conversationType !== "direct";

const canGroupMessages = (
  previousMessage: Message | undefined,
  nextMessage: Message | undefined,
  groupingThresholdMs: number,
): boolean => {
  if (!previousMessage || !nextMessage) return false;
  if (previousMessage.type === "system" || nextMessage.type === "system")
    return false;
  if (previousMessage.senderId !== nextMessage.senderId) return false;

  const previousTime = new Date(previousMessage.createdAt);
  const nextTime = new Date(nextMessage.createdAt);
  const diff = Math.abs(nextTime.getTime() - previousTime.getTime());

  if (!isSameDay(previousTime, nextTime)) return false;

  return diff <= groupingThresholdMs;
};

/**
 * Structural-sharing equality check for TimelineItem.
 * If the previous item is content-equal to the new one, we reuse the
 * previous reference so downstream React.memo comparisons can bail out.
 */
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
      a.conversationType === b.conversationType
    );
  }

  return false;
};

export const useMessageGrouping = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs = DEFAULT_GROUPING_THRESHOLD_MS,
}: UseMessageGroupingParams): TimelineItem[] => {
  const prevItemsRef = React.useRef<TimelineItem[]>([]);
  const prevKeyMapRef = React.useRef<Map<string, TimelineItem>>(new Map());

  return React.useMemo(() => {
    const items: TimelineItem[] = [];
    const isGroupChat = isGroupConversation(conversationType);

    messages.forEach((message, index) => {
      if (!message) return;

      const previousMessage = messages[index - 1];
      const nextMessage = messages[index + 1];
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
          key: `date-${message.id}`,
          date: new Date(message.createdAt),
        });
      }

      if (message.type === "system") {
        items.push({
          kind: "system",
          key: `system-${message.id}`,
          message,
        });
        return;
      }

      const groupedWithPrevious = canGroupMessages(
        previousMessage,
        message,
        groupingThresholdMs,
      );
      const groupedWithNext = canGroupMessages(
        message,
        nextMessage,
        groupingThresholdMs,
      );
      const isOwn = message.senderId === currentUserId;
      const isGroupStart = !groupedWithPrevious;
      const isGroupEnd = !groupedWithNext;

      items.push({
        kind: "message",
        key: `message-${message.id}`,
        message,
        isOwn,
        showAvatar: isGroupChat && !isOwn && isGroupEnd,
        showSenderName: isGroupChat && !isOwn && isGroupStart,
        isGroupStart,
        isGroupEnd,
        conversationType,
      });
    });

    // Structural sharing: reuse previous TimelineItem references when content
    // is unchanged. This prevents downstream React.memo components from
    // re-rendering for items that haven't actually changed (critical for 10k+
    // message lists where only the tail or a single item typically changes).
    const prevKeyMap = prevKeyMapRef.current;
    const nextKeyMap = new Map<string, TimelineItem>();

    for (let i = 0; i < items.length; i++) {
      const newItem = items[i];
      const prevItem = prevKeyMap.get(newItem.key);
      if (prevItem && areTimelineItemsEqual(prevItem, newItem)) {
        items[i] = prevItem; // reuse the stable reference
      }
      nextKeyMap.set(items[i].key, items[i]);
    }

    prevItemsRef.current = items;
    prevKeyMapRef.current = nextKeyMap;

    return items;
  }, [messages, currentUserId, conversationType, groupingThresholdMs]);
};

export default useMessageGrouping;
