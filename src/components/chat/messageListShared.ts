import type { Message } from "../../types";
import type { TimelineItem } from "../../hooks/useMessageGrouping";
import type {
  ConversationThreadMessageItem,
  ConversationThreadRow,
} from "../../features/chat/hooks/useConversationThreadRows";
import {
  isCollapsiblePlainTextMessage,
  isPlainStaticTextMessage,
  type LongMessageRenderMode,
  type TimelineMeasurementMode,
} from "../../utils/longMessagePolicy";

export interface TimelineMessageRenderState {
  renderMode: LongMessageRenderMode;
  measurementMode: TimelineMeasurementMode;
  isCollapsible: boolean;
}

export type RenderableTimelineItem = TimelineItem | ConversationThreadRow;

export const resolveThreadMessageRenderState = (
  item: Pick<ConversationThreadMessageItem, "kind" | "message">,
  expandedLongMessageIds: Set<string>,
): TimelineMessageRenderState => {
  if (item.kind !== "message") {
    return {
      renderMode: "expanded",
      measurementMode: "static",
      isCollapsible: false,
    };
  }

  const message = item.message;
  const isCollapsible = isCollapsiblePlainTextMessage(message);
  const isExpanded = isCollapsible && expandedLongMessageIds.has(message.id);
  const isStaticPlainText = isPlainStaticTextMessage(message);

  return {
    renderMode: isExpanded ? "expanded" : isCollapsible ? "collapsed" : "expanded",
    measurementMode: isStaticPlainText ? "static" : "dynamic",
    isCollapsible,
  };
};

export const resolveTimelineMessageRenderState = (
  item: RenderableTimelineItem,
  expandedLongMessageIds: Set<string>,
): TimelineMessageRenderState => {
  if (item.kind === "group") {
    const rowModes = item.items.map((messageItem) =>
      resolveThreadMessageRenderState(messageItem, expandedLongMessageIds),
    );

    return {
      renderMode: rowModes.some((state) => state.renderMode === "collapsed")
        ? "collapsed"
        : "expanded",
      measurementMode: rowModes.some((state) => state.measurementMode === "dynamic")
        ? "dynamic"
        : "static",
      isCollapsible: rowModes.some((state) => state.isCollapsible),
    };
  }

  return resolveThreadMessageRenderState(
    item as Pick<ConversationThreadMessageItem, "kind" | "message">,
    expandedLongMessageIds,
  );
};

export type ScrollCommand =
  | {
      kind: "bottom";
      reason: string;
    }
  | {
      kind: "offset";
      offset: number;
      reason: string;
    };

export type PendingScrollCommand = ScrollCommand & {
  priority: number;
  requestedAt: number;
};

const HIGH_VALUE_SCROLL_REASONS = new Set([
  "jump-to-latest",
  "jump-to-message",
  "conversation-change-newer-messages",
  "incoming-message",
  "self-message",
  "prepend-history-preserve",
]);

export const resolveScrollCommandPriority = (reason: string): number => {
  switch (reason) {
    case "jump-to-latest":
      return 100;
    case "jump-to-message":
      return 95;
    case "conversation-change-newer-messages":
      return 92;
    case "incoming-message":
      return 90;
    case "self-message":
      return 85;
    case "prepend-history-preserve":
      return 80;
    case "conversation-restore-anchor":
      return 70;
    case "conversation-restore":
      return 65;
    case "conversation-restore-unread":
      return 60;
    case "item-resize-preserve":
      return 50;
    case "item-resize-while-pinned":
      return 48;
    case "layout-change":
      return 40;
    case "keyboard-home":
    case "keyboard-page-down":
    case "keyboard-page-up":
      return 30;
    case "conversation-change":
      return 25;
    default:
      return 20;
  }
};

export const shouldAcceptScrollCommand = ({
  nextCommand,
  pendingCommand,
  isPinnedToBottom,
}: {
  nextCommand: ScrollCommand;
  pendingCommand: PendingScrollCommand | null;
  isPinnedToBottom: boolean;
}): {
  accepted: boolean;
  reason: string;
} => {
  if (
    nextCommand.reason === "conversation-restore-unread" &&
    isPinnedToBottom
  ) {
    return {
      accepted: false,
      reason: "restore_unread_blocked_while_pinned",
    };
  }

  if (!pendingCommand) {
    return { accepted: true, reason: "accepted_no_pending" };
  }

  const nextPriority = resolveScrollCommandPriority(nextCommand.reason);
  if (pendingCommand.priority > nextPriority) {
    return {
      accepted: false,
      reason: "lower_priority_than_pending",
    };
  }

  if (pendingCommand.priority === nextPriority) {
    const sameFamily = pendingCommand.reason === nextCommand.reason;
    if (!sameFamily) {
      return {
        accepted: false,
        reason: "equal_priority_keep_existing",
      };
    }
  }

  if (
    nextCommand.reason === "conversation-restore-unread" &&
    HIGH_VALUE_SCROLL_REASONS.has(pendingCommand.reason)
  ) {
    return {
      accepted: false,
      reason: "restore_unread_cannot_override_high_value_scroll",
    };
  }

  return {
    accepted: true,
    reason: pendingCommand ? "accepted_replaced_pending" : "accepted_no_pending",
  };
};

export const isTargetMessage = (
  message: Message,
  targetId: string | null,
): boolean => {
  if (!targetId) return false;
  return (
    message.id === targetId ||
    message.localId === targetId ||
    message.stableId === targetId ||
    message.clientMessageId === targetId
  );
};
