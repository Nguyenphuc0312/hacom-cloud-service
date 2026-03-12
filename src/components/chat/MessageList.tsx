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
import { useAutoScrollToBottom } from "../../hooks/useAutoScrollToBottom";
import {
  useMessageGrouping,
  type TimelineItem,
} from "../../hooks/useMessageGrouping";
import { useVirtualizedMessages } from "../../hooks/useVirtualizedMessages";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import { formatDateDivider } from "../../utils/formatTime";

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
  setItemSize: (index: number, size: number) => void;
  measureVersion: number;
  density: ChatDensity;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  currentUsername?: string;
}

const estimateTimelineItemHeight = (item: TimelineItem): number => {
  // Estimates include child margins (captured by flow-root on the row wrapper)
  if (item.kind === "date") return 64; // DateDivider: my-4 (32px) + pill ~32px
  if (item.kind === "system") return 60; // SystemMessage: my-4 (32px) + pill ~28px
  if (item.kind === "unread") return 40;

  const message = item.message;
  const marginBottom = item.isGroupEnd ? 8 : 2; // mb-2 / mb-0.5
  let baseHeight = (item.isGroupEnd ? 56 : 44) + marginBottom;

  if (message.replyToMessage) baseHeight += 34;
  if (message.forwardedFrom) baseHeight += 20;
  if ((message.reactions?.length ?? 0) > 0) baseHeight += 28;
  if (!item.isOwn && item.showSenderName) baseHeight += 18;

  switch (message.type) {
    case "image":
      baseHeight += 220;
      break;
    case "file":
      baseHeight += 84;
      break;
    case "voice":
      baseHeight += 74;
      break;
    default: {
      const textLength = message.content?.length ?? 0;
      const approximateLines = Math.max(1, Math.ceil(textLength / 36));
      baseHeight += approximateLines * 18;
      break;
    }
  }

  return baseHeight;
};

const TimelineRow: React.FC<ListChildComponentProps<TimelineRowData>> =
  React.memo(({ index, style, data }) => {
    const item = data.items[index];
    const rowRef = React.useRef<HTMLDivElement>(null);
    const { setItemSize, measureVersion } = data;

    React.useLayoutEffect(() => {
      if (!rowRef.current) return;
      const nextSize = Math.ceil(rowRef.current.getBoundingClientRect().height);
      setItemSize(index, nextSize);
    }, [setItemSize, measureVersion, index, item]);

    if (!item) return null;

    const messageId = item.kind === "message" ? item.message.id : undefined;

    return (
      <div style={style}>
        <div ref={rowRef} className="flow-root">
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
    );
  });

TimelineRow.displayName = "TimelineRow";

const toDayKey = (date: Date | null): string => {
  if (!date) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const isMessageDebugEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get("debugMessages") === "1"
  );
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
  className,
}) => {
  const { t } = useTranslation();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<VirtualList<TimelineRowData> | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const stickyDateRafRef = React.useRef<number | null>(null);
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);

  const [timelineMessageCount, setTimelineMessageCount] = React.useState(
    messages.length,
  );

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (timelineMessageCount === 0) return;

      if (behavior === "auto") {
        // For instant scrolls, use react-window's scrollToItem for reliability
        // because outerRef.scrollHeight may be based on estimated sizes
        listRef.current?.scrollToItem(timelineMessageCount - 1, "end");
      } else {
        const outer = outerRef.current;
        if (outer) {
          outer.scrollTo({ top: outer.scrollHeight, behavior });
        } else {
          listRef.current?.scrollToItem(timelineMessageCount - 1, "end");
        }
      }
    },
    [timelineMessageCount, listRef, outerRef],
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
    outerRef,
    scrollToBottom,
  });

  const timelineItems = useMessageGrouping({
    messages: displayMessages,
    currentUserId,
    conversationType: conversation.type,
  });

  const {
    viewportHeight,
    getItemSize,
    setItemSize,
    clearMeasuredSizes,
    measureVersion,
  } = useVirtualizedMessages<TimelineItem, TimelineRowData>({
    items: timelineItems,
    viewportRef,
    estimateItemSize: estimateTimelineItemHeight,
    listRef,
    outerRef,
  });

  React.useEffect(() => {
    setTimelineMessageCount(timelineItems.length);
  }, [timelineItems.length]);

  React.useEffect(() => {
    clearMeasuredSizes();
  }, [conversation.id, clearMeasuredSizes]);

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
    }),
    [
      timelineItems,
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
    ],
  );

  const handleListScroll = React.useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
      if (scrollUpdateWasRequested) return;
      handleScroll(scrollOffset);

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

        setStickyDate((previous) => {
          if (toDayKey(previous) === toDayKey(nextStickyDate)) {
            return previous;
          }
          return nextStickyDate;
        });
        stickyDateRafRef.current = null;
      });
    },
    [getItemSize, handleScroll, timelineItems],
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
        case "ArrowDown":
          event.preventDefault();
          outer.scrollBy({ top: 72, behavior: "smooth" });
          break;
        case "ArrowUp":
          event.preventDefault();
          outer.scrollBy({ top: -72, behavior: "smooth" });
          break;
        default:
          break;
      }
    },
    [jumpToLatest, outerRef],
  );

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
  }, [conversation.id, getItemSize, outerRef, timelineItems]);

  React.useEffect(() => {
    if (!isMessageDebugEnabled()) return;
    if (messages.length === 0) return;
    if (viewportHeight > 0) return;

    // eslint-disable-next-line no-debugger
    debugger;
  }, [messages.length, viewportHeight]);

  React.useEffect(() => {
    return () => {
      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
    };
  }, []);

  return (
    <section className={clsx("relative h-full min-h-0 flex-1", className)}>
      {isInitialLoading && (
        <div className="chat-background h-full min-h-0 overflow-y-auto px-4 py-4">
          <MessageListSkeleton />
        </div>
      )}

      {!isInitialLoading && (
        <div
          className="chat-background h-full min-h-0 overflow-hidden px-4 py-4"
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
                  onScroll={handleListScroll}
                  overscanCount={6}
                >
                  {TimelineRow}
                </VirtualList>
              )}
            </div>
          )}
        </div>
      )}

      {!isInitialLoading && messages.length > 0 && stickyDate && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[5] -translate-x-1/2">
          <div className="rounded-full border border-border bg-surface/92 px-4 py-1.5 text-xs font-medium text-text-secondary shadow-xs backdrop-blur">
            {formatDateDivider(stickyDate)}
          </div>
        </div>
      )}

      {error && messages.length > 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-2 z-sticky flex justify-center">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1 shadow-xs backdrop-blur">
            <span className="truncate text-xs text-text-secondary">
              {error}
            </span>
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

      {isLoadingMore && !isInitialLoading && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-4 py-1.5 text-xs text-text-secondary shadow-xs animate-slide-up-fade">
          {t("chat:message.loadMore")}
        </div>
      )}

      {showJumpToBottom && !showNewMessagesPill && (
        <button
          type="button"
          onClick={() => jumpToLatest("smooth")}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface shadow-elev2",
            "transition-micro hover:bg-surface-overlay hover:shadow-elev3 hover:-translate-y-0.5",
            "active:scale-95",
            "animate-slide-up-fade",
          )}
          aria-label={t("chat:message.jumpToLatest")}
        >
          <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
        </button>
      )}

      {showNewMessagesPill && pendingNewMessages > 0 && (
        <button
          type="button"
          onClick={() => jumpToLatest("smooth")}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 shadow-elev2",
            "transition-micro hover:bg-surface-overlay hover:shadow-elev3 hover:-translate-y-0.5",
            "active:scale-95",
            "animate-bounce-in",
          )}
          aria-label={t("chat:message.newAria")}
        >
          <ChevronDownIcon className="h-5 w-5 text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">
            {t("chat:message.newLabel", { count: pendingNewMessages })}
          </span>
        </button>
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
  previousProps.className === nextProps.className;

export const MessageList = React.memo(
  MessageListComponent,
  areEqualMessageListProps,
);

export default MessageList;
