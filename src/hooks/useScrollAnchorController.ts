import React from "react";
import type { VariableSizeList as VirtualList } from "react-window";

interface AnchorSnapshot {
  itemKey: string | null;
  index: number;
  offsetWithinItem: number;
}

interface QueuedSizeChange {
  index: number;
  delta: number;
}

type ScheduledWrite = "pin-bottom" | "restore-anchor";

interface UseScrollAnchorControllerParams<Item, ListData> {
  conversationId: string;
  items: Item[];
  getItemKey: (item: Item, index: number) => string;
  getItemOffset: (index: number) => number;
  findItemAtOffset: (
    scrollOffset: number,
  ) => {
    index: number;
    offsetWithinItem: number;
  } | null;
  listRef: React.MutableRefObject<VirtualList<ListData> | null>;
  outerRef: React.MutableRefObject<HTMLDivElement | null>;
  viewportHeight: number;
  composerHeight?: number;
  autoFollowEnabled: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface UseScrollAnchorControllerResult {
  handleScrollOffset: (scrollOffset: number) => void;
  handleItemSizeChange: (change: QueuedSizeChange) => void;
  capturePrependAnchor: () => void;
  restoreAfterPrepend: () => void;
  refreshAnchorSnapshot: () => void;
}

export const useScrollAnchorController = <Item, ListData>({
  conversationId,
  items,
  getItemKey,
  getItemOffset,
  findItemAtOffset,
  listRef,
  outerRef,
  viewportHeight,
  composerHeight = 0,
  autoFollowEnabled,
  scrollToBottom,
}: UseScrollAnchorControllerParams<Item, ListData>): UseScrollAnchorControllerResult => {
  const anchorSnapshotRef = React.useRef<AnchorSnapshot | null>(null);
  const pendingPrependRestoreRef = React.useRef(false);
  const previousViewportHeightRef = React.useRef(0);
  const previousComposerHeightRef = React.useRef<number | null>(null);
  const scheduledWriteRef = React.useRef<ScheduledWrite | null>(null);
  const scheduledWriteRafRef = React.useRef<number | null>(null);
  const anchorRefreshRafRef = React.useRef<number | null>(null);
  const sizeChangeRafRef = React.useRef<number | null>(null);
  const queuedSizeChangesRef = React.useRef<QueuedSizeChange[]>([]);

  const getWritePriority = React.useCallback((write: ScheduledWrite): number => {
    switch (write) {
      case "restore-anchor":
        return 2;
      case "pin-bottom":
      default:
        return 1;
    }
  }, []);

  const resolveAnchorIndex = React.useCallback(
    (snapshot: AnchorSnapshot | null): number => {
      if (!snapshot || items.length === 0) return -1;

      if (snapshot.itemKey) {
        const indexByKey = items.findIndex(
          (item, index) => getItemKey(item, index) === snapshot.itemKey,
        );
        if (indexByKey >= 0) {
          return indexByKey;
        }
      }

      return Math.min(snapshot.index, items.length - 1);
    },
    [getItemKey, items],
  );

  const captureAnchorSnapshot = React.useCallback(
    (scrollOffset?: number): AnchorSnapshot | null => {
      const outer = outerRef.current;
      if (!outer || items.length === 0) {
        anchorSnapshotRef.current = null;
        return null;
      }

      const nextScrollOffset = scrollOffset ?? outer.scrollTop;
      const itemAtOffset = findItemAtOffset(nextScrollOffset);
      if (!itemAtOffset) {
        anchorSnapshotRef.current = null;
        return null;
      }

      const item = items[itemAtOffset.index];
      const snapshot = {
        itemKey: item ? getItemKey(item, itemAtOffset.index) : null,
        index: itemAtOffset.index,
        offsetWithinItem: itemAtOffset.offsetWithinItem,
      };

      anchorSnapshotRef.current = snapshot;
      return snapshot;
    },
    [findItemAtOffset, getItemKey, items, outerRef],
  );

  const refreshAnchorSnapshot = React.useCallback(() => {
    if (anchorRefreshRafRef.current !== null) {
      cancelAnimationFrame(anchorRefreshRafRef.current);
    }

    anchorRefreshRafRef.current = requestAnimationFrame(() => {
      captureAnchorSnapshot();
      anchorRefreshRafRef.current = null;
    });
  }, [captureAnchorSnapshot]);

  const flushScheduledWrite = React.useCallback(() => {
    scheduledWriteRafRef.current = null;

    const scheduledWrite = scheduledWriteRef.current;
    scheduledWriteRef.current = null;
    if (!scheduledWrite) {
      return;
    }

    if (scheduledWrite === "pin-bottom") {
      scrollToBottom("auto");
      return;
    }

    const outer = outerRef.current;
    const snapshot = anchorSnapshotRef.current ?? captureAnchorSnapshot();
    if (!outer || !snapshot) {
      return;
    }

    const anchorIndex = resolveAnchorIndex(snapshot);
    if (anchorIndex < 0) {
      return;
    }

    const nextOffset = getItemOffset(anchorIndex) + snapshot.offsetWithinItem;
    listRef.current?.scrollTo(Math.max(0, nextOffset));
    refreshAnchorSnapshot();
  }, [
    captureAnchorSnapshot,
    getItemOffset,
    listRef,
    outerRef,
    refreshAnchorSnapshot,
    resolveAnchorIndex,
    scrollToBottom,
  ]);

  const scheduleWriteOncePerFrame = React.useCallback(
    (write: ScheduledWrite) => {
      const currentWrite = scheduledWriteRef.current;
      if (
        !currentWrite ||
        getWritePriority(write) >= getWritePriority(currentWrite)
      ) {
        scheduledWriteRef.current = write;
      }

      if (scheduledWriteRafRef.current !== null) {
        return;
      }

      scheduledWriteRafRef.current = requestAnimationFrame(flushScheduledWrite);
    },
    [flushScheduledWrite, getWritePriority],
  );

  const schedulePinToBottom = React.useCallback(() => {
    scheduleWriteOncePerFrame("pin-bottom");
  }, [scheduleWriteOncePerFrame]);

  const scheduleAnchorRestore = React.useCallback(() => {
    scheduleWriteOncePerFrame("restore-anchor");
  }, [scheduleWriteOncePerFrame]);

  const handleScrollOffset = React.useCallback(
    (scrollOffset: number) => {
      if (!autoFollowEnabled) {
        captureAnchorSnapshot(scrollOffset);
      }
    },
    [autoFollowEnabled, captureAnchorSnapshot],
  );

  const flushQueuedSizeChanges = React.useCallback(() => {
    sizeChangeRafRef.current = null;

    if (queuedSizeChangesRef.current.length === 0) {
      return;
    }

    const queuedChanges = Array.from(
      queuedSizeChangesRef.current.reduce((acc, change) => {
        const current = acc.get(change.index);
        acc.set(change.index, {
          index: change.index,
          delta: (current?.delta ?? 0) + change.delta,
        });
        return acc;
      }, new Map<number, QueuedSizeChange>()).values(),
    ).filter((change) => Math.abs(change.delta) > 1);
    queuedSizeChangesRef.current = [];

    if (queuedChanges.length === 0) {
      return;
    }

    if (autoFollowEnabled) {
      schedulePinToBottom();
      return;
    }

    const snapshot = anchorSnapshotRef.current ?? captureAnchorSnapshot();
    if (!snapshot) {
      return;
    }

    const anchorIndex = resolveAnchorIndex(snapshot);
    if (anchorIndex < 0) {
      return;
    }

    const shouldRestoreAnchor = queuedChanges.some(
      (change) => change.index <= anchorIndex,
    );
    if (shouldRestoreAnchor) {
      scheduleAnchorRestore();
    }
  }, [
    autoFollowEnabled,
    captureAnchorSnapshot,
    resolveAnchorIndex,
    scheduleAnchorRestore,
    schedulePinToBottom,
  ]);

  const handleItemSizeChange = React.useCallback(
    (change: QueuedSizeChange) => {
      if (Math.abs(change.delta) <= 1) return;

      queuedSizeChangesRef.current.push(change);
      if (sizeChangeRafRef.current !== null) {
        return;
      }

      sizeChangeRafRef.current = requestAnimationFrame(flushQueuedSizeChanges);
    },
    [flushQueuedSizeChanges],
  );

  const capturePrependAnchor = React.useCallback(() => {
    captureAnchorSnapshot();
    pendingPrependRestoreRef.current = true;
  }, [captureAnchorSnapshot]);

  const restoreAfterPrepend = React.useCallback(() => {
    if (!pendingPrependRestoreRef.current) return;
    pendingPrependRestoreRef.current = false;
    scheduleAnchorRestore();
  }, [scheduleAnchorRestore]);

  React.useEffect(() => {
    if (scheduledWriteRafRef.current !== null) {
      cancelAnimationFrame(scheduledWriteRafRef.current);
      scheduledWriteRafRef.current = null;
    }
    if (anchorRefreshRafRef.current !== null) {
      cancelAnimationFrame(anchorRefreshRafRef.current);
      anchorRefreshRafRef.current = null;
    }
    if (sizeChangeRafRef.current !== null) {
      cancelAnimationFrame(sizeChangeRafRef.current);
      sizeChangeRafRef.current = null;
    }
    anchorSnapshotRef.current = null;
    pendingPrependRestoreRef.current = false;
    previousViewportHeightRef.current = 0;
    previousComposerHeightRef.current = null;
    queuedSizeChangesRef.current = [];
    scheduledWriteRef.current = null;
  }, [conversationId]);

  React.useEffect(() => {
    if (items.length === 0) {
      anchorSnapshotRef.current = null;
      return;
    }

    if (autoFollowEnabled) {
      schedulePinToBottom();
      return;
    }

    if (!anchorSnapshotRef.current) {
      captureAnchorSnapshot();
    }
  }, [autoFollowEnabled, captureAnchorSnapshot, items.length, schedulePinToBottom]);

  React.useLayoutEffect(() => {
    if (viewportHeight <= 0) return;

    const previousViewportHeight = previousViewportHeightRef.current;
    previousViewportHeightRef.current = viewportHeight;

    if (
      previousViewportHeight <= 0 ||
      previousViewportHeight === viewportHeight
    ) {
      return;
    }

    if (autoFollowEnabled) {
      schedulePinToBottom();
      return;
    }

    scheduleAnchorRestore();
  }, [
    autoFollowEnabled,
    scheduleAnchorRestore,
    schedulePinToBottom,
    viewportHeight,
  ]);

  React.useLayoutEffect(() => {
    const previousComposerHeight = previousComposerHeightRef.current;
    previousComposerHeightRef.current = composerHeight;

    if (
      previousComposerHeight === null ||
      Math.abs(previousComposerHeight - composerHeight) <= 1
    ) {
      return;
    }

    if (autoFollowEnabled) {
      schedulePinToBottom();
      return;
    }

    if (!anchorSnapshotRef.current) {
      captureAnchorSnapshot();
    }
    scheduleAnchorRestore();
  }, [
    autoFollowEnabled,
    captureAnchorSnapshot,
    composerHeight,
    scheduleAnchorRestore,
    schedulePinToBottom,
  ]);

  React.useEffect(
    () => () => {
      if (scheduledWriteRafRef.current !== null) {
        cancelAnimationFrame(scheduledWriteRafRef.current);
      }
      if (anchorRefreshRafRef.current !== null) {
        cancelAnimationFrame(anchorRefreshRafRef.current);
      }
      if (sizeChangeRafRef.current !== null) {
        cancelAnimationFrame(sizeChangeRafRef.current);
      }
    },
    [],
  );

  return {
    handleScrollOffset,
    handleItemSizeChange,
    capturePrependAnchor,
    restoreAfterPrepend,
    refreshAnchorSnapshot,
  };
};

export default useScrollAnchorController;
