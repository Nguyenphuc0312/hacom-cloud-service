/* eslint-disable react-hooks/refs -- Immutable derived-row cache preserves row identity without scheduling a second render. */
import React from "react";
import type { ConversationTimelineItem } from "./useConversationTimelineRows";
import {
  getChatPerformanceDuration,
  getChatPerformanceTimestamp,
  recordChatPerformanceMeasure,
} from "../../../utils/chatPerformance";

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
  groupItemOffset: number;
  groupItemCount: number;
}

export type ConversationThreadRow = ThreadSeparatorRow | ConversationThreadGroupRow;

const MAX_MESSAGES_PER_THREAD_ROW = 6;

const buildGroupRow = (
  items: ConversationThreadMessageItem[],
  groupItemOffset = 0,
  groupItemCount = items.length,
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
    groupItemOffset,
    groupItemCount,
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

    const groupItemCount = pendingGroup.length;
    for (
      let groupItemOffset = 0;
      groupItemOffset < groupItemCount;
      groupItemOffset += MAX_MESSAGES_PER_THREAD_ROW
    ) {
      rows.push(
        buildGroupRow(
          pendingGroup.slice(
            groupItemOffset,
            groupItemOffset + MAX_MESSAGES_PER_THREAD_ROW,
          ),
          groupItemOffset,
          groupItemCount,
        ),
      );
    }
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
    previousRow.groupItemOffset !== nextRow.groupItemOffset ||
    previousRow.groupItemCount !== nextRow.groupItemCount ||
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

const rowContainsTimelineItemKey = (
  row: ConversationThreadRow,
  itemKey: string,
): boolean => {
  if (row.kind === "group") {
    return row.items.some((item) => item.key === itemKey);
  }

  return row.key === itemKey;
};

const getFirstTimelineItemKeyForRow = (
  row: ConversationThreadRow,
): string | null => {
  if (row.kind === "group") {
    return row.items[0]?.key ?? null;
  }

  return row.key;
};

const findThreadRowIndexForTimelineItemKey = (
  rows: readonly ConversationThreadRow[],
  itemKey: string,
): number =>
  rows.findIndex((row) => rowContainsTimelineItemKey(row, itemKey));

const compactMapIfNeeded = (
  rowsByKey: Map<string, ConversationThreadRow>,
  rows: readonly ConversationThreadRow[],
): Map<string, ConversationThreadRow> => {
  if (rowsByKey.size <= rows.length * 2) {
    return rowsByKey;
  }

  const compacted = new Map<string, ConversationThreadRow>();
  rows.forEach((row) => {
    compacted.set(row.key, row);
  });
  return compacted;
};

const buildTailThreadRows = (
  items: ConversationTimelineItem[],
  cache: ThreadRowsCache,
): {
  rows: ConversationThreadRow[];
  reconciliationStartIndex: number;
  incrementalTail: boolean;
  commonPrefixLength: number;
} => {
  const previousItems = cache.timelineItems;
  const commonPrefixLength = previousItems
    ? findCommonPrefixLength(previousItems, items)
    : 0;

  if (!previousItems || commonPrefixLength === 0) {
    return {
      rows: buildConversationThreadRows(items),
      reconciliationStartIndex: 0,
      incrementalTail: false,
      commonPrefixLength,
    };
  }

  if (commonPrefixLength >= previousItems.length) {
    const tailRows = buildConversationThreadRows(items.slice(commonPrefixLength));
    return {
      rows: cache.rows.concat(tailRows),
      reconciliationStartIndex: cache.rows.length,
      incrementalTail: true,
      commonPrefixLength,
    };
  }

  const firstChangedKey = items[commonPrefixLength]?.key;
  if (!firstChangedKey) {
    return {
      rows: buildConversationThreadRows(items),
      reconciliationStartIndex: 0,
      incrementalTail: false,
      commonPrefixLength,
    };
  }

  const rowIndex = findThreadRowIndexForTimelineItemKey(
    cache.rows,
    firstChangedKey,
  );
  if (rowIndex < 0) {
    return {
      rows: buildConversationThreadRows(items),
      reconciliationStartIndex: 0,
      incrementalTail: false,
      commonPrefixLength,
    };
  }

  const rebuildStartKey = getFirstTimelineItemKeyForRow(cache.rows[rowIndex]);
  const rebuildStartIndex = rebuildStartKey
    ? items.findIndex((item) => item.key === rebuildStartKey)
    : -1;
  if (rebuildStartIndex < 0) {
    return {
      rows: buildConversationThreadRows(items),
      reconciliationStartIndex: 0,
      incrementalTail: false,
      commonPrefixLength,
    };
  }

  const preservedRows = cache.rows.slice(0, rowIndex);
  const tailRows = buildConversationThreadRows(items.slice(rebuildStartIndex));

  return {
    rows: preservedRows.concat(tailRows),
    reconciliationStartIndex: preservedRows.length,
    incrementalTail: true,
    commonPrefixLength,
  };
};

export const useConversationThreadRows = (
  items: ConversationTimelineItem[],
): ConversationThreadRow[] => {
  const cacheRef = React.useRef<ThreadRowsCache>({
    timelineItems: null,
    rows: [],
    rowsByKey: new Map(),
  });

  const computed = React.useMemo(() => {
    const startedAt = getChatPerformanceTimestamp();
    const cache = cacheRef.current;
    if (cache.timelineItems === items) {
      const result = {
        rows: cache.rows,
      };
      recordChatPerformanceMeasure(
        "thread-row-derive",
        getChatPerformanceDuration(startedAt),
        {
          timelineItemCount: items.length,
          rowCount: result.rows.length,
          cacheHit: true,
        },
      );
      return result;
    }

    const {
      rows: nextRows,
      reconciliationStartIndex,
      incrementalTail,
      commonPrefixLength,
    } = buildTailThreadRows(items, cache);
    const nextRowsByKey = incrementalTail
      ? new Map(cache.rowsByKey)
      : new Map<string, ConversationThreadRow>();

    for (let index = reconciliationStartIndex; index < nextRows.length; index += 1) {
      const nextRow = nextRows[index];
      const previousRow = cache.rowsByKey.get(nextRow.key);

      if (previousRow && areThreadRowsEqual(previousRow, nextRow)) {
        nextRows[index] = previousRow;
      }

      nextRowsByKey.set(nextRows[index].key, nextRows[index]);
    }
    const compactedRowsByKey = compactMapIfNeeded(nextRowsByKey, nextRows);

    const nextCache = {
      timelineItems: items,
      rows: nextRows,
      rowsByKey: compactedRowsByKey,
    };
    cacheRef.current = nextCache;

    recordChatPerformanceMeasure(
      "thread-row-derive",
      getChatPerformanceDuration(startedAt),
      {
        timelineItemCount: items.length,
        rowCount: nextRows.length,
        cacheHit: false,
        incrementalTail,
        commonPrefixLength,
      },
    );

    return {
      rows: nextRows,
    };
  }, [items]);

  return computed.rows;
};

export default useConversationThreadRows;
