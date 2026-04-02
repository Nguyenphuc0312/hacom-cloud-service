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
import { useScrollAnchorController } from "../../hooks/useScrollAnchorController";
import {
  useMessageGrouping,
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../hooks/useMessageGrouping";
import { useVirtualizedMessages } from "../../hooks/useVirtualizedMessages";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import { formatDateDivider } from "../../utils/formatTime";
import { isFailedMessage, isPendingMessage } from "../../utils/messageTimeline";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";

interface MessageListProps {
  messages: Message[];
  conversationId: string;
  conversationType: Conversation["type"];
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
  composerHeight?: number;
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

const areEqualTimelineRowProps = (
  previousProps: ListChildComponentProps<TimelineRowData>,
  nextProps: ListChildComponentProps<TimelineRowData>,
): boolean => {
  if (previousProps.index !== nextProps.index) {
    return false;
  }

  if (
    previousProps.style.top !== nextProps.style.top ||
    previousProps.style.height !== nextProps.style.height ||
    previousProps.style.width !== nextProps.style.width ||
    previousProps.style.left !== nextProps.style.left
  ) {
    return false;
  }

  const previousItem = previousProps.data.items[previousProps.index];
  const nextItem = nextProps.data.items[nextProps.index];
  if (previousItem !== nextItem) {
    return false;
  }

  const previousMessageId =
    previousItem?.kind === "message" ? previousItem.message.id : null;
  const nextMessageId =
    nextItem?.kind === "message" ? nextItem.message.id : null;
  if (previousMessageId !== nextMessageId) {
    return false;
  }

  const previousSelected = previousMessageId
    ? previousProps.data.selectedMessageIds.has(previousMessageId)
    : false;
  const nextSelected = nextMessageId
    ? nextProps.data.selectedMessageIds.has(nextMessageId)
    : false;
  if (previousSelected !== nextSelected) {
    return false;
  }

  const previousHighlighted =
    previousItem?.kind === "message" &&
    isTargetMessage(previousItem.message, previousProps.data.highlightedMessageId);
  const nextHighlighted =
    nextItem?.kind === "message" &&
    isTargetMessage(nextItem.message, nextProps.data.highlightedMessageId);

  return (
    previousHighlighted === nextHighlighted &&
    previousProps.data.density === nextProps.data.density &&
    previousProps.data.isSelectionMode === nextProps.data.isSelectionMode &&
    previousProps.data.currentUsername === nextProps.data.currentUsername &&
    previousProps.data.onReply === nextProps.data.onReply &&
    previousProps.data.onReact === nextProps.data.onReact &&
    previousProps.data.onEdit === nextProps.data.onEdit &&
    previousProps.data.onDelete === nextProps.data.onDelete &&
    previousProps.data.onImageClick === nextProps.data.onImageClick &&
    previousProps.data.onFilePreview === nextProps.data.onFilePreview &&
    previousProps.data.onToggleSelect === nextProps.data.onToggleSelect &&
    previousProps.data.setItemSize === nextProps.data.setItemSize &&
    previousProps.data.onItemSizeChange === nextProps.data.onItemSizeChange
  );
};

const hasInlineUrl = (content?: string): boolean =>
  typeof content === "string" && /https?:\/\/[^\s]+/i.test(content);

const shouldObserveTimelineItemResize = (item: TimelineItem): boolean => {
  if (item.kind !== "message") {
    return false;
  }

  const message = item.message;
  if (
    message.type === "image" ||
    message.type === "file" ||
    message.type === "voice"
  ) {
    return true;
  }

  return Boolean(
    message.replyToMessage ||
    message.forwardedFrom ||
    (message.reactions?.length ?? 0) > 0 ||
    (message.attachments?.length ?? 0) > 0 ||
    isFailedMessage(message) ||
    isPendingMessage(message) ||
    hasInlineUrl(message.content),
  );
};

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
  if (isFailedMessage(message) || isPendingMessage(message)) baseHeight += 28;

  switch (message.type) {
    case "image":
      baseHeight += 240;
      if (message.content?.trim()) baseHeight += 28;
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
      if (hasInlineUrl(message.content)) {
        baseHeight += 58;
      }
      break;
    }
  }

  return baseHeight;
};

const isTargetMessage = (
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

const TimelineRow: React.FC<ListChildComponentProps<TimelineRowData>> =
  React.memo(({ index, style, data }) => {
    const item = data.items[index];
    const rowRef = React.useRef<HTMLDivElement>(null);
    const { setItemSize } = data;
    const hasCommittedInitialMeasurementRef = React.useRef(false);
    const measuredItemKeyRef = React.useRef<string | null>(null);

    React.useLayoutEffect(() => {
      const node = rowRef.current;
      if (!node || !item) return;
      const currentItemKey = item.key || `${item.kind}-${index}`;

      if (measuredItemKeyRef.current !== currentItemKey) {
        measuredItemKeyRef.current = currentItemKey;
        hasCommittedInitialMeasurementRef.current = false;
      }

      const measure = () => {
        const nextSize = Math.ceil(node.getBoundingClientRect().height);
        const measurement = setItemSize(index, nextSize);
        if (!hasCommittedInitialMeasurementRef.current) {
          hasCommittedInitialMeasurementRef.current = true;
          return;
        }

        if (measurement.changed && Math.abs(measurement.delta) > 1) {
          data.onItemSizeChange({
            index,
            key: currentItemKey,
            delta: measurement.delta,
          });
        }
      };

      measure();

      if (
        typeof ResizeObserver === "undefined" ||
        !shouldObserveTimelineItemResize(item)
      ) {
        const rafId = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(rafId);
      }

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
      return () => resizeObserver.disconnect();
    }, [data.onItemSizeChange, index, item, setItemSize]);

    if (!item) return null;

    const messageId = item.kind === "message" ? item.message.id : undefined;
    const timelineKey = item.key || `${item.kind}-${index}`;
    const isHighlighted =
      item.kind === "message" &&
      isTargetMessage(item.message, data.highlightedMessageId);

    return (
      <div style={style}>
        <div
          ref={rowRef}
          className="flow-root px-[var(--chat-lane-padding)]"
          data-message-id={messageId}
          data-timeline-key={timelineKey}
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
  }, areEqualTimelineRowProps);

TimelineRow.displayName = "TimelineRow";

const toDayKey = (date: Date | null): string => {
  if (!date) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  conversationId,
  conversationType,
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
  composerHeight = 0,
  className,
}) => {
  const { t } = useTranslation();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<VirtualList<TimelineRowData> | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const stickyDateRafRef = React.useRef<number | null>(null);
  const highlightTimerRef = React.useRef<number | null>(null);
  const scrollToBottomRafRef = React.useRef<number | null>(null);
  const capturePrependAnchorRef = React.useRef<() => void>(() => {});
  const restoreAfterPrependRef = React.useRef<() => void>(() => {});
  const captureAnchorCallbackRef = React.useRef<
    | (() => { itemKey: string | null; offsetWithinItem: number } | null)
    | undefined
  >(undefined);
  const timelineItemCountRef = React.useRef(0);
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);

  const flushScrollToBottom = React.useCallback(() => {
    scrollToBottomRafRef.current = null;
    const itemCount = timelineItemCountRef.current;
    if (itemCount === 0) return;

    listRef.current?.scrollToItem(itemCount - 1, "end");
  }, []);

  const scrollToBottom = React.useCallback(
    (_behavior: ScrollBehavior = "auto") => {
      if (scrollToBottomRafRef.current !== null) {
        return;
      }

      scrollToBottomRafRef.current = requestAnimationFrame(flushScrollToBottom);
    },
    [flushScrollToBottom],
  );

  const {
    displayMessages,
    pendingNewMessages,
    showNewMessagesPill,
    showJumpToBottom,
    isAtBottom,
    autoFollowEnabled,
    handleScroll,
    jumpToLatest,
    detachAutoFollow,
    syncDetachedScrollState,
    pendingRestoreAnchor,
    pendingRestoreAnchorVersion,
  } = useAutoScrollToBottom({
    conversationId,
    messages,
    currentUserId,
    hasMore,
    isLoadingMore,
    onLoadMore,
    onBeforeLoadMore: () => {
      capturePrependAnchorRef.current();
    },
    onAfterPrepend: () => {
      restoreAfterPrependRef.current();
    },
    outerRef,
    scrollToBottom,
    captureAnchor: () => captureAnchorCallbackRef.current?.() ?? null,
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
    conversationType,
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
    getItemOffset,
    findItemAtOffset,
    setItemSize,
    clearMeasuredSizes,
  } = useVirtualizedMessages<TimelineItem, TimelineRowData>({
    items: timelineItems,
    viewportRef,
    observeViewport: !isInitialLoading && messages.length > 0,
    debugLabel: conversationId,
    estimateItemSize,
    getItemKey: (item, index) => item.key || `${item.kind}-${index}`,
    listRef,
    outerRef,
  });

  React.useEffect(() => {
    clearMeasuredSizes();
  }, [clearMeasuredSizes, conversationId]);

  const {
    capturePrependAnchor,
    restoreAfterPrepend,
    refreshAnchorSnapshot,
    handleItemSizeChange,
    handleScrollOffset,
  } = useScrollAnchorController<
    TimelineItem,
    TimelineRowData
  >({
    conversationId,
    items: timelineItems,
    getItemKey: (item, index) => item.key || `${item.kind}-${index}`,
    getItemOffset,
    findItemAtOffset,
    listRef,
    outerRef,
    viewportHeight,
    composerHeight,
    autoFollowEnabled,
    isAtBottom,
    scrollToBottom,
    pendingRestoreAnchor,
    pendingRestoreAnchorVersion,
  });

  capturePrependAnchorRef.current = capturePrependAnchor;
  restoreAfterPrependRef.current = restoreAfterPrepend;
  // Update captureAnchorCallbackRef each render so useAutoScrollToBottom can
  // capture the current scroll anchor without a stale-closure issue.
  captureAnchorCallbackRef.current = () => {
    const outer = outerRef.current;
    if (!outer || timelineItems.length === 0) return null;
    const result = findItemAtOffset(outer.scrollTop);
    if (!result) return null;
    const item = timelineItems[result.index];
    const itemKey = item ? item.key || `${item.kind}-${result.index}` : null;
    return { itemKey, offsetWithinItem: result.offsetWithinItem };
  };

  const handleTimelineItemSizeChange = React.useCallback(
    ({ index, delta }: { index: number; key: string; delta: number }) => {
      handleItemSizeChange({ index, delta });
    },
    [handleItemSizeChange],
  );

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
      density,
      isSelectionMode,
      selectedMessageIds,
      onToggleSelect,
      currentUsername,
      highlightedMessageId,
      onItemSizeChange: handleTimelineItemSizeChange,
    }),
    [
      currentUsername,
      density,
      handleTimelineItemSizeChange,
      highlightedMessageId,
      isSelectionMode,
      onDelete,
      onEdit,
      onFilePreview,
      onImageClick,
      onReact,
      onReply,
      onToggleSelect,
      selectedMessageIds,
      setItemSize,
      timelineItems,
    ],
  );

  const handleListScroll = React.useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
      if (scrollUpdateWasRequested) return;
      handleScroll(scrollOffset);
      handleScrollOffset(scrollOffset);

      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      stickyDateRafRef.current = requestAnimationFrame(() => {
        const targetIndex = findItemAtOffset(scrollOffset)?.index ?? 0;

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
    [findItemAtOffset, handleScroll, handleScrollOffset, timelineItems],
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

    detachAutoFollow();
    listRef.current?.scrollToItem(targetIndex, "center");
    setHighlightedMessageId(jumpToMessageId);
    onJumpHandled?.(jumpToMessageId);

    const rafId = requestAnimationFrame(() => {
      syncDetachedScrollState();
      refreshAnchorSnapshot();
    });

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === jumpToMessageId ? null : current,
      );
    }, 1800);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    detachAutoFollow,
    jumpRequestVersion,
    jumpToMessageId,
    onJumpHandled,
    syncDetachedScrollState,
    timelineItems,
    refreshAnchorSnapshot,
  ]);

  React.useEffect(() => {
    if (timelineItems.length === 0) {
      setStickyDate(null);
      return;
    }

    const scrollTop = outerRef.current?.scrollTop ?? 0;
    const targetIndex = findItemAtOffset(scrollTop)?.index ?? 0;

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
  }, [conversationId, findItemAtOffset, timelineItems]);

  React.useEffect(() => {
    if (
      isInitialLoading ||
      messages.length === 0 ||
      pendingNewMessages > 0 ||
      !autoFollowEnabled ||
      !isAtBottom
    ) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage) {
      onReachedLatest?.(latestMessage);
    }
  }, [
    isInitialLoading,
    isAtBottom,
    autoFollowEnabled,
    messages,
    onReachedLatest,
    pendingNewMessages,
  ]);

  React.useEffect(
    () => () => {
      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      if (scrollToBottomRafRef.current !== null) {
        cancelAnimationFrame(scrollToBottomRafRef.current);
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
                  overscanCount={isLoadingMore && !isInitialLoading ? 20 : 8}
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

      {error && messages.length > 0 && topOverlayPlacements.error?.visible && (
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
  previousProps.conversationId === nextProps.conversationId &&
  previousProps.conversationType === nextProps.conversationType &&
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
  previousProps.composerHeight === nextProps.composerHeight &&
  previousProps.className === nextProps.className;

export const MessageList = React.memo(
  MessageListComponent,
  areEqualMessageListProps,
);

export default MessageList;
