/* eslint-disable react-hooks/refs -- Immutable derived-row cache preserves item identity without scheduling a second render. */
import React from "react";
import type { Conversation, Message, Attachment } from "../../../types";
import {
  useMessageGrouping,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../../hooks/useMessageGrouping";
import {
  getChatPerformanceDuration,
  getChatPerformanceTimestamp,
  recordChatPerformanceMeasure,
} from "../../../utils/chatPerformance";

type TimelineDateItem = Extract<TimelineItem, { kind: "date" }>;
type TimelineUnreadItem = Extract<TimelineItem, { kind: "unread" }>;
type TimelineSystemItem = Extract<TimelineItem, { kind: "system" }>;
type TimelineMessageItem = Extract<TimelineItem, { kind: "message" }>;

export type ConversationTimelineItem =
  | TimelineDateItem
  | TimelineUnreadItem
  | (TimelineSystemItem & { messageId: string })
  | (TimelineMessageItem & { messageId: string });

interface UseConversationTimelineRowsParams {
  messages: Message[];
  currentUserId: string;
  conversationType: Conversation["type"];
  unreadMarker?: UnreadTimelineMarker | null;
}

interface TimelineRowsCache {
  groupedItems: TimelineItem[] | null;
  items: ConversationTimelineItem[];
  itemsByKey: Map<string, ConversationTimelineItem>;
}

const findCommonPrefixLength = <T,>(
  previousItems: readonly T[],
  nextItems: readonly T[],
): number => {
  const limit = Math.min(previousItems.length, nextItems.length);
  let index = 0;

  while (index < limit && previousItems[index] === nextItems[index]) {
    index += 1;
  }

  return index;
};

const compactMapIfNeeded = <T,>(
  itemMap: Map<string, T>,
  items: readonly T[],
  getKey: (item: T) => string,
): Map<string, T> => {
  if (itemMap.size <= items.length * 2) {
    return itemMap;
  }

  const compacted = new Map<string, T>();
  items.forEach((item) => {
    compacted.set(getKey(item), item);
  });
  return compacted;
};

const getAttachmentLayoutSignature = (
  attachments?: Attachment[],
): string => {
  if (!attachments || attachments.length === 0) return "";

  return attachments
    .map((attachment) =>
      [
        attachment.id,
        attachment.type,
        attachment.fileName,
        attachment.fileSize,
        attachment.width,
        attachment.height,
        attachment.thumbnailUrl,
      ].join(":"),
    )
    .join("|");
};

const getReplyLayoutSignature = (message: Message): string => {
  const reply = message.replyToMessage;
  if (!reply) return "";
  const replyAttachments = (
    reply as Message["replyToMessage"] & { attachments?: Attachment[] }
  ).attachments;

  return [
    reply.id,
    reply.type,
    reply.senderName,
    reply.content,
    reply.isDeleted,
    getAttachmentLayoutSignature(replyAttachments),
  ].join(":");
};

const getForwardedSignature = (message: Message): string => {
  const forwardedFrom = message.forwardedFrom;
  if (!forwardedFrom) return "";

  return [
    "id" in forwardedFrom ? forwardedFrom.id : "",
    "username" in forwardedFrom ? forwardedFrom.username : "",
  ].join(":");
};

const getMessageLayoutSignature = (message: Message): string =>
  [
    message.id,
    message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : String(message.createdAt ?? ""),
    message.type,
    message.senderId,
    message.senderName,
    message.content,
    message.status,
    message.sendState,
    message.isEdited,
    message.isDeleted,
    message.isPinned,
    getReplyLayoutSignature(message),
    getForwardedSignature(message),
    getAttachmentLayoutSignature(message.attachments),
    (message.reactions ?? [])
      .map((reaction) => `${reaction.emoji}:${reaction.count}`)
      .join("|"),
    (message.readBy ?? []).length,
    (message.mentions ?? []).length,
    (message as { threadCount?: number }).threadCount ?? 0,
  ].join("::");

const toConversationTimelineItem = (
  item: TimelineItem,
): ConversationTimelineItem => {
  if (item.kind === "date" || item.kind === "unread") {
    return item;
  }

  return {
    ...item,
    messageId: item.message.id,
  };
};

const buildItemsByKey = (
  items: ConversationTimelineItem[],
): Map<string, ConversationTimelineItem> => {
  const map = new Map<string, ConversationTimelineItem>();
  for (const item of items) {
    map.set(item.key, item);
  }
  return map;
};

/**
 * In-place mirror of the grouping fast path. When the grouped items array is an
 * in-place metadata variant of the previous one (same length/order/keys; only
 * some grouped items swapped to carry an updated message), reuse the previous
 * wrappers verbatim and rebuild only the swapped positions. This preserves
 * wrapper identity for the entire suffix after a mid-list change, so a reaction
 * or read receipt never re-wraps the whole tail.
 *
 * Returns null when not eligible, prev wrappers (same ref) when nothing changed,
 * or a new array preserving identity for all unchanged rows.
 */
const tryBuildInPlaceTimelineRows = (
  previousGroupedItems: TimelineItem[],
  previousRows: ConversationTimelineItem[],
  nextGroupedItems: TimelineItem[],
): ConversationTimelineItem[] | null => {
  if (
    previousGroupedItems.length !== nextGroupedItems.length ||
    previousRows.length !== nextGroupedItems.length
  ) {
    return null;
  }

  let changed = false;
  const result = new Array<ConversationTimelineItem>(nextGroupedItems.length);
  for (let index = 0; index < nextGroupedItems.length; index += 1) {
    const previousGrouped = previousGroupedItems[index];
    const nextGrouped = nextGroupedItems[index];
    if (previousGrouped === nextGrouped) {
      result[index] = previousRows[index];
      continue;
    }
    // Different object at the same slot must be the same row (same key) — any
    // structural divergence (insert/delete/reorder) bails to the full path.
    if (previousGrouped.key !== nextGrouped.key) {
      return null;
    }
    result[index] = toConversationTimelineItem(nextGrouped);
    changed = true;
  }

  return changed ? result : previousRows;
};

const areConversationTimelineItemsEqual = (
  previousItem: ConversationTimelineItem,
  nextItem: ConversationTimelineItem,
): boolean => {
  if (previousItem === nextItem) {
    return true;
  }

  if (
    previousItem.kind !== nextItem.kind ||
    previousItem.key !== nextItem.key
  ) {
    return false;
  }

  if (previousItem.kind === "date" && nextItem.kind === "date") {
    return previousItem.date.getTime() === nextItem.date.getTime();
  }

  if (previousItem.kind === "unread" && nextItem.kind === "unread") {
    return true;
  }

  if (previousItem.kind === "system" && nextItem.kind === "system") {
    if (
      previousItem.messageId === nextItem.messageId &&
      previousItem.message === nextItem.message
    ) {
      return true;
    }

    return (
      previousItem.messageId === nextItem.messageId &&
      getMessageLayoutSignature(previousItem.message) ===
        getMessageLayoutSignature(nextItem.message)
    );
  }

  if (previousItem.kind === "message" && nextItem.kind === "message") {
    const layoutFlagsEqual =
      previousItem.messageId === nextItem.messageId &&
      previousItem.isOwn === nextItem.isOwn &&
      previousItem.mergeLevel === nextItem.mergeLevel &&
      previousItem.showAvatar === nextItem.showAvatar &&
      previousItem.showSenderName === nextItem.showSenderName &&
      previousItem.showMeta === nextItem.showMeta &&
      previousItem.showStatus === nextItem.showStatus &&
      previousItem.spacingToken === nextItem.spacingToken &&
      previousItem.isGroupStart === nextItem.isGroupStart &&
      previousItem.isGroupEnd === nextItem.isGroupEnd &&
      previousItem.conversationType === nextItem.conversationType &&
      previousItem.semanticFamily === nextItem.semanticFamily &&
      previousItem.clusterBreakBefore === nextItem.clusterBreakBefore &&
      previousItem.clusterBreakAfter === nextItem.clusterBreakAfter;

    if (layoutFlagsEqual && previousItem.message === nextItem.message) {
      return true;
    }

    return (
      layoutFlagsEqual &&
      getMessageLayoutSignature(previousItem.message) ===
        getMessageLayoutSignature(nextItem.message)
    );
  }

  return false;
};

export const useConversationTimelineRows = ({
  messages,
  currentUserId,
  conversationType,
  unreadMarker,
}: UseConversationTimelineRowsParams): ConversationTimelineItem[] => {
  const groupedItems = useMessageGrouping({
    messages,
    currentUserId,
    conversationType,
    unreadMarker,
  });
  const cacheRef = React.useRef<TimelineRowsCache>({
    groupedItems: null,
    items: [],
    itemsByKey: new Map(),
  });

  const computed = React.useMemo(() => {
    const startedAt = getChatPerformanceTimestamp();
    const cache = cacheRef.current;
    if (cache.groupedItems === groupedItems) {
      const result = {
        items: cache.items,
      };
      recordChatPerformanceMeasure(
        "timeline-row-derive",
        getChatPerformanceDuration(startedAt),
        {
          messageCount: messages.length,
          groupedItemCount: groupedItems.length,
          rowCount: result.items.length,
          cacheHit: true,
        },
      );
      return result;
    }

    const previousGroupedItems = cache.groupedItems;

    // In-place metadata fast path: reuse wrappers, rebuild only swapped slots.
    if (previousGroupedItems) {
      const inPlaceItems = tryBuildInPlaceTimelineRows(
        previousGroupedItems,
        cache.items,
        groupedItems,
      );
      if (inPlaceItems) {
        const reusedPrevItems = inPlaceItems === cache.items;
        cacheRef.current = {
          groupedItems,
          items: inPlaceItems,
          itemsByKey: reusedPrevItems
            ? cache.itemsByKey
            : buildItemsByKey(inPlaceItems),
        };
        recordChatPerformanceMeasure(
          "timeline-row-derive",
          getChatPerformanceDuration(startedAt),
          {
            messageCount: messages.length,
            groupedItemCount: groupedItems.length,
            rowCount: inPlaceItems.length,
            cacheHit: false,
            inPlaceMetadata: true,
            inPlaceNoChange: reusedPrevItems,
          },
        );
        return { items: inPlaceItems };
      }
    }

    const commonPrefixLength = previousGroupedItems
      ? findCommonPrefixLength(previousGroupedItems, groupedItems)
      : 0;
    const canIncrementallyRebuildTail = Boolean(
      previousGroupedItems && commonPrefixLength > 0,
    );
    const nextItems = canIncrementallyRebuildTail
      ? cache.items.slice(0, commonPrefixLength)
      : [];
    const nextItemsByKey = canIncrementallyRebuildTail
      ? new Map(cache.itemsByKey)
      : new Map<string, ConversationTimelineItem>();
    const previousItemsByKey = cache.itemsByKey;

    for (let index = commonPrefixLength; index < groupedItems.length; index += 1) {
      let nextItem = toConversationTimelineItem(groupedItems[index]);
      const previousItem = previousItemsByKey.get(nextItem.key);

      if (
        previousItem &&
        areConversationTimelineItemsEqual(previousItem, nextItem)
      ) {
        nextItem = previousItem;
      }

      nextItems[index] = nextItem;
      nextItemsByKey.set(nextItem.key, nextItem);
    }

    const compactedItemsByKey = compactMapIfNeeded(
      nextItemsByKey,
      nextItems,
      (item) => item.key,
    );

    const nextCache = {
      groupedItems,
      items: nextItems,
      itemsByKey: compactedItemsByKey,
    };
    cacheRef.current = nextCache;

    recordChatPerformanceMeasure(
      "timeline-row-derive",
      getChatPerformanceDuration(startedAt),
      {
        messageCount: messages.length,
        groupedItemCount: groupedItems.length,
        rowCount: nextItems.length,
        cacheHit: false,
        incrementalTail: canIncrementallyRebuildTail,
        commonPrefixLength,
      },
    );

    return {
      items: nextItems,
    };
  }, [groupedItems, messages.length]);

  return computed.items;
};

export default useConversationTimelineRows;
