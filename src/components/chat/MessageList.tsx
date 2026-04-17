import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  VariableSizeList as VirtualList,
  type ListChildComponentProps,
  type ListOnScrollProps,
} from "react-window";
import { MessageItem } from "./MessageItem";
import { MessageListOverlays } from "./MessageListOverlays";
import { EmptyMessages, ErrorState, MessageListSkeleton } from "../ui";
import {
  type TimelineItem,
  type UnreadTimelineMarker,
} from "../../hooks/useMessageGrouping";
import { useVirtualizedMessages } from "../../hooks/useVirtualizedMessages";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import {
  getMessageStableKey,
  isFailedMessage,
  isPendingMessage,
} from "../../utils/messageTimeline";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";
import { logScrollTrace } from "../../utils/scrollTrace";
import { useMessageTimelineViewModel } from "../../features/chat/hooks/useMessageTimelineViewModel";
import { useMessageScrollMachine } from "../../features/chat/hooks/useMessageScrollMachine";
import type { ChatLayoutState } from "../../utils/densityPolicy";
import { getDistanceFromBottom } from "../../utils/scrollController";

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
  layoutState: ChatLayoutState;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  unreadRestoreSignature?: string | null;
  onUnreadRestoreConsumed?: (signature: string) => void;
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
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  insertedMessageKeys: Set<string>;
  highlightedMessageId: string | null;
  onItemSizeChange: (payload: {
    index: number;
    key: string;
    delta: number;
  }) => void;
}

const EMPTY_SELECTED_MESSAGE_IDS = new Set<string>();
const ITEM_SIZE_CHANGE_THRESHOLD = 2;

const isImageTimelineItem = (
  item: TimelineItem | undefined,
): item is Extract<TimelineItem, { kind: "message" }> =>
  Boolean(item && item.kind === "message" && item.message.type === "image");

const getImageTimelinePlaceholderMinHeight = (
  item: TimelineItem | undefined,
): number | null => {
  if (!isImageTimelineItem(item)) {
    return null;
  }

  const attachments = Array.isArray(item.message.attachments)
    ? item.message.attachments
    : [];
  const mediaHeight = attachments.reduce((total, attachment, index) => {
    const mediaWidth = attachment.width ? Math.min(attachment.width, 300) : 240;
    const mediaRatio =
      attachment.width && attachment.height
        ? attachment.height / attachment.width
        : 3 / 4;
    const nextHeight = Math.max(160, Math.round(mediaWidth * mediaRatio));
    return total + nextHeight + (index > 0 ? 8 : 0);
  }, 0);

  const captionHeight = item.message.content?.trim() ? 28 : 0;
  return Math.max(180, mediaHeight + captionHeight + 12);
};

const shouldAnimateInsertedMessage = (
  item: TimelineItem | undefined,
  insertedMessageKeys: Set<string>,
): boolean => {
  if (!item || item.kind !== "message") {
    return false;
  }

  return Boolean(
    item.isOwn &&
      isPendingMessage(item.message) &&
      insertedMessageKeys.has(getMessageStableKey(item.message)),
  );
};

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

  const previousShouldAnimateInsert = shouldAnimateInsertedMessage(
    previousItem,
    previousProps.data.insertedMessageKeys,
  );
  const nextShouldAnimateInsert = shouldAnimateInsertedMessage(
    nextItem,
    nextProps.data.insertedMessageKeys,
  );
  if (previousShouldAnimateInsert !== nextShouldAnimateInsert) {
    return false;
  }

  const previousHighlighted =
    previousItem?.kind === "message" &&
    isTargetMessage(
      previousItem.message,
      previousProps.data.highlightedMessageId,
    );
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
    previousProps.data.onNavigateToMessage ===
      nextProps.data.onNavigateToMessage &&
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
    hasInlineUrl(message.content),
  );
};

const estimateTimelineItemHeight = (
  item: TimelineItem,
  density: ChatDensity,
  layoutState: ChatLayoutState,
): number => {
  if (item.kind === "date") return 64;
  if (item.kind === "system") return 68;
  if (item.kind === "unread") return 48;

  const message = item.message;
  const densityOffset =
    density === "compact" ? -8 : density === "expanded" ? 14 : 0;
  const layoutOffset =
    layoutState === "with-panel" ? -6 : layoutState === "mobile" ? -4 : 0;
  let baseHeight =
    (item.showMeta ? 76 : 56) + densityOffset + layoutOffset;

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
      baseHeight +=
        approximateLines *
        (layoutState === "normal" ? 18 : 17);
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
    const { onItemSizeChange, setItemSize } = data;
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

      let measureRafId: number | null = null;
      const scheduleMeasure = () => {
        if (measureRafId !== null) {
          return;
        }

        measureRafId = requestAnimationFrame(() => {
          measureRafId = null;
          const currentNode = rowRef.current;
          if (!currentNode) return;

          const nextSize = Math.ceil(currentNode.getBoundingClientRect().height);
          const measurement = setItemSize(index, nextSize);
          if (!hasCommittedInitialMeasurementRef.current) {
            hasCommittedInitialMeasurementRef.current = true;
            return;
          }

          if (
            measurement.changed &&
            Math.abs(measurement.delta) > ITEM_SIZE_CHANGE_THRESHOLD
          ) {
            onItemSizeChange({
              index,
              key: currentItemKey,
              delta: measurement.delta,
            });
          }
        });
      };

      const cancelScheduledMeasure = () => {
        if (measureRafId === null) {
          return;
        }

        cancelAnimationFrame(measureRafId);
        measureRafId = null;
      };

      scheduleMeasure();

      if (isImageTimelineItem(item)) {
        const pendingImages = Array.from(
          node.querySelectorAll<HTMLImageElement>("img"),
        ).filter((image) => !image.complete);
        const placeholderMinHeight =
          getImageTimelinePlaceholderMinHeight(item);

        if (pendingImages.length > 0 && placeholderMinHeight !== null) {
          node.style.minHeight = `${placeholderMinHeight}px`;
        } else {
          node.style.minHeight = "";
        }

        const handleImageSettled = () => {
          if (
            Array.from(node.querySelectorAll<HTMLImageElement>("img")).every(
              (image) => image.complete,
            )
          ) {
            node.style.minHeight = "";
          }
          scheduleMeasure();
        };

        pendingImages.forEach((image) => {
          image.addEventListener("load", handleImageSettled);
          image.addEventListener("error", handleImageSettled);
        });

        return () => {
          cancelScheduledMeasure();
          node.style.minHeight = "";
          pendingImages.forEach((image) => {
            image.removeEventListener("load", handleImageSettled);
            image.removeEventListener("error", handleImageSettled);
          });
        };
      }

      const measure = () => {
        scheduleMeasure();
      };

      if (
        typeof ResizeObserver === "undefined" ||
        !shouldObserveTimelineItemResize(item)
      ) {
        const rafId = requestAnimationFrame(measure);
        return () => {
          cancelAnimationFrame(rafId);
          cancelScheduledMeasure();
        };
      }

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
      return () => {
        resizeObserver.disconnect();
        cancelScheduledMeasure();
      };
    }, [index, item, onItemSizeChange, setItemSize]);

    if (!item) return null;

    const messageId = item.kind === "message" ? item.message.id : undefined;
    const timelineKey = item.key || `${item.kind}-${index}`;
    const isHighlighted =
      item.kind === "message" &&
      isTargetMessage(item.message, data.highlightedMessageId);
    const shouldAnimateInsert = shouldAnimateInsertedMessage(
      item,
      data.insertedMessageKeys,
    );

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
                onNavigateToMessage={data.onNavigateToMessage}
                currentUsername={data.currentUsername}
                shouldAnimateInsert={shouldAnimateInsert}
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

type ScrollCommand =
  | {
      kind: "bottom";
      reason: string;
    }
  | {
      kind: "offset";
      offset: number;
      reason: string;
    };

type PendingScrollCommand = ScrollCommand & {
  priority: number;
  requestedAt: number;
};

const HIGH_VALUE_SCROLL_REASONS = new Set([
  "jump-to-latest",
  "jump-to-message",
  "incoming-message",
  "self-message",
  "prepend-history-preserve",
]);

export const resolveScrollCommandPriority = (reason: string): number => {
  switch (reason) {
    case "jump-to-latest":
      return 100;
    case "jump-to-message":
      return 95;
    case "incoming-message":
      return 90;
    case "self-message":
      return 85;
    case "prepend-history-preserve":
      return 80;
    case "conversation-restore-anchor":
      return 70;
    case "conversation-restore":
      return 65;
    case "conversation-restore-unread":
      return 60;
    case "item-resize-preserve":
      return 50;
    case "item-resize-while-pinned":
      return 48;
    case "layout-change":
      return 40;
    case "keyboard-home":
    case "keyboard-page-down":
    case "keyboard-page-up":
      return 30;
    case "conversation-change":
      return 25;
    default:
      return 20;
  }
};

export const shouldAcceptScrollCommand = ({
  nextCommand,
  pendingCommand,
  isPinnedToBottom,
}: {
  nextCommand: ScrollCommand;
  pendingCommand: PendingScrollCommand | null;
  isPinnedToBottom: boolean;
}): {
  accepted: boolean;
  reason: string;
} => {
  if (
    nextCommand.reason === "conversation-restore-unread" &&
    isPinnedToBottom
  ) {
    return {
      accepted: false,
      reason: "restore_unread_blocked_while_pinned",
    };
  }

  if (!pendingCommand) {
    return { accepted: true, reason: "accepted_no_pending" };
  }

  const nextPriority = resolveScrollCommandPriority(nextCommand.reason);
  if (pendingCommand.priority > nextPriority) {
    return {
      accepted: false,
      reason: "lower_priority_than_pending",
    };
  }

  if (pendingCommand.priority === nextPriority) {
    const sameFamily = pendingCommand.reason === nextCommand.reason;
    if (!sameFamily) {
      return {
        accepted: false,
        reason: "equal_priority_keep_existing",
      };
    }
  }

  if (
    nextCommand.reason === "conversation-restore-unread" &&
    HIGH_VALUE_SCROLL_REASONS.has(pendingCommand.reason)
  ) {
    return {
      accepted: false,
      reason: "restore_unread_cannot_override_high_value_scroll",
    };
  }

  return {
    accepted: true,
    reason: pendingCommand ? "accepted_replaced_pending" : "accepted_no_pending",
  };
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
  layoutState,
  isSelectionMode = false,
  selectedMessageIds = EMPTY_SELECTED_MESSAGE_IDS,
  onToggleSelect,
  onNavigateToMessage,
  currentUsername,
  unreadMarker,
  unreadRestoreSignature,
  onUnreadRestoreConsumed,
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
  const scrollCommandRafRef = React.useRef<number | null>(null);
  const pendingScrollCommandRef = React.useRef<PendingScrollCommand | null>(
    null,
  );
  const appliedUnreadRestoreSignatureRef = React.useRef<string | null>(null);
  const lastSeenUnreadRestoreSignatureRef = React.useRef<string | null>(null);
  const prependAnchorRef = React.useRef<{
    messageId: string | null;
    offsetFromTop: number;
  } | null>(null);
  const preserveScrollDeltaRafRef = React.useRef<number | null>(null);
  const pendingPreserveScrollDeltaRef = React.useRef(0);
  const timelineSizeChangeRafRef = React.useRef<number | null>(null);
  const pendingTimelineSizeChangesRef = React.useRef<
    Map<string, { index: number; delta: number }>
  >(new Map());
  const isPinnedToBottomRef = React.useRef(true);
  const lastLayoutRef = React.useRef({
    viewportHeight: 0,
    composerHeight,
  });
  const timelineItemCountRef = React.useRef(0);
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);
  const previousMessageStableKeysRef = React.useRef<Set<string>>(new Set());
  const [liveUnreadMarker, setLiveUnreadMarker] =
    React.useState<UnreadTimelineMarker | null>(unreadMarker ?? null);
  const getTimelineItemKey = React.useCallback(
    (item: TimelineItem, index: number) => item.key || `${item.kind}-${index}`,
    [],
  );
  const { timelineItems } = useMessageTimelineViewModel({
    messages,
    currentUserId,
    conversationType,
    unreadMarker: liveUnreadMarker,
  });
  const latestMessageStableKeys = React.useMemo(
    () => new Set(messages.map((message) => getMessageStableKey(message))),
    [messages],
  );
  const messageIds = React.useMemo(
    () => messages.map((message) => message.id),
    [messages],
  );
  const insertedMessageKeys = React.useMemo(() => {
    const previousKeys = previousMessageStableKeysRef.current;
    const insertedKeys = new Set<string>();

    latestMessageStableKeys.forEach((key) => {
      if (!previousKeys.has(key)) {
        insertedKeys.add(key);
      }
    });

    return insertedKeys;
  }, [latestMessageStableKeys]);
  timelineItemCountRef.current = timelineItems.length;

  React.useEffect(() => {
    previousMessageStableKeysRef.current = latestMessageStableKeys;
  }, [conversationId, latestMessageStableKeys]);

  const estimateItemSize = React.useCallback(
    (item: TimelineItem) =>
      estimateTimelineItemHeight(item, density, layoutState),
    [density, layoutState],
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
    getItemKey: getTimelineItemKey,
    listRef,
    outerRef,
  });

  React.useEffect(() => {
    clearMeasuredSizes();
  }, [clearMeasuredSizes, conversationId, layoutState]);

  const flushScrollCommand = React.useCallback(() => {
    scrollCommandRafRef.current = null;
    const command = pendingScrollCommandRef.current;
    pendingScrollCommandRef.current = null;
    if (!command) return;

    const itemCount = timelineItemCountRef.current;
    if (command.kind === "bottom" && itemCount === 0) {
      logScrollTrace("scroll_command_skipped", {
        conversationId,
        ...command,
      });
      return;
    }

    logScrollTrace("scroll_command_flush", {
      conversationId,
      ...command,
      currentScrollTop: outerRef.current?.scrollTop ?? 0,
      clientHeight: outerRef.current?.clientHeight ?? 0,
      scrollHeight: outerRef.current?.scrollHeight ?? 0,
      distanceFromBottom: outerRef.current
        ? getDistanceFromBottom(outerRef.current)
        : null,
    });

    switch (command.kind) {
      case "bottom":
        listRef.current?.scrollToItem(itemCount - 1, "end");
        break;
      case "offset":
        listRef.current?.scrollTo(Math.max(0, command.offset));
        break;
    }
  }, [conversationId]);

  const requestScrollCommand = React.useCallback(
    (command: ScrollCommand): boolean => {
      const pendingCommand = pendingScrollCommandRef.current;
      const nextCommand: PendingScrollCommand = {
        ...command,
        priority: resolveScrollCommandPriority(command.reason),
        requestedAt: Date.now(),
      };
      logScrollTrace("scroll_command_requested", {
        conversationId,
        ...nextCommand,
        pendingReason: pendingCommand?.reason ?? null,
        pendingPriority: pendingCommand?.priority ?? null,
        currentScrollTop: outerRef.current?.scrollTop ?? 0,
        clientHeight: outerRef.current?.clientHeight ?? 0,
        scrollHeight: outerRef.current?.scrollHeight ?? 0,
        distanceFromBottom: outerRef.current
          ? getDistanceFromBottom(outerRef.current)
          : null,
      });

      const decision = shouldAcceptScrollCommand({
        nextCommand: command,
        pendingCommand,
        isPinnedToBottom: isPinnedToBottomRef.current,
      });
      if (!decision.accepted) {
        logScrollTrace("scroll_command_rejected", {
          conversationId,
          ...nextCommand,
          pendingReason: pendingCommand?.reason ?? null,
          pendingPriority: pendingCommand?.priority ?? null,
          rejectionReason: decision.reason,
          isPinnedToBottom: isPinnedToBottomRef.current,
        });
        return false;
      }

      pendingScrollCommandRef.current = nextCommand;
      logScrollTrace("scroll_command_accepted", {
        conversationId,
        ...nextCommand,
        previousPendingReason: pendingCommand?.reason ?? null,
        previousPendingPriority: pendingCommand?.priority ?? null,
        acceptanceReason: decision.reason,
      });

      if (scrollCommandRafRef.current !== null) {
        return true;
      }

      scrollCommandRafRef.current = requestAnimationFrame(flushScrollCommand);
      return true;
    },
    [conversationId, flushScrollCommand],
  );

  const requestScrollToBottom = React.useCallback(
    (reason: string) => {
      return requestScrollCommand({ kind: "bottom", reason });
    },
    [requestScrollCommand],
  );

  const resolveAnchorTimelineIndex = React.useCallback(
    (messageId: string | null): number => {
      const messageIndex = messageId ? messageIds.indexOf(messageId) : -1;
      const resolvedMessageId =
        messageIndex >= 0 ? messageIds[messageIndex] : (messageIds[0] ?? null);
      if (!resolvedMessageId) {
        return -1;
      }

      return timelineItems.findIndex(
        (item) =>
          (item.kind === "message" || item.kind === "system") &&
          item.message.id === resolvedMessageId,
      );
    },
    [messageIds, timelineItems],
  );

  const captureVisibleAnchor = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer || timelineItems.length === 0) return null;

    const visibleItem = findItemAtOffset(outer.scrollTop);
    if (!visibleItem) return null;

    const anchorIndex = timelineItems.findIndex(
      (item, index) =>
        index >= visibleItem.index &&
        (item.kind === "message" || item.kind === "system"),
    );
    if (anchorIndex < 0) {
      return null;
    }

    const item = timelineItems[anchorIndex];
    if (!item || (item.kind !== "message" && item.kind !== "system")) {
      return null;
    }

    return {
      messageId: item.message.id,
      offsetFromTop: outer.scrollTop - getItemOffset(anchorIndex),
    };
  }, [findItemAtOffset, getItemOffset, outerRef, timelineItems]);

  const restoreCapturedAnchor = React.useCallback(
    (reason: string) => {
      const anchor = prependAnchorRef.current;
      prependAnchorRef.current = null;
      if (!anchor) return;

      const anchorIndex = resolveAnchorTimelineIndex(anchor.messageId);
      if (anchorIndex < 0) return;

      requestScrollCommand({
        kind: "offset",
        offset: getItemOffset(anchorIndex) + anchor.offsetFromTop,
        reason,
      });
    },
    [getItemOffset, requestScrollCommand, resolveAnchorTimelineIndex],
  );

  const resolveUnreadAnchorIndex = React.useCallback((): number => {
    const unreadDividerIndex = timelineItems.findIndex((item) => item.kind === "unread");
    if (unreadDividerIndex >= 0) {
      return unreadDividerIndex;
    }

    if (unreadMarker?.firstUnreadMessageId) {
      return timelineItems.findIndex(
        (item) =>
          item.kind === "message" &&
          isTargetMessage(item.message, unreadMarker.firstUnreadMessageId!),
      );
    }

    if (unreadMarker?.lastReadMessageId) {
      const lastReadIndex = timelineItems.findIndex(
        (item) =>
          item.kind === "message" &&
          isTargetMessage(item.message, unreadMarker.lastReadMessageId!),
      );
      if (lastReadIndex >= 0) {
        return Math.min(lastReadIndex + 1, Math.max(0, timelineItems.length - 1));
      }
    }

    if (!unreadMarker?.lastReadAt) {
      return -1;
    }

    const lastReadAtMs = new Date(unreadMarker.lastReadAt).getTime();
    return timelineItems.findIndex(
      (item) =>
        item.kind === "message" &&
        new Date(item.message.createdAt).getTime() > lastReadAtMs,
    );
  }, [timelineItems, unreadMarker]);
  const unreadAnchorIndex = React.useMemo(
    () => resolveUnreadAnchorIndex(),
    [resolveUnreadAnchorIndex],
  );

  const {
    pendingNewMessages,
    isPinnedToBottom,
    scrollMode,
    firstDetachedUnreadMessageId,
    handleScroll,
    jumpToLatest,
    detachAutoFollow,
    syncScrollStateFromDom,
    pendingRestoreAnchor,
    pendingRestoreScrollTop,
    pendingRestoreVersion,
  } = useMessageScrollMachine({
    conversationId,
    messages,
    currentUserId,
    preferUnreadAnchor: Boolean(unreadRestoreSignature),
    hasMore,
    isLoadingMore,
    onLoadMore,
    onBeforeLoadMore: () => {
      prependAnchorRef.current = captureVisibleAnchor();
      logScrollTrace("prepend_anchor_captured", {
        conversationId,
        anchor: prependAnchorRef.current,
      });
    },
    onAfterPrepend: () => {
      restoreCapturedAnchor("prepend-history-preserve");
    },
    outerRef,
    requestScrollToBottom,
    captureScrollAnchor: captureVisibleAnchor,
  });

  React.useEffect(() => {
    isPinnedToBottomRef.current = isPinnedToBottom;
  }, [isPinnedToBottom]);

  React.useEffect(() => {
    if (unreadMarker?.active) {
      setLiveUnreadMarker(unreadMarker);
      return;
    }

    if (firstDetachedUnreadMessageId) {
      setLiveUnreadMarker({
        firstUnreadMessageId: firstDetachedUnreadMessageId,
        active: true,
      });
      return;
    }

    setLiveUnreadMarker(unreadMarker ?? null);
  }, [conversationId, firstDetachedUnreadMessageId, unreadMarker, unreadRestoreSignature]);

  React.useEffect(() => {
    if (lastSeenUnreadRestoreSignatureRef.current !== unreadRestoreSignature) {
      if (lastSeenUnreadRestoreSignatureRef.current) {
        logScrollTrace("unread_restore_signature_cleared", {
          conversationId,
          signature: lastSeenUnreadRestoreSignatureRef.current,
          nextSignature: unreadRestoreSignature ?? null,
        });
      }
      lastSeenUnreadRestoreSignatureRef.current = unreadRestoreSignature ?? null;
    }

    if (!unreadRestoreSignature) {
      if (appliedUnreadRestoreSignatureRef.current !== null) {
        logScrollTrace("unread_restore_signature_cleared", {
          conversationId,
          signature: appliedUnreadRestoreSignatureRef.current,
        });
      }
      appliedUnreadRestoreSignatureRef.current = null;
      return;
    }

    if (appliedUnreadRestoreSignatureRef.current === unreadRestoreSignature) {
      logScrollTrace("unread_restore_signature_skipped_already_applied", {
        conversationId,
        signature: unreadRestoreSignature,
      });
    } else {
      logScrollTrace("unread_restore_signature_seen", {
        conversationId,
        signature: unreadRestoreSignature,
      });
    }
  }, [conversationId, unreadRestoreSignature]);

  const showNewMessagesPill = pendingNewMessages > 0;
  const showJumpToBottom =
    scrollMode === "reading_history" && pendingNewMessages === 0;

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
          visible: showNewMessagesPill,
          priority: 95,
          slot: "bottom-right",
        },
        {
          id: "jump-latest",
          visible: showJumpToBottom,
          priority: 70,
          slot: "bottom-right",
        },
      ]),
    [showJumpToBottom, showNewMessagesPill],
  );
  const floatingBottomOffset = React.useMemo(
    () => Math.max(12, composerHeight + 12),
    [composerHeight],
  );

  const flushTimelineItemSizeChanges = React.useCallback(() => {
    timelineSizeChangeRafRef.current = null;
    if (pendingTimelineSizeChangesRef.current.size === 0) {
      return;
    }

    const changes = Array.from(pendingTimelineSizeChangesRef.current.values());
    pendingTimelineSizeChangesRef.current.clear();

    if (isPinnedToBottom) {
      requestScrollToBottom("item-resize-while-pinned");
      return;
    }

    const outer = outerRef.current;
    if (!outer) return;

    const visibleItem = findItemAtOffset(outer.scrollTop);
    const anchorIndex = visibleItem?.index ?? 0;
    const totalDelta = changes.reduce((sum, change) => {
      if (change.index > anchorIndex) {
        return sum;
      }

      return sum + change.delta;
    }, 0);

    if (Math.abs(totalDelta) <= ITEM_SIZE_CHANGE_THRESHOLD) {
      return;
    }

    pendingPreserveScrollDeltaRef.current += totalDelta;
    logScrollTrace("scroll_preserve_delta_queued", {
      conversationId,
      indices: changes.map((change) => change.index),
      delta: totalDelta,
      accumulatedDelta: pendingPreserveScrollDeltaRef.current,
    });

    if (preserveScrollDeltaRafRef.current !== null) {
      return;
    }

    preserveScrollDeltaRafRef.current = requestAnimationFrame(() => {
      preserveScrollDeltaRafRef.current = null;
      const nextDelta = pendingPreserveScrollDeltaRef.current;
      pendingPreserveScrollDeltaRef.current = 0;
      if (nextDelta === 0) return;

      requestScrollCommand({
        kind: "offset",
        offset: (outerRef.current?.scrollTop ?? 0) + nextDelta,
        reason: "item-resize-preserve",
      });
    });
  }, [
    conversationId,
    findItemAtOffset,
    isPinnedToBottom,
    requestScrollCommand,
    requestScrollToBottom,
  ]);

  const handleTimelineItemSizeChange = React.useCallback(
    ({ index, key, delta }: { index: number; key: string; delta: number }) => {
      if (Math.abs(delta) <= ITEM_SIZE_CHANGE_THRESHOLD) {
        return;
      }

      pendingTimelineSizeChangesRef.current.set(key, {
        index,
        delta:
          (pendingTimelineSizeChangesRef.current.get(key)?.delta ?? 0) + delta,
      });
      if (timelineSizeChangeRafRef.current !== null) {
        return;
      }

      timelineSizeChangeRafRef.current = requestAnimationFrame(
        flushTimelineItemSizeChanges,
      );
    },
    [flushTimelineItemSizeChanges],
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
      onNavigateToMessage,
      currentUsername,
      insertedMessageKeys,
      highlightedMessageId,
      onItemSizeChange: handleTimelineItemSizeChange,
    }),
    [
      currentUsername,
      density,
      handleTimelineItemSizeChange,
      highlightedMessageId,
      insertedMessageKeys,
      isSelectionMode,
      onDelete,
      onEdit,
      onFilePreview,
      onImageClick,
      onNavigateToMessage,
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
    [findItemAtOffset, handleScroll, timelineItems],
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
          jumpToLatest();
          break;
        case "Home":
          event.preventDefault();
          requestScrollCommand({
            kind: "offset",
            offset: 0,
            reason: "keyboard-home",
          });
          break;
        case "PageDown":
          event.preventDefault();
          requestScrollCommand({
            kind: "offset",
            offset: outer.scrollTop + Math.round(outer.clientHeight * 0.9),
            reason: "keyboard-page-down",
          });
          break;
        case "PageUp":
          event.preventDefault();
          requestScrollCommand({
            kind: "offset",
            offset: Math.max(
              0,
              outer.scrollTop - Math.round(outer.clientHeight * 0.9),
            ),
            reason: "keyboard-page-up",
          });
          break;
        default:
          break;
      }
    },
    [jumpToLatest, requestScrollCommand],
  );

  const highlightMessage = React.useCallback((messageId: string) => {
    setHighlightedMessageId(messageId);

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current,
      );
    }, 1800);
  }, []);

  const ensureItemVisible = React.useCallback(
    (index: number, reason: string): boolean => {
      const outer = outerRef.current;
      if (!outer) return false;

      const itemTop = getItemOffset(index);
      const itemBottom = itemTop + getItemSize(index);
      const padding = Math.min(64, Math.floor(outer.clientHeight * 0.16));
      const visibleTop = outer.scrollTop + padding;
      const visibleBottom = outer.scrollTop + outer.clientHeight - padding;
      const alreadyVisible =
        itemTop >= visibleTop && itemBottom <= visibleBottom;

      if (alreadyVisible) {
        logScrollTrace("jump_target_already_visible", {
          conversationId,
          index,
          reason,
        });
        return false;
      }

      const nextOffset =
        itemTop < visibleTop
          ? Math.max(0, itemTop - padding)
          : Math.max(0, itemBottom - outer.clientHeight + padding);
      requestScrollCommand({
        kind: "offset",
        offset: nextOffset,
        reason,
      });
      return true;
    },
    [conversationId, getItemOffset, getItemSize, requestScrollCommand],
  );

  React.useEffect(() => {
    if (!pendingRestoreAnchor || viewportHeight <= 0) {
      return;
    }

    const anchorIndex = resolveAnchorTimelineIndex(pendingRestoreAnchor.messageId);
    if (anchorIndex < 0) {
      return;
    }

    requestScrollCommand({
      kind: "offset",
      offset:
        getItemOffset(anchorIndex) + pendingRestoreAnchor.offsetFromTop,
      reason: "conversation-restore-anchor",
    });

    const rafId = requestAnimationFrame(() => {
      syncScrollStateFromDom("conversation-restore-anchor-synced");
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    getItemOffset,
    pendingRestoreAnchor,
    pendingRestoreVersion,
    requestScrollCommand,
    resolveAnchorTimelineIndex,
    syncScrollStateFromDom,
    viewportHeight,
  ]);

  React.useEffect(() => {
    if (pendingRestoreScrollTop === null || viewportHeight <= 0) {
      return;
    }

    requestScrollCommand({
      kind: "offset",
      offset: pendingRestoreScrollTop,
      reason: "conversation-restore",
    });

    const rafId = requestAnimationFrame(() => {
      syncScrollStateFromDom("conversation-restore-synced");
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    pendingRestoreScrollTop,
    pendingRestoreVersion,
    requestScrollCommand,
    syncScrollStateFromDom,
    viewportHeight,
  ]);

  React.useEffect(() => {
    if (!unreadRestoreSignature || viewportHeight <= 0) {
      return;
    }
    if (appliedUnreadRestoreSignatureRef.current === unreadRestoreSignature) {
      return;
    }
    if (pendingRestoreAnchor || pendingRestoreScrollTop !== null) {
      return;
    }

    if (unreadAnchorIndex < 0) {
      return;
    }

    const accepted = requestScrollCommand({
      kind: "offset",
      offset: Math.max(0, getItemOffset(unreadAnchorIndex)),
      reason: "conversation-restore-unread",
    });
    if (!accepted) {
      return;
    }

    appliedUnreadRestoreSignatureRef.current = unreadRestoreSignature;
    logScrollTrace("unread_restore_signature_applied", {
      conversationId,
      signature: unreadRestoreSignature,
      targetIndex: unreadAnchorIndex,
    });
    onUnreadRestoreConsumed?.(unreadRestoreSignature);

    const rafId = requestAnimationFrame(() => {
      syncScrollStateFromDom("conversation-restore-unread-synced");
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    getItemOffset,
    pendingRestoreAnchor,
    pendingRestoreScrollTop,
    requestScrollCommand,
    syncScrollStateFromDom,
    unreadAnchorIndex,
    unreadRestoreSignature,
    onUnreadRestoreConsumed,
    viewportHeight,
    conversationId,
  ]);

  React.useLayoutEffect(() => {
    if (viewportHeight <= 0) return;

    const previousLayout = lastLayoutRef.current;
    const viewportChanged =
      previousLayout.viewportHeight > 0 &&
      previousLayout.viewportHeight !== viewportHeight;
    const composerChanged =
      Math.abs(previousLayout.composerHeight - composerHeight) > 1;

    lastLayoutRef.current = {
      viewportHeight,
      composerHeight,
    };

    if (!viewportChanged && !composerChanged) return;
    if (isPinnedToBottom) {
      requestScrollToBottom("layout-change");
    }
  }, [composerHeight, isPinnedToBottom, requestScrollToBottom, viewportHeight]);

  React.useEffect(() => {
    if (!jumpToMessageId) return;

    const targetIndex = timelineItems.findIndex(
      (item) =>
        item.kind === "message" &&
        isTargetMessage(item.message, jumpToMessageId),
    );
    if (targetIndex < 0) {
      logScrollTrace("jump_target_waiting_for_render", {
        conversationId,
        messageId: jumpToMessageId,
      });
      return;
    }

    detachAutoFollow("jump-to-message");
    ensureItemVisible(targetIndex, "jump-to-message");
    highlightMessage(jumpToMessageId);
    onJumpHandled?.(jumpToMessageId);
  }, [
    conversationId,
    detachAutoFollow,
    ensureItemVisible,
    highlightMessage,
    jumpRequestVersion,
    jumpToMessageId,
    onJumpHandled,
    timelineItems,
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
      !isPinnedToBottom
    ) {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (latestMessage) {
      onReachedLatest?.(latestMessage);
    }
  }, [
    isInitialLoading,
    isPinnedToBottom,
    messages,
    onReachedLatest,
    pendingNewMessages,
  ]);

  React.useEffect(
    () => () => {
      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      if (scrollCommandRafRef.current !== null) {
        cancelAnimationFrame(scrollCommandRafRef.current);
      }
      if (preserveScrollDeltaRafRef.current !== null) {
        cancelAnimationFrame(preserveScrollDeltaRafRef.current);
      }
      if (timelineSizeChangeRafRef.current !== null) {
        cancelAnimationFrame(timelineSizeChangeRafRef.current);
      }
      pendingTimelineSizeChangesRef.current.clear();
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
          className="chat-background h-full min-h-0 overflow-hidden pb-2 pt-1"
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
                  itemKey={(index, data) =>
                    data.items[index]
                      ? getTimelineItemKey(data.items[index], index)
                      : index
                  }
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

      <MessageListOverlays
        hasMessages={messages.length > 0}
        stickyDate={stickyDate}
        showStickyDate={Boolean(topOverlayPlacements["sticky-date"]?.visible)}
        showError={Boolean(topOverlayPlacements.error?.visible)}
        error={error ?? null}
        canRetry={Boolean(onRetry)}
        onRetry={handleRetry}
        retryLabel={t("common:actions.retry")}
        showLoadingMore={Boolean(topOverlayPlacements.loading?.visible)}
        loadMoreLabel={t("chat:message.loadMore")}
        showJumpToBottom={Boolean(
          bottomOverlayPlacements["jump-latest"]?.visible,
        )}
        showNewMessagesPill={Boolean(bottomOverlayPlacements["new-pill"]?.visible)}
        pendingNewMessages={pendingNewMessages}
        onJumpToLatest={jumpToLatest}
        jumpToLatestLabel={t("chat:message.jumpToLatest")}
        newMessagesAriaLabel={t("chat:message.newAria")}
        newMessagesLabel={t("chat:message.newLabel", {
          count: pendingNewMessages,
        })}
        floatingBottomOffset={floatingBottomOffset}
      />
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
  previousProps.onNavigateToMessage === nextProps.onNavigateToMessage &&
  previousProps.currentUsername === nextProps.currentUsername &&
  previousProps.unreadMarker === nextProps.unreadMarker &&
  previousProps.unreadRestoreSignature === nextProps.unreadRestoreSignature &&
  previousProps.onUnreadRestoreConsumed === nextProps.onUnreadRestoreConsumed &&
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
