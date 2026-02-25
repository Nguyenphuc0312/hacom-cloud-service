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
import type { Conversation, Message } from "../../types";

interface MessageListProps {
  messages: Message[];
  conversation: Conversation;
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onImageClick?: (imageUrl: string) => void;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
  className?: string;
}

interface TimelineRowData {
  items: TimelineItem[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onImageClick?: (imageUrl: string) => void;
  setItemSize: (index: number, size: number) => void;
  measureVersion: number;
}

const estimateTimelineItemHeight = (item: TimelineItem): number => {
  if (item.kind === "date") return 54;
  if (item.kind === "system") return 44;

  const message = item.message;
  let baseHeight = item.isGroupEnd ? 84 : 70;

  if (message.replyToMessage) baseHeight += 34;
  if (message.forwardedFrom) baseHeight += 20;
  if ((message.reactions?.length ?? 0) > 0) baseHeight += 30;
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

const TimelineRow: React.FC<ListChildComponentProps<TimelineRowData>> = React.memo(
  ({ index, style, data }) => {
    const item = data.items[index];
    const rowRef = React.useRef<HTMLDivElement>(null);

    React.useLayoutEffect(() => {
      if (!rowRef.current) return;
      const nextSize = Math.ceil(rowRef.current.getBoundingClientRect().height);
      data.setItemSize(index, nextSize);
    }, [data, data.measureVersion, index, item]);

    if (!item) return null;

    return (
      <div style={style}>
        <div ref={rowRef}>
          <MessageItem
            item={item}
            onReply={data.onReply}
            onReact={data.onReact}
            onImageClick={data.onImageClick}
          />
        </div>
      </div>
    );
  },
);

TimelineRow.displayName = "TimelineRow";

const MessageListComponent: React.FC<MessageListProps> = ({
  messages,
  conversation,
  currentUserId,
  onReply,
  onReact,
  hasMore = false,
  isLoadingMore = false,
  isInitialLoading = false,
  onLoadMore,
  onImageClick,
  error,
  onRetry,
  className,
}) => {
  const { t } = useTranslation();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const timelineItems = useMessageGrouping({
    messages,
    currentUserId,
    conversationType: conversation.type,
  });

  const {
    listRef,
    outerRef,
    viewportHeight,
    getItemSize,
    setItemSize,
    clearMeasuredSizes,
    measureVersion,
  } = useVirtualizedMessages<TimelineItem, TimelineRowData>({
    items: timelineItems,
    viewportRef,
    estimateItemSize: estimateTimelineItemHeight,
  });

  const scrollToBottom = React.useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const outer = outerRef.current;
      if (outer) {
        outer.scrollTo({ top: outer.scrollHeight, behavior });
        return;
      }

      if (timelineItems.length > 0) {
        listRef.current?.scrollToItem(timelineItems.length - 1, "end");
      }
    },
    [timelineItems.length, listRef, outerRef],
  );

  const {
    pendingNewMessages,
    showNewMessagesPill,
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

  React.useEffect(() => {
    clearMeasuredSizes();
  }, [conversation.id, clearMeasuredSizes]);

  const rowData = React.useMemo<TimelineRowData>(
    () => ({
      items: timelineItems,
      onReply,
      onReact,
      onImageClick,
      setItemSize,
      measureVersion,
    }),
    [timelineItems, onReply, onReact, onImageClick, setItemSize, measureVersion],
  );

  const handleListScroll = React.useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
      if (scrollUpdateWasRequested) return;
      handleScroll(scrollOffset);
    },
    [handleScroll],
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
            <ErrorState message={error} onRetry={onRetry ? handleRetry : undefined} />
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
                  overscanCount={12}
                >
                  {TimelineRow}
                </VirtualList>
              )}
            </div>
          )}
        </div>
      )}

      {error && messages.length > 0 && (
        <div className="pointer-events-none absolute inset-x-4 top-2 z-sticky flex justify-center">
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-1 shadow-xs backdrop-blur">
            <span className="truncate text-xs text-text-secondary">{error}</span>
            {onRetry && (
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-surface-overlay"
              >
                {t("common:actions.retry")}
              </button>
            )}
          </div>
        </div>
      )}

      {isLoadingMore && !isInitialLoading && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full border border-border bg-surface/90 px-3 py-1 text-xs text-text-muted shadow-xs">
          {t("chat:message.loadMore")}
        </div>
      )}

      {showNewMessagesPill && pendingNewMessages > 0 && (
        <button
          type="button"
          onClick={() => jumpToLatest("smooth")}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "flex min-h-10 items-center justify-center gap-2 rounded-full border border-border bg-surface px-3 shadow-elev2",
            "transition-colors hover:bg-surface-overlay",
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
  previousProps.hasMore === nextProps.hasMore &&
  previousProps.isLoadingMore === nextProps.isLoadingMore &&
  previousProps.isInitialLoading === nextProps.isInitialLoading &&
  previousProps.onLoadMore === nextProps.onLoadMore &&
  previousProps.onImageClick === nextProps.onImageClick &&
  previousProps.error === nextProps.error &&
  previousProps.onRetry === nextProps.onRetry &&
  previousProps.className === nextProps.className;

export const MessageList = React.memo(
  MessageListComponent,
  areEqualMessageListProps,
);

export default MessageList;
