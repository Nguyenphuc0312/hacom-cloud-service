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
  autoFollowEnabled,
  scrollToBottom,
}: UseScrollAnchorControllerParams<Item, ListData>): UseScrollAnchorControllerResult => {
  const anchorSnapshotRef = React.useRef<AnchorSnapshot | null>(null);
  const pendingPrependRestoreRef = React.useRef(false);
  const previousViewportHeightRef = React.useRef(0);
  const pinBottomRafRef = React.useRef<number | null>(null);
  const anchorRestoreRafRef = React.useRef<number | null>(null);
  const anchorRefreshRafRef = React.useRef<number | null>(null);
  const sizeChangeRafRef = React.useRef<number | null>(null);
  const queuedSizeChangesRef = React.useRef<QueuedSizeChange[]>([]);

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

  const schedulePinToBottom = React.useCallback(() => {
    if (pinBottomRafRef.current !== null) {
      cancelAnimationFrame(pinBottomRafRef.current);
    }

    pinBottomRafRef.current = requestAnimationFrame(() => {
      scrollToBottom("auto");
      pinBottomRafRef.current = null;
    });
  }, [scrollToBottom]);

  const scheduleAnchorRestore = React.useCallback(() => {
    if (anchorRestoreRafRef.current !== null) {
      cancelAnimationFrame(anchorRestoreRafRef.current);
    }

    anchorRestoreRafRef.current = requestAnimationFrame(() => {
      const outer = outerRef.current;
      const snapshot = anchorSnapshotRef.current;
      if (!outer || !snapshot) {
        anchorRestoreRafRef.current = null;
        return;
      }

      const anchorIndex = resolveAnchorIndex(snapshot);
      if (anchorIndex < 0) {
        anchorRestoreRafRef.current = null;
        return;
      }

      const nextOffset =
        getItemOffset(anchorIndex) + snapshot.offsetWithinItem;
      listRef.current?.scrollTo(Math.max(0, nextOffset));
      anchorRestoreRafRef.current = null;
      refreshAnchorSnapshot();
    });
  }, [
    getItemOffset,
    listRef,
    outerRef,
    refreshAnchorSnapshot,
    resolveAnchorIndex,
  ]);

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

    const queuedChanges = queuedSizeChangesRef.current;
    queuedSizeChangesRef.current = [];

    if (autoFollowEnabled) {
      schedulePinToBottom();
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

    const shouldRestoreAnchor = queuedChanges.some(
      (change) => change.index === anchorIndex,
    );
    if (shouldRestoreAnchor) {
      scheduleAnchorRestore();
      return;
    }

    const totalDeltaBeforeAnchor = queuedChanges.reduce((sum, change) => {
      if (change.index >= anchorIndex) return sum;
      return sum + change.delta;
    }, 0);

    if (Math.abs(totalDeltaBeforeAnchor) <= 1) {
      return;
    }

    listRef.current?.scrollTo(Math.max(0, outer.scrollTop + totalDeltaBeforeAnchor));
    refreshAnchorSnapshot();
  }, [
    autoFollowEnabled,
    captureAnchorSnapshot,
    listRef,
    outerRef,
    refreshAnchorSnapshot,
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
    if (pinBottomRafRef.current !== null) {
      cancelAnimationFrame(pinBottomRafRef.current);
      pinBottomRafRef.current = null;
    }
    if (anchorRestoreRafRef.current !== null) {
      cancelAnimationFrame(anchorRestoreRafRef.current);
      anchorRestoreRafRef.current = null;
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
    queuedSizeChangesRef.current = [];
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

  React.useEffect(
    () => () => {
      if (pinBottomRafRef.current !== null) {
        cancelAnimationFrame(pinBottomRafRef.current);
      }
      if (anchorRestoreRafRef.current !== null) {
        cancelAnimationFrame(anchorRestoreRafRef.current);
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
