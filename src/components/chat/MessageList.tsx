import React from "react";
import clsx from "clsx";
import { ChevronDownIcon } from "@heroicons/react/24/solid";
import {
  VariableSizeList as VirtualList,
  type ListChildComponentProps,
  type ListOnScrollProps,
} from "react-window";
import { MessageBubble } from "./MessageBubble";
import { DateDivider } from "./DateDivider";
import { SystemMessage } from "../message/SystemMessage";
import { EmptyMessages, MessageListSkeleton } from "../ui";
import type { Message, Conversation } from "../../types";
import {
  shouldShowDateDivider,
  shouldShowAvatar,
} from "../../utils/messageHelpers";
import { isSameDay } from "../../utils/formatTime";

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
  className?: string;
}

type TimelineItem =
  | { kind: "date"; key: string; date: Date }
  | { kind: "system"; key: string; message: Message }
  | {
      kind: "message";
      key: string;
      message: Message;
      isOwn: boolean;
      showAvatar: boolean;
      showSenderName: boolean;
      isGroupStart: boolean;
      isGroupEnd: boolean;
      conversationType: Conversation["type"];
    };

interface TimelineRowData {
  items: TimelineItem[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onImageClick?: (imageUrl: string) => void;
  setItemSize: (index: number, size: number) => void;
  measureVersion: number;
}

const estimateMessageHeight = (item: TimelineItem): number => {
  if (item.kind === "date") return 54;
  if (item.kind === "system") return 44;

  const message = item.message;
  let baseHeight = item.isGroupEnd ? 84 : 72;

  if (message.replyToMessage) baseHeight += 32;
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
          {item.kind === "date" && <DateDivider date={item.date} />}

          {item.kind === "system" && (
            <SystemMessage message={item.message} className="my-4" />
          )}

          {item.kind === "message" && (
            <div className={clsx(item.isGroupEnd ? "mb-3" : "mb-1")}>
              <MessageBubble
                message={item.message}
                isOwn={item.isOwn}
                showAvatar={item.showAvatar}
                showSenderName={item.showSenderName}
                isGroupStart={item.isGroupStart}
                isGroupEnd={item.isGroupEnd}
                conversationType={item.conversationType}
                onReply={data.onReply}
                onReact={data.onReact}
                onImageClick={data.onImageClick}
              />
            </div>
          )}
        </div>
      </div>
    );
  },
);

TimelineRow.displayName = "TimelineRow";

export const MessageList: React.FC<MessageListProps> = ({
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
  className,
}) => {
  const listRef = React.useRef<VirtualList<TimelineRowData> | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const [viewportHeight, setViewportHeight] = React.useState(0);
  const [showScrollButton, setShowScrollButton] = React.useState(false);

  const nearBottomRef = React.useRef(true);
  const loadingOlderRef = React.useRef(false);
  const prevMessageCountRef = React.useRef(0);
  const prevFirstMessageIdRef = React.useRef<string | undefined>(undefined);
  const prevConversationIdRef = React.useRef<string | null>(null);
  const scrollSnapshotRef = React.useRef({ scrollTop: 0, scrollHeight: 0 });
  const sizeMapRef = React.useRef<Record<number, number>>({});

  const timelineItems = React.useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    messages.forEach((message, index) => {
      const previousMessage = messages[index - 1];
      const nextMessage = messages[index + 1];
      const showDate = shouldShowDateDivider(messages, index);

      if (showDate) {
        items.push({
          kind: "date",
          key: `date-${message.id}`,
          date: new Date(message.createdAt),
        });
      }

      if (message.type === "system") {
        items.push({
          kind: "system",
          key: `system-${message.id}`,
          message,
        });
        return;
      }

      const isOwn = message.senderId === currentUserId;
      const showAvatar = shouldShowAvatar(messages, index, conversation.type);
      const isGroupedWithPrevious =
        !!previousMessage &&
        previousMessage.type !== "system" &&
        previousMessage.senderId === message.senderId &&
        isSameDay(
          new Date(previousMessage.createdAt),
          new Date(message.createdAt),
        );
      const isGroupedWithNext =
        !!nextMessage &&
        nextMessage.type !== "system" &&
        nextMessage.senderId === message.senderId &&
        isSameDay(new Date(nextMessage.createdAt), new Date(message.createdAt));
      const isGroupStart = !isGroupedWithPrevious;
      const isGroupEnd = !isGroupedWithNext;

      items.push({
        kind: "message",
        key: `message-${message.id}`,
        message,
        isOwn,
        showAvatar,
        showSenderName: isGroupStart,
        isGroupStart,
        isGroupEnd,
        conversationType: conversation.type,
      });
    });

    return items;
  }, [messages, currentUserId, conversation.type]);

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
    [timelineItems.length],
  );

  const setItemSize = React.useCallback((index: number, size: number) => {
    const currentSize = sizeMapRef.current[index];
    if (currentSize === size || Math.abs((currentSize || 0) - size) <= 1) return;

    sizeMapRef.current[index] = size;
    listRef.current?.resetAfterIndex(index);
  }, []);

  const getItemSize = React.useCallback(
    (index: number) => sizeMapRef.current[index] ?? estimateMessageHeight(timelineItems[index]),
    [timelineItems],
  );

  const rowData = React.useMemo<TimelineRowData>(
    () => ({
      items: timelineItems,
      onReply,
      onReact,
      onImageClick,
      setItemSize,
      measureVersion: viewportHeight,
    }),
    [timelineItems, onReply, onReact, onImageClick, setItemSize, viewportHeight],
  );

  React.useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    const updateHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateHeight();
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const conversationChanged = prevConversationIdRef.current !== conversation.id;
    if (!conversationChanged) return;

    prevConversationIdRef.current = conversation.id;
    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = messages[0]?.id;
    loadingOlderRef.current = false;
    nearBottomRef.current = true;
    sizeMapRef.current = {};
    listRef.current?.resetAfterIndex(0, true);

    requestAnimationFrame(() => {
      setShowScrollButton(false);
      scrollToBottom("auto");
    });
  }, [conversation.id, messages, scrollToBottom]);

  React.useEffect(() => {
    const firstMessageId = messages[0]?.id;
    const messageCountDiff = messages.length - prevMessageCountRef.current;
    const outer = outerRef.current;

    if (
      loadingOlderRef.current &&
      outer &&
      firstMessageId &&
      prevFirstMessageIdRef.current &&
      firstMessageId !== prevFirstMessageIdRef.current
    ) {
      const scrollDelta = outer.scrollHeight - scrollSnapshotRef.current.scrollHeight;
      outer.scrollTop = scrollSnapshotRef.current.scrollTop + scrollDelta;
      loadingOlderRef.current = false;
    } else if (nearBottomRef.current && messageCountDiff > 0) {
      scrollToBottom(messageCountDiff === 1 ? "smooth" : "auto");
    }

    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = firstMessageId;
  }, [messages, scrollToBottom]);

  React.useEffect(() => {
    if (!isLoadingMore) {
      loadingOlderRef.current = false;
    }
  }, [isLoadingMore]);

  React.useEffect(() => {
    if (messages.length === 0) {
      setShowScrollButton(false);
    }
  }, [messages.length]);

  const handleListScroll = React.useCallback(
    ({ scrollOffset }: ListOnScrollProps) => {
      const outer = outerRef.current;
      if (!outer) return;

      const isNearBottom =
        outer.scrollHeight - scrollOffset - outer.clientHeight < 200;
      nearBottomRef.current = isNearBottom;
      setShowScrollButton(!isNearBottom);

      if (
        onLoadMore &&
        hasMore &&
        !isLoadingMore &&
        !loadingOlderRef.current &&
        scrollOffset < 120
      ) {
        loadingOlderRef.current = true;
        scrollSnapshotRef.current = {
          scrollTop: scrollOffset,
          scrollHeight: outer.scrollHeight,
        };

        Promise.resolve(onLoadMore()).catch(() => {
          loadingOlderRef.current = false;
        });
      }
    },
    [onLoadMore, hasMore, isLoadingMore],
  );

  const backgroundStyle = {
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%239C92AC" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
    backgroundColor: "#e6ebee",
  } as const;

  return (
    <div className={clsx("relative h-full min-h-0 flex-1", className)}>
      {isInitialLoading && (
        <div
          className="h-full min-h-0 overflow-y-auto px-4 py-4"
          style={backgroundStyle}
        >
          <MessageListSkeleton />
        </div>
      )}

      {!isInitialLoading && (
        <div
          className="h-full min-h-0 flex-1 overflow-hidden px-4 py-4"
          style={backgroundStyle}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-label="Tin nhan trong cuoc tro chuyen"
        >
          {messages.length === 0 ? (
            <EmptyMessages />
          ) : (
            <div ref={viewportRef} className="h-full min-h-0">
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

      {isLoadingMore && !isInitialLoading && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-gray-500 shadow-sm">
          Dang tai...
        </div>
      )}

      {showScrollButton && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className={clsx(
            "absolute bottom-4 right-4 z-sticky",
            "flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white shadow-lg",
            "transition-colors hover:bg-gray-50",
            "animate-bounce-in",
          )}
          aria-label="Cuon xuong cuoi"
        >
          <ChevronDownIcon className="h-5 w-5 text-gray-600" />
        </button>
      )}
    </div>
  );
};

export default MessageList;
