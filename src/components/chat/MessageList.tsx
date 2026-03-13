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
  type UnreadTimelineMarker,
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
  setItemSize: (index: number, size: number) => void;
  measureVersion: number;
  density: ChatDensity;
  isSelectionMode: boolean;
  selectedMessageIds: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  currentUsername?: string;
  highlightedMessageId: string | null;
  onTailResize: () => void;
}

const estimateTimelineItemHeight = (item: TimelineItem): number => {
  if (item.kind === "date") return 64;
  if (item.kind === "system") return 68;
  if (item.kind === "unread") return 48;

  const message = item.message;
  let baseHeight = item.isGroupEnd ? 76 : 62;

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
      if (!node) return;

      const measure = () => {
        const nextSize = Math.ceil(node.getBoundingClientRect().height);
        setItemSize(index, nextSize);
        if (index === data.items.length - 1) {
          data.onTailResize();
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
    }, [index, item, setItemSize]);

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
  const tailFollowRafRef = React.useRef<number | null>(null);
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);
  const [timelineMessageCount, setTimelineMessageCount] = React.useState(
    messages.length,
  );

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (timelineMessageCount === 0) return;

      if (behavior === "auto") {
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
    [timelineMessageCount],
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
    unreadMarker,
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
    getItemKey: (item, index) =>
      item.key || `${item.kind}-${index}`,
    listRef,
    outerRef,
  });

  React.useEffect(() => {
    setTimelineMessageCount(timelineItems.length);
  }, [timelineItems.length]);

  React.useEffect(() => {
    clearMeasuredSizes();
  }, [clearMeasuredSizes, conversation.id]);

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
      onTailResize: () => {
        if (
          showJumpToBottom ||
          showNewMessagesPill ||
          pendingNewMessages > 0
        ) {
          return;
        }

        if (tailFollowRafRef.current !== null) {
          cancelAnimationFrame(tailFollowRafRef.current);
        }

        tailFollowRafRef.current = requestAnimationFrame(() => {
          const outer = outerRef.current;
          if (outer) {
            outer.scrollTo({ top: outer.scrollHeight, behavior: "auto" });
          }
          tailFollowRafRef.current = null;
        });
      },
    }),
    [
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
      pendingNewMessages,
      selectedMessageIds,
      setItemSize,
      showJumpToBottom,
      showNewMessagesPill,
      timelineItems,
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

        setStickyDate((previous) =>
          toDayKey(previous) === toDayKey(nextStickyDate)
            ? previous
            : nextStickyDate,
        );
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
  }, [jumpRequestVersion, jumpToMessageId, onJumpHandled, timelineItems]);

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
      if (tailFollowRafRef.current !== null) {
        cancelAnimationFrame(tailFollowRafRef.current);
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

      {!isInitialLoading && messages.length > 0 && stickyDate && (
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

      {error && messages.length > 0 && (
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
            "flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] shadow-elev2",
            "transition-micro hover:bg-white/10 hover:shadow-elev3 hover:-translate-y-0.5",
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
            "flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/8 bg-[hsl(var(--color-chat-pill))] px-3 shadow-elev2",
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
