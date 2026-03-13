import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import {
  VariableSizeList as VirtualList,
  type ListChildComponentProps,
  type ListOnScrollProps,
} from "react-window";
import { MessageItem } from "./MessageItem";
import { EmptyMessages, ErrorState, MessageListSkeleton } from "../ui";
import { ConversationLane } from "../layout/ConversationLane";
import { useAutoScrollToBottom } from "../../hooks/useAutoScrollToBottom";
import {
  useMessageGrouping,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../hooks/useMessageGrouping";
import { useVirtualizedMessages } from "../../hooks/useVirtualizedMessages";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import { formatDateDivider } from "../../utils/formatTime";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";

interface MessageListProps {
  messages: Message[];
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  density?: ChatDensity;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  onReachedLatest?: (latestMessage: Message) => void;
  jumpToMessageId?: string | null;
  jumpRequestVersion?: number;
  onJumpHandled?: (messageId: string) => void;
  className?: string;
}

interface TimelineRowData {
  items: TimelineItem[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  onFilePreview?: (attachment: Attachment) => void;
  setItemSize: (
    index: number,
    size: number,
  ) => {
    changed: boolean;
    previousSize: number;
    nextSize: number;
    delta: number;
  };
  measureVersion: number;
  density: ChatDensity;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  currentUsername?: string;
  highlightedMessageId: string | null;
  onItemSizeChange: (payload: {
    index: number;
    key: string;
    delta: number;
  }) => void;
}

interface AnchorSnapshot {
  itemKey: string | null;
  index: number;
  offsetWithinItem: number;
}

const estimateTimelineItemHeight = (
  item: TimelineItem,
  density: ChatDensity,
): number => {
  if (item.kind === "date") return 64;
  if (item.kind === "system") return 68;
  if (item.kind === "unread") return 48;

  const message = item.message;
  const densityOffset =
    density === "compact" ? -8 : density === "expanded" ? 14 : 0;
  let baseHeight = item.isGroupEnd ? 76 + densityOffset : 62 + densityOffset;

  if (message.replyToMessage) baseHeight += 52;
  if (message.forwardedFrom) baseHeight += 22;
  if ((message.reactions?.length ?? 0) > 0) baseHeight += 32;
  if (!item.isOwn && item.showSenderName) baseHeight += 20;
  if (message.status === "failed") baseHeight += 18;

  switch (message.type) {
    case "image":
      baseHeight += 240;
      break;
    case "file":
      baseHeight += 96;
      break;
    case "voice":
      baseHeight += 82;
      break;
    default: {
      const textLength = message.content?.length ?? 0;
      const approximateLines = Math.max(1, Math.ceil(textLength / 34));
      baseHeight += approximateLines * 18;
      break;
    }
  }

  return baseHeight;
};

const isTargetMessage = (message: Message, targetId: string | null): boolean => {
  if (!targetId) return false;
  return (
    message.id === targetId ||
    message.localId === targetId ||
    message.stableId === targetId ||
    message.clientMessageId === targetId
  );
};

const TimelineRow: React.FC<ListChildComponentProps<TimelineRowData>> =
  React.memo(({ index, style, data }) => {
    const item = data.items[index];
    const rowRef = React.useRef<HTMLDivElement>(null);
    const { setItemSize } = data;

    React.useLayoutEffect(() => {
      const node = rowRef.current;
      if (!node || !item) return;

      const measure = () => {
        const nextSize = Math.ceil(node.getBoundingClientRect().height);
        const measurement = setItemSize(index, nextSize);
        if (measurement.changed && Math.abs(measurement.delta) > 1) {
          data.onItemSizeChange({
            index,
            key: item.key || `${item.kind}-${index}`,
            delta: measurement.delta,
          });
        }
      };

      measure();

      if (typeof ResizeObserver === "undefined") {
        const rafId = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(rafId);
      }

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
      return () => resizeObserver.disconnect();
    }, [data.onItemSizeChange, index, item, setItemSize]);

    if (!item) return null;

    const messageId = item.kind === "message" ? item.message.id : undefined;
    const isHighlighted =
      item.kind === "message" &&
      isTargetMessage(item.message, data.highlightedMessageId);

    return (
      <div style={style}>
        <div
          ref={rowRef}
          className="flow-root px-[var(--chat-lane-padding)]"
          data-message-id={messageId}
        >
          <div className="mx-auto max-w-[var(--chat-content-lane)]">
            <div
              className={clsx(
                isHighlighted &&
                  "rounded-2xl bg-warning/14 ring-2 ring-warning/35 transition-colors duration-300",
              )}
            >
              <MessageItem
                item={item}
                onReply={data.onReply}
                onReact={data.onReact}
                onEdit={data.onEdit}
                onDelete={data.onDelete}
                onImageClick={data.onImageClick}
                onFilePreview={data.onFilePreview}
                density={data.density}
                isSelectionMode={data.isSelectionMode}
                isSelected={
                  messageId ? data.selectedMessageIds.has(messageId) : false
                }
                onToggleSelect={data.onToggleSelect}
                currentUsername={data.currentUsername}
              />
            </div>
          </div>
        </div>
      </div>
    );
  });

TimelineRow.displayName = "TimelineRow";

const toDayKey = (date: Date | null): string => {
  if (!date) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  conversation,
  currentUserId,
  onReply,
  onReact,
  onEdit,
  onDelete,
  hasMore = false,
  isLoadingMore = false,
  isInitialLoading = false,
  onLoadMore,
  onImageClick,
  onFilePreview,
  error,
  onRetry,
  density = "comfortable",
  isSelectionMode = false,
  selectedMessageIds = new Set<string>(),
  onToggleSelect,
  currentUsername,
  unreadMarker,
  onReachedLatest,
  jumpToMessageId,
  jumpRequestVersion = 0,
  onJumpHandled,
  className,
}) => {
  const { t } = useTranslation();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<VirtualList<TimelineRowData> | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const stickyDateRafRef = React.useRef<number | null>(null);
  const highlightTimerRef = React.useRef<number | null>(null);
  const anchorAdjustRafRef = React.useRef<number | null>(null);
  const pinBottomRafRef = React.useRef<number | null>(null);
  const anchorSnapshotRef = React.useRef<AnchorSnapshot | null>(null);
  const captureAnchorSnapshotRef = React.useRef<() => AnchorSnapshot | null>(
    () => null,
  );
  const scheduleAnchorRestoreRef = React.useRef<() => void>(() => {});
  const pendingPrependRestoreRef = React.useRef(false);
  const previousViewportHeightRef = React.useRef(0);
  const timelineItemCountRef = React.useRef(0);
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const itemCount = timelineItemCountRef.current;
      if (itemCount === 0) return;

      if (behavior === "auto") {
        listRef.current?.scrollToItem(itemCount - 1, "end");
      } else {
        const outer = outerRef.current;
        if (outer) {
          outer.scrollTo({ top: outer.scrollHeight, behavior });
        } else {
          listRef.current?.scrollToItem(itemCount - 1, "end");
        }
      }
    },
    [],
  );

  const {
    displayMessages,
    pendingNewMessages,
    showNewMessagesPill,
    showJumpToBottom,
    handleScroll,
    jumpToLatest,
  } = useAutoScrollToBottom({
    conversationId: conversation.id,
    messages,
    currentUserId,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onBeforeLoadMore: () => {
      captureAnchorSnapshotRef.current();
      pendingPrependRestoreRef.current = true;
    },
    onAfterPrepend: () => {
      if (!pendingPrependRestoreRef.current) return;
      pendingPrependRestoreRef.current = false;
      scheduleAnchorRestoreRef.current();
    },
    outerRef,
    scrollToBottom,
  });
  const topOverlayPlacements = React.useMemo(
    () =>
      resolveOverlayPlacements([
        {
          id: "error",
          visible: Boolean(error && messages.length > 0),
          priority: 100,
          slot: "top-center",
        },
        {
          id: "loading",
          visible: isLoadingMore && !isInitialLoading,
          priority: 80,
          slot: "top-center",
        },
        {
          id: "sticky-date",
          visible:
            !isInitialLoading && messages.length > 0 && Boolean(stickyDate),
          priority: 30,
          slot: "top-center",
        },
      ]),
    [error, isInitialLoading, isLoadingMore, messages.length, stickyDate],
  );
  const bottomOverlayPlacements = React.useMemo(
    () =>
      resolveOverlayPlacements([
        {
          id: "new-pill",
          visible: showNewMessagesPill && pendingNewMessages > 0,
          priority: 95,
          slot: "bottom-right",
        },
        {
          id: "jump-latest",
          visible: showJumpToBottom && !showNewMessagesPill,
          priority: 70,
          slot: "bottom-right",
        },
      ]),
    [pendingNewMessages, showJumpToBottom, showNewMessagesPill],
  );

  const timelineItems = useMessageGrouping({
    messages: displayMessages,
    currentUserId,
    conversationType: conversation.type,
    unreadMarker,
  });
  timelineItemCountRef.current = timelineItems.length;
  const estimateItemSize = React.useCallback(
    (item: TimelineItem) => estimateTimelineItemHeight(item, density),
    [density],
  );

  const {
    viewportHeight,
    getItemSize,
    setItemSize,
    clearMeasuredSizes,
    measureVersion,
  } = useVirtualizedMessages<TimelineItem, TimelineRowData>({
    items: timelineItems,
    viewportRef,
    estimateItemSize,
    getItemKey: (item, index) =>
      item.key || `${item.kind}-${index}`,
    listRef,
      outerRef,
  });
  const shouldPinBottom =
    !showJumpToBottom &&
    !showNewMessagesPill &&
    pendingNewMessages === 0;

  const getItemOffset = React.useCallback(
    (targetIndex: number): number => {
      let accumulatedHeight = 0;
      for (let index = 0; index < targetIndex; index += 1) {
        accumulatedHeight += Math.max(1, Math.ceil(getItemSize(index)));
      }
      return accumulatedHeight;
    },
    [getItemSize],
  );

  const findAnchorFromScrollTop = React.useCallback(
    (scrollTop: number): AnchorSnapshot | null => {
      if (timelineItems.length === 0) return null;

      let accumulatedHeight = 0;
      let targetIndex = 0;

      for (let index = 0; index < timelineItems.length; index += 1) {
        const rowHeight = Math.max(1, Math.ceil(getItemSize(index)));
        if (accumulatedHeight + rowHeight > scrollTop + 1) {
          targetIndex = index;
          break;
        }
        accumulatedHeight += rowHeight;
        targetIndex = index;
      }

      const item = timelineItems[targetIndex];
      if (!item) return null;

      return {
        itemKey: item.key ?? null,
        index: targetIndex,
        offsetWithinItem: Math.max(0, scrollTop - accumulatedHeight),
      };
    },
    [getItemSize, timelineItems],
  );

  const resolveAnchorIndex = React.useCallback(
    (snapshot: AnchorSnapshot | null): number => {
      if (!snapshot || timelineItems.length === 0) return -1;

      if (snapshot.itemKey) {
        const byKeyIndex = timelineItems.findIndex(
          (item) => (item.key ?? null) === snapshot.itemKey,
        );
        if (byKeyIndex >= 0) return byKeyIndex;
      }

      return Math.min(snapshot.index, timelineItems.length - 1);
    },
    [timelineItems],
  );

  const captureAnchorSnapshot = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer) return null;

    const snapshot = findAnchorFromScrollTop(outer.scrollTop);
    anchorSnapshotRef.current = snapshot;
    return snapshot;
  }, [findAnchorFromScrollTop, outerRef]);

  const scheduleAnchorSnapshotRefresh = React.useCallback(() => {
    requestAnimationFrame(() => {
      captureAnchorSnapshot();
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
    if (anchorAdjustRafRef.current !== null) {
      cancelAnimationFrame(anchorAdjustRafRef.current);
    }

    anchorAdjustRafRef.current = requestAnimationFrame(() => {
      const outer = outerRef.current;
      const snapshot = anchorSnapshotRef.current;
      if (!outer || !snapshot) {
        anchorAdjustRafRef.current = null;
        return;
      }

      const anchorIndex = resolveAnchorIndex(snapshot);
      if (anchorIndex < 0) {
        anchorAdjustRafRef.current = null;
        return;
      }

      const nextOffset =
        getItemOffset(anchorIndex) + snapshot.offsetWithinItem;
      listRef.current?.scrollTo(Math.max(0, nextOffset));
      anchorAdjustRafRef.current = null;
      scheduleAnchorSnapshotRefresh();
    });
  }, [
    getItemOffset,
    listRef,
    outerRef,
    resolveAnchorIndex,
    scheduleAnchorSnapshotRefresh,
  ]);

  captureAnchorSnapshotRef.current = captureAnchorSnapshot;
  scheduleAnchorRestoreRef.current = scheduleAnchorRestore;

  React.useEffect(() => {
    clearMeasuredSizes();
    anchorSnapshotRef.current = null;
    pendingPrependRestoreRef.current = false;
    previousViewportHeightRef.current = 0;
  }, [clearMeasuredSizes, conversation.id]);

  React.useEffect(() => {
    if (timelineItems.length === 0) {
      anchorSnapshotRef.current = null;
      return;
    }

    if (shouldPinBottom) {
      schedulePinToBottom();
      return;
    }

    if (!anchorSnapshotRef.current) {
      captureAnchorSnapshot();
    }
  }, [
    captureAnchorSnapshot,
    schedulePinToBottom,
    shouldPinBottom,
    timelineItems.length,
  ]);

  React.useLayoutEffect(() => {
    if (viewportHeight <= 0) return;

    const previousViewportHeight = previousViewportHeightRef.current;
    previousViewportHeightRef.current = viewportHeight;

    if (previousViewportHeight <= 0 || previousViewportHeight === viewportHeight) {
      return;
    }

    if (shouldPinBottom) {
      schedulePinToBottom();
      return;
    }

    scheduleAnchorRestore();
  }, [scheduleAnchorRestore, schedulePinToBottom, shouldPinBottom, viewportHeight]);

  const rowData = React.useMemo<TimelineRowData>(
    () => ({
      items: timelineItems,
      onReply,
      onReact,
      onEdit,
      onDelete,
      onImageClick,
      onFilePreview,
      setItemSize,
      measureVersion,
      density,
      isSelectionMode,
      selectedMessageIds,
      onToggleSelect,
      currentUsername,
      highlightedMessageId,
      onItemSizeChange: ({ index, delta }) => {
        const outer = outerRef.current;
        if (!outer || Math.abs(delta) <= 1) {
          return;
        }

        if (shouldPinBottom) {
          schedulePinToBottom();
          return;
        }

        const snapshot =
          anchorSnapshotRef.current ?? captureAnchorSnapshotRef.current();
        if (!snapshot) return;

        const anchorIndex = resolveAnchorIndex(snapshot);
        if (anchorIndex < 0) return;

        if (index < anchorIndex) {
          listRef.current?.scrollTo(Math.max(0, outer.scrollTop + delta));
          scheduleAnchorSnapshotRefresh();
          return;
        }

        if (index === anchorIndex) {
          scheduleAnchorRestore();
        }
      },
    }),
    [
      captureAnchorSnapshotRef,
      currentUsername,
      density,
      highlightedMessageId,
      isSelectionMode,
      measureVersion,
      onDelete,
      onEdit,
      onFilePreview,
      onImageClick,
      onReact,
      onReply,
      onToggleSelect,
      outerRef,
      resolveAnchorIndex,
      scheduleAnchorRestore,
      scheduleAnchorSnapshotRefresh,
      schedulePinToBottom,
      selectedMessageIds,
      setItemSize,
      shouldPinBottom,
      timelineItems,
    ],
  );

  const handleListScroll = React.useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
      if (scrollUpdateWasRequested) return;
      handleScroll(scrollOffset);
      anchorSnapshotRef.current = findAnchorFromScrollTop(scrollOffset);

      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      stickyDateRafRef.current = requestAnimationFrame(() => {
        let accumulatedHeight = 0;
        let targetIndex = 0;

        for (let index = 0; index < timelineItems.length; index += 1) {
          const rowHeight = Math.max(1, Math.ceil(getItemSize(index)));
          if (accumulatedHeight + rowHeight > scrollOffset + 1) {
            targetIndex = index;
            break;
          }
          accumulatedHeight += rowHeight;
          targetIndex = index;
        }

        let nextStickyDate: Date | null = null;
        for (let index = targetIndex; index >= 0; index -= 1) {
          const item = timelineItems[index];
          if (!item) continue;
          if (item.kind === "date") {
            nextStickyDate = item.date;
            break;
          }
          if (item.kind === "message" || item.kind === "system") {
            nextStickyDate = new Date(item.message.createdAt);
            break;
          }
        }

        setStickyDate((previous) =>
          toDayKey(previous) === toDayKey(nextStickyDate)
            ? previous
            : nextStickyDate,
        );
        stickyDateRafRef.current = null;
      });
    },
    [findAnchorFromScrollTop, getItemSize, handleScroll, timelineItems],
  );

  const handleRetry = React.useCallback(() => {
    if (!onRetry) return;
    void Promise.resolve(onRetry());
  }, [onRetry]);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const outer = outerRef.current;
      if (!outer || event.altKey || event.ctrlKey || event.metaKey) return;

      switch (event.key) {
        case "End":
          event.preventDefault();
          jumpToLatest("smooth");
          break;
        case "Home":
          event.preventDefault();
          outer.scrollTo({ top: 0, behavior: "smooth" });
          break;
        case "PageDown":
          event.preventDefault();
          outer.scrollBy({
            top: Math.round(outer.clientHeight * 0.9),
            behavior: "smooth",
          });
          break;
        case "PageUp":
          event.preventDefault();
          outer.scrollBy({
            top: -Math.round(outer.clientHeight * 0.9),
            behavior: "smooth",
          });
          break;
        default:
          break;
      }
    },
    [jumpToLatest],
  );

  React.useEffect(() => {
    if (!jumpToMessageId) return;
    const targetIndex = timelineItems.findIndex(
      (item) =>
        item.kind === "message" &&
        isTargetMessage(item.message, jumpToMessageId),
    );
    if (targetIndex < 0) return;

    listRef.current?.scrollToItem(targetIndex, "center");
    scheduleAnchorSnapshotRefresh();
    setHighlightedMessageId(jumpToMessageId);
    onJumpHandled?.(jumpToMessageId);

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === jumpToMessageId ? null : current,
      );
    }, 1800);
  }, [
    jumpRequestVersion,
    jumpToMessageId,
    onJumpHandled,
    scheduleAnchorSnapshotRefresh,
    timelineItems,
  ]);

  React.useEffect(() => {
    if (timelineItems.length === 0) {
      setStickyDate(null);
      return;
    }

    const scrollTop = outerRef.current?.scrollTop ?? 0;
    let accumulatedHeight = 0;
    let targetIndex = 0;
    for (let index = 0; index < timelineItems.length; index += 1) {
      const rowHeight = Math.max(1, Math.ceil(getItemSize(index)));
      if (accumulatedHeight + rowHeight > scrollTop + 1) {
        targetIndex = index;
        break;
      }
      accumulatedHeight += rowHeight;
      targetIndex = index;
    }

    for (let index = targetIndex; index >= 0; index -= 1) {
      const item = timelineItems[index];
      if (!item) continue;
      if (item.kind === "date") {
        setStickyDate(item.date);
        return;
      }
      if (item.kind === "message" || item.kind === "system") {
        setStickyDate(new Date(item.message.createdAt));
        return;
      }
    }

    setStickyDate(null);
  }, [conversation.id, getItemSize, timelineItems]);

  React.useEffect(() => {
    if (
      isInitialLoading ||
      messages.length === 0 ||
      showJumpToBottom ||
      showNewMessagesPill ||
      pendingNewMessages > 0
    ) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage) {
      onReachedLatest?.(latestMessage);
    }
  }, [
    isInitialLoading,
    messages,
    onReachedLatest,
    pendingNewMessages,
    showJumpToBottom,
    showNewMessagesPill,
  ]);

  React.useEffect(
    () => () => {
      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      if (anchorAdjustRafRef.current !== null) {
        cancelAnimationFrame(anchorAdjustRafRef.current);
      }
      if (pinBottomRafRef.current !== null) {
        cancelAnimationFrame(pinBottomRafRef.current);
      }
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  return (
    <section className={clsx("relative h-full min-h-0 flex-1", className)}>
      {isInitialLoading && (
        <div className="chat-background h-full min-h-0 overflow-y-auto px-[var(--chat-lane-padding)] py-4">
          <MessageListSkeleton />
        </div>
      )}

      {!isInitialLoading && (
        <div
          className="chat-background h-full min-h-0 overflow-hidden pb-3 pt-2"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-busy={isLoadingMore}
          aria-label={t("chat:message.inConversationAria")}
        >
          {error && messages.length === 0 ? (
            <ErrorState
              message={error}
              onRetry={onRetry ? handleRetry : undefined}
            />
          ) : messages.length === 0 ? (
            <EmptyMessages />
          ) : (
            <div
              ref={viewportRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className={clsx(
                "h-full min-h-0 rounded-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-focus/30",
              )}
            >
              {viewportHeight > 0 && (
                <VirtualList
                  ref={listRef}
                  outerRef={outerRef}
                  height={viewportHeight}
                  width="100%"
                  itemCount={timelineItems.length}
                  itemSize={getItemSize}
                  itemData={rowData}
                  itemKey={(index, data) => data.items[index]?.key ?? index}
                  onScroll={handleListScroll}
                  overscanCount={8}
                >
                  {TimelineRow}
                </VirtualList>
              )}
            </div>
          )}
        </div>
      )}

      {!isInitialLoading &&
        messages.length > 0 &&
        stickyDate &&
        topOverlayPlacements["sticky-date"]?.visible && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[5] -translate-x-1/2">
          <div
            className="rounded-full border px-3.5 py-1 text-[11px] font-medium text-text-secondary shadow-xs backdrop-blur"
            style={{
              backgroundColor: "hsl(var(--color-chat-pill) / 0.94)",
              borderColor: "hsl(var(--color-chat-pill-border) / 0.7)",
            }}
          >
            {formatDateDivider(stickyDate)}
          </div>
        </div>
      )}

      {error &&
        messages.length > 0 &&
        topOverlayPlacements.error?.visible && (
        <div className="pointer-events-none absolute inset-x-[var(--chat-lane-padding)] top-2 z-sticky flex justify-center">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-danger/25 bg-surface/95 px-3 py-1 shadow-xs backdrop-blur">
            <span className="truncate text-xs text-danger">{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-primary transition-micro hover:bg-surface-overlay active:scale-95"
              >
                {t("common:actions.retry")}
              </button>
            )}
          </div>
        </div>
      )}

      {isLoadingMore &&
        !isInitialLoading &&
        topOverlayPlacements.loading?.visible && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-4 py-1.5 text-xs text-text-secondary shadow-xs animate-slide-up-fade">
          {t("chat:message.loadMore")}
        </div>
      )}

      {bottomOverlayPlacements["jump-latest"]?.visible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-sticky">
          <ConversationLane>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => jumpToLatest("smooth")}
                className={clsx(
                  "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] shadow-elev2",
                  "transition-micro hover:bg-white/10 hover:shadow-elev3 hover:-translate-y-0.5",
                  "active:scale-95",
                  "animate-slide-up-fade",
                )}
                aria-label={t("chat:message.jumpToLatest")}
              >
                <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
              </button>
            </div>
          </ConversationLane>
        </div>
      )}

      {bottomOverlayPlacements["new-pill"]?.visible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-sticky">
          <ConversationLane>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => jumpToLatest("smooth")}
                className={clsx(
                  "pointer-events-auto flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] px-3 shadow-elev2",
                  "transition-micro hover:bg-white/10 hover:shadow-elev3 hover:-translate-y-0.5",
                  "active:scale-95",
                  "animate-slide-up-fade",
                )}
                aria-label={t("chat:message.newAria")}
              >
                <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
                <span className="text-xs font-medium text-text-primary">
                  {t("chat:message.newLabel", { count: pendingNewMessages })}
                </span>
              </button>
            </div>
          </ConversationLane>
        </div>
      )}
    </section>
  );
};

const areEqualMessageListProps = (
  previousProps: MessageListProps,
  nextProps: MessageListProps,
): boolean =>
  previousProps.messages === nextProps.messages &&
  previousProps.conversation === nextProps.conversation &&
  previousProps.currentUserId === nextProps.currentUserId &&
  previousProps.onReply === nextProps.onReply &&
  previousProps.onReact === nextProps.onReact &&
  previousProps.onEdit === nextProps.onEdit &&
  previousProps.onDelete === nextProps.onDelete &&
  previousProps.hasMore === nextProps.hasMore &&
  previousProps.isLoadingMore === nextProps.isLoadingMore &&
  previousProps.isInitialLoading === nextProps.isInitialLoading &&
  previousProps.onLoadMore === nextProps.onLoadMore &&
  previousProps.onImageClick === nextProps.onImageClick &&
  previousProps.onFilePreview === nextProps.onFilePreview &&
  previousProps.error === nextProps.error &&
  previousProps.onRetry === nextProps.onRetry &&
  previousProps.density === nextProps.density &&
  previousProps.isSelectionMode === nextProps.isSelectionMode &&
  previousProps.selectedMessageIds === nextProps.selectedMessageIds &&
  previousProps.onToggleSelect === nextProps.onToggleSelect &&
  previousProps.currentUsername === nextProps.currentUsername &&
  previousProps.unreadMarker === nextProps.unreadMarker &&
  previousProps.onReachedLatest === nextProps.onReachedLatest &&
  previousProps.jumpToMessageId === nextProps.jumpToMessageId &&
  previousProps.jumpRequestVersion === nextProps.jumpRequestVersion &&
  previousProps.onJumpHandled === nextProps.onJumpHandled &&
  previousProps.className === nextProps.className;

export const MessageList = React.memo(
  MessageListComponent,
  areEqualMessageListProps,
);

export default MessageList;
