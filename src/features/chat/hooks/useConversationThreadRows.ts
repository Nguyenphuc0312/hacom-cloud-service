import React from "react";
import type { ConversationTimelineItem } from "./useConversationTimelineRows";

type ThreadSeparatorRow = Extract<
  ConversationTimelineItem,
  { kind: "date" | "unread" | "system" }
>;

export type ConversationThreadMessageItem = Extract<
  ConversationTimelineItem,
  { kind: "message" }
>;

export interface ConversationThreadGroupRow {
  kind: "group";
  key: string;
  items: ConversationThreadMessageItem[];
  messageIds: string[];
  anchorMessageId: string;
  tailMessageId: string;
  senderId: string;
  isOwn: boolean;
  startedAt: Date;
  endedAt: Date;
  showAvatar: boolean;
  showSenderName: boolean;
  showStatus: boolean;
}

export type ConversationThreadRow = ThreadSeparatorRow | ConversationThreadGroupRow;

const buildGroupRow = (
  items: ConversationThreadMessageItem[],
): ConversationThreadGroupRow => {
  const firstItem = items[0];
  const lastItem = items[items.length - 1];

  return {
    kind: "group",
    key: `group-${firstItem.key}-${lastItem.key}`,
    items,
    messageIds: items.map((item) => item.messageId),
    anchorMessageId: firstItem.messageId,
    tailMessageId: lastItem.messageId,
    senderId: firstItem.message.senderId,
    isOwn: firstItem.isOwn,
    startedAt: new Date(firstItem.message.createdAt),
    endedAt: new Date(lastItem.message.createdAt),
    showAvatar: Boolean(lastItem.showAvatar),
    showSenderName: Boolean(firstItem.showSenderName),
    showStatus: Boolean(lastItem.showStatus),
  };
};

export const buildConversationThreadRows = (
  items: ConversationTimelineItem[],
): ConversationThreadRow[] => {
  const rows: ConversationThreadRow[] = [];
  let pendingGroup: ConversationThreadMessageItem[] = [];

  const flushGroup = () => {
    if (pendingGroup.length === 0) {
      return;
    }

    rows.push(buildGroupRow(pendingGroup));
    pendingGroup = [];
  };

  items.forEach((item) => {
    if (item.kind !== "message") {
      flushGroup();
      rows.push(item);
      return;
    }

    if (pendingGroup.length === 0 && !item.isGroupStart) {
      pendingGroup.push(item);
    } else {
      pendingGroup.push(item);
    }

    if (item.isGroupEnd) {
      flushGroup();
    }
  });

  flushGroup();
  return rows;
};

const areGroupRowsEqual = (
  previousRow: ConversationThreadGroupRow,
  nextRow: ConversationThreadGroupRow,
): boolean => {
  if (previousRow === nextRow) {
    return true;
  }

  if (
    previousRow.key !== nextRow.key ||
    previousRow.anchorMessageId !== nextRow.anchorMessageId ||
    previousRow.tailMessageId !== nextRow.tailMessageId ||
    previousRow.isOwn !== nextRow.isOwn ||
    previousRow.showAvatar !== nextRow.showAvatar ||
    previousRow.showSenderName !== nextRow.showSenderName ||
    previousRow.showStatus !== nextRow.showStatus ||
    previousRow.items.length !== nextRow.items.length
  ) {
    return false;
  }

  for (let index = 0; index < previousRow.items.length; index += 1) {
    if (previousRow.items[index] !== nextRow.items[index]) {
      return false;
    }
  }

  return true;
};

const areThreadRowsEqual = (
  previousRow: ConversationThreadRow,
  nextRow: ConversationThreadRow,
): boolean => {
  if (previousRow === nextRow) {
    return true;
  }

  if (previousRow.kind !== nextRow.kind || previousRow.key !== nextRow.key) {
    return false;
  }

  if (previousRow.kind === "group" && nextRow.kind === "group") {
    return areGroupRowsEqual(previousRow, nextRow);
  }

  if (previousRow.kind === "date" && nextRow.kind === "date") {
    return previousRow.date.getTime() === nextRow.date.getTime();
  }

  if (previousRow.kind === "unread" && nextRow.kind === "unread") {
    return true;
  }

  if (previousRow.kind === "system" && nextRow.kind === "system") {
    return previousRow.message === nextRow.message;
  }

  return false;
};

interface ThreadRowsCache {
  timelineItems: ConversationTimelineItem[] | null;
  rows: ConversationThreadRow[];
  rowsByKey: Map<string, ConversationThreadRow>;
}

export const useConversationThreadRows = (
  items: ConversationTimelineItem[],
): ConversationThreadRow[] => {
  const [cache, setCache] = React.useState<ThreadRowsCache>(() => ({
    timelineItems: null,
    rows: [],
    rowsByKey: new Map(),
  }));

  const computed = React.useMemo(() => {
    if (cache.timelineItems === items) {
      return {
        rows: cache.rows,
        nextCache: cache,
      };
    }

    const nextRows = buildConversationThreadRows(items);
    const nextRowsByKey = new Map<string, ConversationThreadRow>();

    for (let index = 0; index < nextRows.length; index += 1) {
      const nextRow = nextRows[index];
      const previousRow = cache.rowsByKey.get(nextRow.key);

      if (previousRow && areThreadRowsEqual(previousRow, nextRow)) {
        nextRows[index] = previousRow;
      }

      nextRowsByKey.set(nextRows[index].key, nextRows[index]);
    }

    return {
      rows: nextRows,
      nextCache: {
        timelineItems: items,
        rows: nextRows,
        rowsByKey: nextRowsByKey,
      },
    };
  }, [cache, items]);

  React.useEffect(() => {
    setCache((current) => {
      if (current.timelineItems === items) {
        return current;
      }

      return computed.nextCache;
    });
  }, [computed.nextCache, items]);

  return computed.rows;
};

export default useConversationThreadRows;
