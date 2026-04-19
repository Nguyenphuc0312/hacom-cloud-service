import React from "react";
import type { Conversation, Message, Attachment } from "../../../types";
import {
  useMessageGrouping,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../../hooks/useMessageGrouping";

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
    return (
      previousItem.messageId === nextItem.messageId &&
      getMessageLayoutSignature(previousItem.message) ===
        getMessageLayoutSignature(nextItem.message)
    );
  }

  if (previousItem.kind === "message" && nextItem.kind === "message") {
    return (
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
      previousItem.clusterBreakAfter === nextItem.clusterBreakAfter &&
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
  const [cache, setCache] = React.useState<TimelineRowsCache>(() => ({
    groupedItems: null,
    items: [],
    itemsByKey: new Map(),
  }));

  const computed = React.useMemo(() => {
    if (cache.groupedItems === groupedItems) {
      return {
        items: cache.items,
        nextCache: cache,
      };
    }

    const nextItems = groupedItems.map(toConversationTimelineItem);
    const nextItemsByKey = new Map<string, ConversationTimelineItem>();
    const previousItemsByKey = cache.itemsByKey;

    for (let index = 0; index < nextItems.length; index += 1) {
      const nextItem = nextItems[index];
      const previousItem = previousItemsByKey.get(nextItem.key);

      if (
        previousItem &&
        areConversationTimelineItemsEqual(previousItem, nextItem)
      ) {
        nextItems[index] = previousItem;
      }

      nextItemsByKey.set(nextItems[index].key, nextItems[index]);
    }

    return {
      items: nextItems,
      nextCache: {
        groupedItems,
        items: nextItems,
        itemsByKey: nextItemsByKey,
      },
    };
  }, [cache, groupedItems]);

  React.useEffect(() => {
    setCache((current) => {
      if (current.groupedItems === groupedItems) {
        return current;
      }

      return computed.nextCache;
    });
  }, [computed.nextCache, groupedItems]);

  return computed.items;
};

export default useConversationTimelineRows;
