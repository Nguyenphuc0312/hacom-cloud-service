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

export const useMessageGrouping = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs = DEFAULT_GROUPING_THRESHOLD_MS,
}: UseMessageGroupingParams): TimelineItem[] =>
  React.useMemo(() => {
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

    return items;
  }, [messages, currentUserId, conversationType, groupingThresholdMs]);

export default useMessageGrouping;
