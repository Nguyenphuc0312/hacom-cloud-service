import type { Conversation, Message } from "../types";
import { isSameDay } from "./formatTime";
import {
  getMessageSemanticFamily,
  getMessageStableKey,
  hasMessageLayoutDecorator,
  isFailedMessage,
  isPendingMessage,
  type MessageSemanticFamily,
} from "./messageTimeline";

const DEFAULT_MAJOR_PAUSE_MS = 8 * 60 * 1000;

export type ClusterBreakReason =
  | "sender"
  | "date"
  | "time_gap"
  | "semantic_family"
  | "decorator"
  | "status"
  | "edited"
  | "system"
  | "reply_context"
  | "visual_pause"
  | "timeline_decorator";

export interface UnreadTimelineMarker {
  lastReadMessageId?: string;
  lastReadAt?: Date | string;
  active?: boolean;
}

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

interface TimelinePlannerParams {
  messages: Message[];
  currentUserId: string;
  conversationType: Conversation["type"];
  groupingThresholdMs: number;
  unreadMarker?: UnreadTimelineMarker | null;
}

interface ClusterBreakAssessment {
  shouldBreak: boolean;
  primaryReason: ClusterBreakReason | null;
  score: number;
}

const getTimelineMessageKey = (message: Message): string =>
  getMessageStableKey(message);

const isGroupConversation = (conversationType: Conversation["type"]): boolean =>
  conversationType !== "private" && conversationType !== "direct";

const getTransportBucket = (
  message: Message,
): "pending" | "failed" | "settled" => {
  if (isFailedMessage(message)) return "failed";
  if (isPendingMessage(message)) return "pending";
  return "settled";
};

const getReplyContextKey = (message: Message): string =>
  message.replyToMessage?.id || message.replyTo || "";

const getContentWeight = (message: Message): number => {
  const contentLength = message.content?.trim().length ?? 0;
  const attachmentCount = message.attachments?.length ?? 0;
  return contentLength + attachmentCount * 48;
};

const getPauseScore = (
  diffMs: number,
  groupingThresholdMs: number,
): number => {
  if (diffMs <= groupingThresholdMs) return 0;
  if (diffMs >= DEFAULT_MAJOR_PAUSE_MS) return 100;
  if (diffMs >= groupingThresholdMs * 6) return 40;
  if (diffMs >= groupingThresholdMs * 2) return 22;
  return 12;
};

const getVisualRhythmScore = (previousMessage: Message, nextMessage: Message): number => {
  const weightDelta = Math.abs(
    getContentWeight(previousMessage) - getContentWeight(nextMessage),
  );
  if (weightDelta >= 180) return 22;
  if (weightDelta >= 96) return 12;
  return 0;
};

const hardBreak = (
  primaryReason: ClusterBreakReason,
): ClusterBreakAssessment => ({
  shouldBreak: true,
  primaryReason,
  score: 100,
});

export const resolveClusterBreak = (
  previousMessage: Message | undefined,
  nextMessage: Message | undefined,
  groupingThresholdMs: number,
): ClusterBreakAssessment => {
  if (!previousMessage || !nextMessage) {
    return hardBreak("timeline_decorator");
  }
  if (previousMessage.type === "system" || nextMessage.type === "system") {
    return hardBreak("system");
  }
  if (previousMessage.senderId !== nextMessage.senderId) {
    return hardBreak("sender");
  }

  const previousTime = new Date(previousMessage.createdAt);
  const nextTime = new Date(nextMessage.createdAt);
  if (!isSameDay(previousTime, nextTime)) {
    return hardBreak("date");
  }

  const diffMs = Math.abs(nextTime.getTime() - previousTime.getTime());
  if (diffMs >= DEFAULT_MAJOR_PAUSE_MS) {
    return hardBreak("time_gap");
  }

  let score = 0;
  let primaryReason: ClusterBreakReason | null = null;

  const previousFamily = getMessageSemanticFamily(previousMessage);
  const nextFamily = getMessageSemanticFamily(nextMessage);
  if (previousFamily !== nextFamily) {
    score += 32;
    primaryReason = "semantic_family";
  }

  const previousTransport = getTransportBucket(previousMessage);
  const nextTransport = getTransportBucket(nextMessage);
  if (previousTransport !== nextTransport) {
    score += 30;
    if (!primaryReason) primaryReason = "status";
  }

  if (
    getReplyContextKey(previousMessage) !== getReplyContextKey(nextMessage)
  ) {
    score += 24;
    if (!primaryReason) primaryReason = "reply_context";
  }

  if (
    hasMessageLayoutDecorator(previousMessage) ||
    hasMessageLayoutDecorator(nextMessage)
  ) {
    score += 16;
    if (!primaryReason) primaryReason = "decorator";
  }

  if (previousMessage.isEdited || nextMessage.isEdited) {
    score += 14;
    if (!primaryReason) primaryReason = "edited";
  }

  const pauseScore = getPauseScore(diffMs, groupingThresholdMs);
  if (pauseScore > 0) {
    score += pauseScore;
    if (!primaryReason) primaryReason = "time_gap";
  }

  const rhythmScore = getVisualRhythmScore(previousMessage, nextMessage);
  if (rhythmScore > 0) {
    score += rhythmScore;
    if (!primaryReason) primaryReason = "visual_pause";
  }

  return {
    shouldBreak: score >= 50,
    primaryReason,
    score,
  };
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

const buildBoundaryDecorators = (
  message: Message,
  previousMessage: Message | undefined,
  unreadMarker?: UnreadTimelineMarker | null,
): TimelineItem[] => {
  const decorators: Array<{ priority: number; item: TimelineItem }> = [];
  const shouldInsertDateDivider =
    !previousMessage ||
    !isSameDay(new Date(message.createdAt), new Date(previousMessage.createdAt));
  const shouldInsertUnread = shouldInsertUnreadDivider(
    message,
    previousMessage,
    unreadMarker,
  );

  if (shouldInsertUnread) {
    decorators.push({
      priority: 30,
      item: {
        kind: "unread",
        key: `unread-${getTimelineMessageKey(message)}`,
      },
    });
  }

  if (shouldInsertDateDivider) {
    decorators.push({
      priority: 20,
      item: {
        kind: "date",
        key: `date-${getTimelineMessageKey(message)}`,
        date: new Date(message.createdAt),
      },
    });
  }

  return decorators
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => entry.item);
};

export const buildTimelineItems = ({
  messages,
  currentUserId,
  conversationType,
  groupingThresholdMs,
  unreadMarker,
}: TimelinePlannerParams): TimelineItem[] => {
  const items: TimelineItem[] = [];
  const isGroupChat = isGroupConversation(conversationType);

  messages.forEach((message, index) => {
    if (!message) return;

    const previousMessage = messages[index - 1];
    const nextMessage = messages[index + 1];
    const beforeBreak = resolveClusterBreak(
      previousMessage,
      message,
      groupingThresholdMs,
    );
    const afterBreak = resolveClusterBreak(
      message,
      nextMessage,
      groupingThresholdMs,
    );

    items.push(
      ...buildBoundaryDecorators(message, previousMessage, unreadMarker),
    );

    if (message.type === "system") {
      items.push({
        kind: "system",
        key: `system-${getTimelineMessageKey(message)}`,
        message,
      });
      return;
    }

    const isOwn = message.senderId === currentUserId;
    const isGroupStart = beforeBreak.shouldBreak;
    const isGroupEnd = afterBreak.shouldBreak;

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
      clusterBreakBefore: beforeBreak.primaryReason ?? undefined,
      clusterBreakAfter: afterBreak.primaryReason ?? undefined,
    });
  });

  return items;
};

export const areTimelineItemsEqual = (a: TimelineItem, b: TimelineItem): boolean => {
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
