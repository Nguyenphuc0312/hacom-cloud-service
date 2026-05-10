import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { MessageItem } from "./MessageItem";
import { MessageListOverlays } from "./MessageListOverlays";
import { MessageGroup } from "./thread/MessageGroup";
import { EmptyMessages, ErrorState, MessageListSkeleton } from "../ui";
import {
  type UnreadTimelineMarker,
} from "../../hooks/useMessageGrouping";
import { useTanStackVirtualizedMessages } from "../../hooks/useTanStackVirtualizedMessages";
import type { Conversation, Message, Attachment } from "../../types";
import type { ChatDensity } from "../../stores/uiStore";
import {
  getMessageStableKey,
  isFailedMessage,
  isPendingMessage,
} from "../../utils/messageTimeline";
import {
  isTargetMessage,
  resolveThreadMessageRenderState,
  resolveTimelineMessageRenderState,
  type RenderableTimelineItem,
  type TimelineMessageRenderState,
} from "./messageListShared";
import { resolveOverlayPlacements } from "../../utils/overlayResolver";
import { logScrollTrace } from "../../utils/scrollTrace";
import { useChatScrollController } from "./useChatScrollController";
import {
  useConversationTimelineRows,
} from "../../features/chat/hooks/useConversationTimelineRows";
import {
  type ConversationThreadRow,
  useConversationThreadRows,
} from "../../features/chat/hooks/useConversationThreadRows";
import { useConversationMessagesRTK } from "../../features/chat/hooks/useConversationMessagesRTK";
import type { ChatLayoutState } from "../../utils/densityPolicy";
import {
  isChatPerformanceEnabled,
  logChatPerformance,
  measureChatPerformance,
} from "../../utils/chatPerformance";
import {
  DEFAULT_TEXT_CHARS_PER_LINE,
  estimateTextLineCount,
  hasInlineUrl,
  LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD,
} from "../../utils/longMessagePolicy";

interface MessageListProps {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  historyLoadingState?: {
    stage:
      | "empty"
      | "partial_unread_bootstrap"
      | "partial_prefetch"
      | "authoritative_initial_window"
      | "paginating_older"
      | "live_realtime";
    isPartial: boolean;
  } | null;
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
  items: ConversationThreadRow[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (messageId: string) => void | Promise<void>;
  onInspect?: (message: Message) => void;
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
  expandedLongMessageIds: Set<string>;
  onToggleLongMessageExpand: (messageId: string) => void;
  insertedMessageKeys: Set<string>;
  highlightedMessageId: string | null;
  onItemSizeChange: (payload: {
    index: number;
    key: string;
    delta: number;
  }) => void;
}

interface TimelineRowRenderProps<Data> {
  index: number;
  style: React.CSSProperties;
  data: Data;
  isScrolling?: boolean;
}

const EMPTY_SELECTED_MESSAGE_IDS = new Set<string>();
const EMPTY_INSERTED_MESSAGE_KEYS = new Set<string>();
const ITEM_SIZE_CHANGE_THRESHOLD = 2;

type BottomSettlePhase =
  | "idle"
  | "loading-initial"
  | "waiting-for-measurement"
  | "scrolling-to-bottom"
  | "settled";

const isThreadRowMessageLike = (
  item: ConversationThreadRow | undefined,
): item is Extract<ConversationThreadRow, { kind: "group" | "system" }> =>
  Boolean(item && (item.kind === "group" || item.kind === "system"));

const isImageTimelineItem = (
  item: RenderableTimelineItem | undefined,
): item is Extract<RenderableTimelineItem, { kind: "group" }> =>
  Boolean(
    item &&
      item.kind === "group" &&
      item.items.some((entry) => entry.message.type === "image"),
  );

const getImageTimelinePlaceholderMinHeight = (
  item: RenderableTimelineItem | undefined,
): number | null => {
  if (!isImageTimelineItem(item)) {
    return null;
  }

  const attachments = item.items.flatMap((entry) =>
    Array.isArray(entry.message.attachments) ? entry.message.attachments : [],
  );
  const mediaHeight = attachments.reduce((total, attachment, index) => {
    const mediaWidth = attachment.width ? Math.min(attachment.width, 300) : 240;
    const mediaRatio =
      attachment.width && attachment.height
        ? attachment.height / attachment.width
        : 3 / 4;
    const nextHeight = Math.max(160, Math.round(mediaWidth * mediaRatio));
    return total + nextHeight + (index > 0 ? 8 : 0);
  }, 0);

  const captionHeight = item.items.some((entry) => entry.message.content?.trim())
    ? 28
    : 0;
  return Math.max(180, mediaHeight + captionHeight + 12);
};

const shouldAnimateInsertedMessage = (
  item: RenderableTimelineItem | undefined,
  insertedMessageKeys: Set<string>,
): boolean => {
  if (!item || item.kind !== "message") {
    if (item?.kind !== "group") {
      return false;
    }

    return item.items.some(
      (entry) =>
        entry.isOwn &&
        isPendingMessage(entry.message) &&
        insertedMessageKeys.has(getMessageStableKey(entry.message)),
    );
  }

  return Boolean(
    item.isOwn &&
      isPendingMessage(item.message) &&
      insertedMessageKeys.has(getMessageStableKey(item.message)),
  );
};

const areEqualTimelineRowProps = (
  previousProps: TimelineRowRenderProps<TimelineRowData>,
  nextProps: TimelineRowRenderProps<TimelineRowData>,
): boolean => {
  if (previousProps.index !== nextProps.index) {
    return false;
  }

  if (
    previousProps.style.top !== nextProps.style.top ||
    previousProps.style.height !== nextProps.style.height ||
    previousProps.style.width !== nextProps.style.width ||
    previousProps.style.left !== nextProps.style.left ||
    previousProps.style.transform !== nextProps.style.transform
  ) {
    return false;
  }

  const previousItem = previousProps.data.items[previousProps.index];
  const nextItem = nextProps.data.items[nextProps.index];
  if (previousItem !== nextItem) {
    return false;
  }

  const previousMessageId =
    previousItem?.kind === "group"
      ? previousItem.anchorMessageId
      : previousItem?.kind === "system"
        ? previousItem.messageId
      : null;
  const nextMessageId =
    nextItem?.kind === "group"
      ? nextItem.anchorMessageId
      : nextItem?.kind === "system"
        ? nextItem.messageId
      : null;
  if (previousMessageId !== nextMessageId) {
    return false;
  }

  const previousSelected =
    previousItem?.kind === "group"
      ? previousItem.messageIds.some((messageId) =>
          previousProps.data.selectedMessageIds.has(messageId),
        )
      : previousMessageId
        ? previousProps.data.selectedMessageIds.has(previousMessageId)
        : false;
  const nextSelected =
    nextItem?.kind === "group"
      ? nextItem.messageIds.some((messageId) =>
          nextProps.data.selectedMessageIds.has(messageId),
        )
      : nextMessageId
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
    previousItem?.kind === "group"
      ? previousItem.items.some((entry) =>
          isTargetMessage(entry.message, previousProps.data.highlightedMessageId),
        )
      : false;
  const nextHighlighted =
    nextItem?.kind === "group"
      ? nextItem.items.some((entry) =>
          isTargetMessage(entry.message, nextProps.data.highlightedMessageId),
        )
      : false;
  const previousRenderState = previousItem
    ? resolveTimelineMessageRenderState(
        previousItem,
        previousProps.data.expandedLongMessageIds,
      )
    : null;
  const nextRenderState = nextItem
    ? resolveTimelineMessageRenderState(
        nextItem,
        nextProps.data.expandedLongMessageIds,
      )
    : null;

  return (
    previousHighlighted === nextHighlighted &&
    previousRenderState?.renderMode === nextRenderState?.renderMode &&
    previousRenderState?.measurementMode === nextRenderState?.measurementMode &&
    previousRenderState?.isCollapsible === nextRenderState?.isCollapsible &&
    previousProps.data.density === nextProps.data.density &&
    previousProps.data.isSelectionMode === nextProps.data.isSelectionMode &&
    previousProps.data.currentUsername === nextProps.data.currentUsername &&
    previousProps.data.onReply === nextProps.data.onReply &&
    previousProps.data.onReact === nextProps.data.onReact &&
    previousProps.data.onEdit === nextProps.data.onEdit &&
    previousProps.data.onDelete === nextProps.data.onDelete &&
    previousProps.data.onInspect === nextProps.data.onInspect &&
    previousProps.data.onImageClick === nextProps.data.onImageClick &&
    previousProps.data.onFilePreview === nextProps.data.onFilePreview &&
    previousProps.data.onToggleSelect === nextProps.data.onToggleSelect &&
    previousProps.data.onNavigateToMessage ===
      nextProps.data.onNavigateToMessage &&
    previousProps.data.onToggleLongMessageExpand ===
      nextProps.data.onToggleLongMessageExpand &&
    previousProps.data.setItemSize === nextProps.data.setItemSize &&
    previousProps.data.onItemSizeChange === nextProps.data.onItemSizeChange
  );
};

const shouldObserveTimelineItemResize = (
  item: RenderableTimelineItem,
  renderState: TimelineMessageRenderState,
): boolean => {
  if (item.kind !== "group") {
    return false;
  }

  if (renderState.measurementMode !== "dynamic") {
    return false;
  }

  return item.items.some(({ message }) => {
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
  });
};

const estimateTimelineItemHeight = (
  item: RenderableTimelineItem,
  density: ChatDensity,
  layoutState: ChatLayoutState,
): number => {
  if (item.kind === "date") return 64;
  if (item.kind === "system") return 68;
  if (item.kind === "unread") return 48;
  if (item.kind !== "group") return 72;

  const densityOffset =
    density === "compact" ? -8 : density === "expanded" ? 14 : 0;
  const layoutOffset =
    layoutState === "with-panel" ? -6 : layoutState === "mobile" ? -4 : 0;
  let baseHeight = 26 + densityOffset + layoutOffset;

  if (!item.isOwn && item.showSenderName) {
    baseHeight += 16;
  }

  return (
    baseHeight +
    item.items.reduce((total, entry) => {
      const message = entry.message;
      const messageRenderState = resolveTimelineMessageRenderState(
        entry,
        new Set<string>(),
      );
      let nextHeight = entry.showMeta ? 36 : 16;

      if (message.replyToMessage) nextHeight += 48;
      if (message.forwardedFrom) nextHeight += 18;
      if ((message.reactions?.length ?? 0) > 0) nextHeight += 28;
      if (isFailedMessage(message) || isPendingMessage(message)) nextHeight += 8;

      switch (message.type) {
        case "image":
          nextHeight += 240;
          if (message.content?.trim()) nextHeight += 28;
          break;
        case "file":
          nextHeight += 112;
          break;
        case "voice":
          nextHeight += 92;
          break;
        default: {
          const approximateLines = Math.max(
            1,
            estimateTextLineCount(message.content, DEFAULT_TEXT_CHARS_PER_LINE),
          );
          const visibleLines =
            messageRenderState.renderMode === "collapsed"
              ? Math.min(
                  approximateLines,
                  LONG_MESSAGE_COLLAPSE_ESTIMATED_LINE_THRESHOLD,
                )
              : approximateLines;
          nextHeight += visibleLines * (layoutState === "normal" ? 18 : 17);
          if (
            messageRenderState.renderMode === "collapsed" &&
            messageRenderState.isCollapsible
          ) {
            nextHeight += 32;
          }
          if (hasInlineUrl(message.content)) {
            nextHeight += 48;
          }
          break;
        }
      }

      return total + nextHeight + 4;
    }, 0)
  );
};

const TimelineRow: React.FC<TimelineRowRenderProps<TimelineRowData>> =
  React.memo(({ index, style, data }) => {
    const item = data.items[index];
    const rowRef = React.useRef<HTMLDivElement>(null);
    const { onItemSizeChange, setItemSize } = data;
    const hasCommittedInitialMeasurementRef = React.useRef(false);
    const measuredItemKeyRef = React.useRef<string | null>(null);
    const renderState = item
      ? resolveTimelineMessageRenderState(item, data.expandedLongMessageIds)
      : null;

    React.useLayoutEffect(() => {
      const node = rowRef.current;
      if (!node || !item || !renderState) return;
      const currentItemKey = item.key || `${item.kind}-${index}`;

      if (measuredItemKeyRef.current !== currentItemKey) {
        measuredItemKeyRef.current = currentItemKey;
        hasCommittedInitialMeasurementRef.current = false;
      }

      if (renderState.measurementMode === "static") {
        if (hasCommittedInitialMeasurementRef.current) return;
        const staticMeasureRafId = requestAnimationFrame(() => {
          const currentNode = rowRef.current;
          if (!currentNode) return;
          const nextSize = Math.ceil(currentNode.getBoundingClientRect().height);
          setItemSize(index, nextSize);
          hasCommittedInitialMeasurementRef.current = true;
        });
        return () => cancelAnimationFrame(staticMeasureRafId);
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
        !shouldObserveTimelineItemResize(item, renderState)
      ) {
        return () => {
          cancelScheduledMeasure();
        };
      }

      const resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(node);
      return () => {
        resizeObserver.disconnect();
        cancelScheduledMeasure();
      };
    }, [index, item, onItemSizeChange, renderState, setItemSize]);

    if (!item) return null;

    const messageId =
      item.kind === "group"
        ? item.anchorMessageId
        : item.kind === "system"
          ? item.messageId
        : undefined;
    const timelineKey = item.key || `${item.kind}-${index}`;
    const isHighlighted =
      item.kind === "group"
        ? item.items.some((entry) =>
            isTargetMessage(entry.message, data.highlightedMessageId),
          )
        : item.kind === "system" &&
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
              {item.kind === "group" ? (
                <MessageGroup
                  row={item}
                  onReply={data.onReply}
                  onReact={data.onReact}
                  onInspect={data.onInspect}
                  onEdit={data.onEdit}
                  onDelete={data.onDelete}
                  onImageClick={data.onImageClick}
                  onFilePreview={data.onFilePreview}
                  density={data.density}
                  isSelectionMode={data.isSelectionMode}
                  selectedMessageIds={data.selectedMessageIds}
                  onToggleSelect={data.onToggleSelect}
                  onNavigateToMessage={data.onNavigateToMessage}
                  currentUsername={data.currentUsername}
                  expandedLongMessageIds={data.expandedLongMessageIds}
                  onToggleLongMessageExpand={data.onToggleLongMessageExpand}
                  insertedMessageKeys={data.insertedMessageKeys}
                  highlightedMessageId={data.highlightedMessageId}
                />
              ) : (
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
                  isSelected={false}
                  onToggleSelect={data.onToggleSelect}
                  onNavigateToMessage={data.onNavigateToMessage}
                  currentUsername={data.currentUsername}
                  textRenderMode="expanded"
                  isCollapsibleText={false}
                  shouldAnimateInsert={shouldAnimateInsert}
                />
              )}
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
  conversationId,
  conversationType,
  currentUserId,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onInspect,
  hasMore = false,
  isLoadingMore = false,
  isInitialLoading = false,
  historyLoadingState,
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
  const rtkMessages = useConversationMessagesRTK(conversationId);
  const messages = rtkMessages.messages;
  const rtkErrorMessage = rtkMessages.errorMessage;
  const retryRtkInitialMessages = rtkMessages.retryInitial;
  const hasRtkRuntimeWindow =
    rtkMessages.hasLoaded ||
    rtkMessages.isFetching ||
    messages.length > 0 ||
    Boolean(rtkErrorMessage);
  const effectiveHasMore = hasRtkRuntimeWindow
    ? rtkMessages.hasMoreOlder
    : hasMore;
  const effectiveIsLoadingMore =
    rtkMessages.isLoadingOlder ||
    (!hasRtkRuntimeWindow && Boolean(isLoadingMore));
  const effectiveIsInitialLoading =
    rtkMessages.isInitialLoading ||
    (!hasRtkRuntimeWindow && messages.length === 0 && Boolean(isInitialLoading));
  const effectiveError = rtkErrorMessage ?? error ?? null;
  const effectiveLoadMore = hasRtkRuntimeWindow
    ? rtkMessages.loadOlder
    : onLoadMore;
  const { t } = useTranslation();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const stickyDateRafRef = React.useRef<number | null>(null);
  const highlightTimerRef = React.useRef<number | null>(null);
  const lastSeenUnreadRestoreSignatureRef = React.useRef<string | null>(null);
  const pendingResizeAnchorRef = React.useRef<{
    messageId: string | null;
    offsetFromTop: number;
  } | null>(null);
  const bottomSettlePhaseRef = React.useRef<BottomSettlePhase>("idle");
  const timelineSizeChangeRafRef = React.useRef<number | null>(null);
  const pendingTimelineSizeChangesRef = React.useRef<
    Map<string, { index: number; delta: number }>
  >(new Map());
  const lastDomVisibleMessageIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isChatPerformanceEnabled()) return;
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.id === lastDomVisibleMessageIdRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const selector = `[data-message-id="${CSS.escape(latestMessage.id)}"]`;
      const visible = Boolean(outerRef.current?.querySelector(selector));
      if (!visible) return;
      lastDomVisibleMessageIdRef.current = latestMessage.id;
      logChatPerformance("fe.dom.message.visible", {
        conversationId,
        messageId: latestMessage.id,
        clientMessageId: latestMessage.clientMessageId ?? null,
        messageSeq: latestMessage.serverSeq ?? latestMessage.messageSeq ?? null,
        messageCount: messages.length,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [conversationId, messages]);
  const isPinnedToBottomRef = React.useRef(true);
  const previousMessagesForInsertRef = React.useRef<Message[]>([]);
  const previousMessagesForPerfRef = React.useRef<Message[]>([]);
  const previousPerfConversationIdRef = React.useRef<string | null>(null);
  const lastResetConversationRef = React.useRef<string | null>(null);
  const firstRenderMeasuredConversationRef = React.useRef<string | null>(null);
  const lastLayoutRef = React.useRef({
    viewportHeight: 0,
    composerHeight,
  });
  const [stickyDate, setStickyDate] = React.useState<Date | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);
  const [contentWidthBucket, setContentWidthBucket] = React.useState(0);
  const [expandedLongMessageIds, setExpandedLongMessageIds] = React.useState<
    Set<string>
  >(() => new Set());
  const [insertedMessageKeys, setInsertedMessageKeys] = React.useState<
    Set<string>
  >(EMPTY_INSERTED_MESSAGE_KEYS);
  const [liveUnreadMarker, setLiveUnreadMarker] =
    React.useState<UnreadTimelineMarker | null>(unreadMarker ?? null);
  const getTimelineItemKey = React.useCallback(
    (item: ConversationThreadRow, index: number) =>
      item.key || `${item.kind}-${index}`,
    [],
  );
  const setBottomSettlePhase = React.useCallback(
    (phase: BottomSettlePhase, details?: Record<string, unknown>) => {
      if (bottomSettlePhaseRef.current === phase) {
        return;
      }

      bottomSettlePhaseRef.current = phase;
      logScrollTrace("bottom_settle_phase_changed", {
        conversationId,
        phase,
        ...(details ?? {}),
      });
    },
    [conversationId],
  );
  const timelineItems = useConversationTimelineRows({
    messages,
    currentUserId,
    conversationType,
    unreadMarker: liveUnreadMarker,
  });
  const threadRows = useConversationThreadRows(timelineItems);
  React.useEffect(() => {
    const previousMessages = previousMessagesForInsertRef.current;
    if (
      previousMessages.length === 0 ||
      messages.length <= previousMessages.length
    ) {
      setInsertedMessageKeys(EMPTY_INSERTED_MESSAGE_KEYS);
      previousMessagesForInsertRef.current = messages;
      return;
    }

    const previousTail = previousMessages[previousMessages.length - 1];
    if (
      !previousTail ||
      messages[previousMessages.length - 1] !== previousTail
    ) {
      setInsertedMessageKeys(EMPTY_INSERTED_MESSAGE_KEYS);
      previousMessagesForInsertRef.current = messages;
      return;
    }

    const insertedKeys = new Set<string>();
    for (let index = previousMessages.length; index < messages.length; index += 1) {
      const message = messages[index];
      if (message) {
        insertedKeys.add(getMessageStableKey(message));
      }
    }

    setInsertedMessageKeys(
      insertedKeys.size > 0 ? insertedKeys : EMPTY_INSERTED_MESSAGE_KEYS,
    );
    previousMessagesForInsertRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    setExpandedLongMessageIds(new Set());
  }, [conversationId]);

  const toggleLongMessageExpand = React.useCallback((messageId: string) => {
    setExpandedLongMessageIds((previous) => {
      const next = new Set(previous);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const estimateItemSize = React.useCallback(
    (item: ConversationThreadRow) =>
      estimateTimelineItemHeight(
        item,
        density,
        layoutState,
      ),
    [density, layoutState],
  );
  const getTimelineMeasurementKey = React.useCallback(
    (item: ConversationThreadRow, index: number) => {
      const renderState = resolveTimelineMessageRenderState(
        item,
        expandedLongMessageIds,
      );
      return [
        getTimelineItemKey(item, index),
        density ?? "comfortable",
        contentWidthBucket,
        renderState.measurementMode,
      ].join(":");
    },
    [contentWidthBucket, density, expandedLongMessageIds, getTimelineItemKey],
  );
  const listOverscan = effectiveIsLoadingMore && !effectiveIsInitialLoading ? 20 : 10;

  const tanStackVirtualizer = useTanStackVirtualizedMessages({
    items: threadRows,
    viewportRef,
    outerRef,
    observeViewport: !effectiveIsInitialLoading && messages.length > 0,
    enabled: !effectiveIsInitialLoading && messages.length > 0,
    debugLabel: conversationId,
    overscan: listOverscan,
    estimateItemSize,
    getItemKey: getTimelineItemKey,
    getMeasurementKey: getTimelineMeasurementKey,
    shouldResetAfterSizeChange: (item) =>
      resolveTimelineMessageRenderState(item, expandedLongMessageIds)
        .measurementMode === "dynamic",
  });

  const {
    viewportHeight,
    getItemSize,
    getItemOffset,
    findItemAtOffset,
    setItemSize,
    resetMeasurements,
    scrollToOffset,
    scrollToIndex,
    consumeProgrammaticScroll,
  } = tanStackVirtualizer;
  const tanStackVirtualItems = tanStackVirtualizer.virtualItems;
  const tanStackTotalSize = tanStackVirtualizer.totalSize;

  React.useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    if (!viewportElement) {
      return;
    }

    const measureWidthBucket = () => {
      const width = Math.max(
        0,
        viewportElement.clientWidth ||
          Math.round(viewportElement.getBoundingClientRect().width),
      );
      const nextBucket = Math.max(1, Math.round(width / 32));
      setContentWidthBucket((previous) =>
        previous === nextBucket ? previous : nextBucket,
      );
    };

    measureWidthBucket();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureWidthBucket);
      return () => {
        window.removeEventListener("resize", measureWidthBucket);
      };
    }

    const resizeObserver = new ResizeObserver(measureWidthBucket);
    resizeObserver.observe(viewportElement);
    return () => {
      resizeObserver.disconnect();
    };
  }, [conversationId, viewportRef]);

  React.useEffect(() => {
    resetMeasurements();
  }, [
    conversationId,
    contentWidthBucket,
    density,
    expandedLongMessageIds,
    layoutState,
    resetMeasurements,
  ]);

  React.useEffect(() => {
    if (lastResetConversationRef.current === conversationId) {
      return;
    }

    lastResetConversationRef.current = conversationId;
    if (timelineSizeChangeRafRef.current !== null) {
      cancelAnimationFrame(timelineSizeChangeRafRef.current);
      timelineSizeChangeRafRef.current = null;
    }
    pendingResizeAnchorRef.current = null;
    pendingTimelineSizeChangesRef.current.clear();
    logScrollTrace("conversation_open_start", {
      conversationId,
      messageCount: messages.length,
      lastMessageId: messages[messages.length - 1]?.id ?? null,
      lastSeq: messages[messages.length - 1]?.serverSeq ?? null,
      scrollTop: outerRef.current?.scrollTop ?? 0,
      scrollHeight: outerRef.current?.scrollHeight ?? 0,
      clientHeight: outerRef.current?.clientHeight ?? 0,
      distanceToBottom: null,
      virtualItemsCount: tanStackVirtualItems.length,
      reason: "conversation-change",
      source: "MessageList",
    });
    setBottomSettlePhase("loading-initial", {
      messageCount: messages.length,
    });
    firstRenderMeasuredConversationRef.current = null;
    previousMessagesForInsertRef.current = messages;
    previousMessagesForPerfRef.current = messages;
    previousPerfConversationIdRef.current = conversationId;
  }, [conversationId, messages, setBottomSettlePhase, tanStackVirtualItems.length]);

  React.useEffect(() => {
    if (effectiveIsInitialLoading) {
      setBottomSettlePhase("loading-initial", {
        messageCount: messages.length,
      });
      return;
    }

    if (messages.length === 0 && rtkMessages.hasLoaded) {
      setBottomSettlePhase("settled", {
        messageCount: 0,
      });
      return;
    }

    if (
      messages.length === 0 ||
      threadRows.length === 0 ||
      viewportHeight <= 0 ||
      firstRenderMeasuredConversationRef.current === conversationId
    ) {
      if (messages.length > 0) {
        setBottomSettlePhase("waiting-for-measurement", {
          messageCount: messages.length,
          rowCount: threadRows.length,
          viewportHeight,
        });
      }
      return;
    }

    firstRenderMeasuredConversationRef.current = conversationId;
    setBottomSettlePhase("waiting-for-measurement", {
      messageCount: messages.length,
      rowCount: threadRows.length,
      viewportHeight,
    });
    measureChatPerformance(
      "conversation-open-first-render",
      "conversation-open-start",
      conversationId,
      {
        messageCount: messages.length,
        rowCount: threadRows.length,
        viewportHeight,
      },
    );
  }, [
    conversationId,
    effectiveIsInitialLoading,
    messages.length,
    rtkMessages.hasLoaded,
    setBottomSettlePhase,
    threadRows.length,
    viewportHeight,
  ]);

  React.useEffect(() => {
    if (previousPerfConversationIdRef.current !== conversationId) {
      previousPerfConversationIdRef.current = conversationId;
      previousMessagesForPerfRef.current = messages;
      return;
    }

    const previousMessages = previousMessagesForPerfRef.current;
    if (previousMessages.length > 0 && messages.length > previousMessages.length) {
      const previousFirstKey = previousMessages[0]
        ? getMessageStableKey(previousMessages[0])
        : null;
      const nextFirstKey = messages[0] ? getMessageStableKey(messages[0]) : null;
      const prependedCount = messages.length - previousMessages.length;
      const previousTail = previousMessages[previousMessages.length - 1];
      const tailStillInPlace =
        Boolean(previousTail) &&
        messages[previousMessages.length - 1] === previousTail;

      if (previousFirstKey && nextFirstKey && previousFirstKey !== nextFirstKey) {
        measureChatPerformance(
          "load-older-rendered",
          "load-older-start",
          conversationId,
          {
            previousCount: previousMessages.length,
            nextCount: messages.length,
            prependedCount,
          },
        );
      } else if (tailStillInPlace) {
        measureChatPerformance(
          "append-realtime-message-rendered",
          "realtime-message-received",
          conversationId,
          {
            previousCount: previousMessages.length,
            nextCount: messages.length,
            appendedCount: messages.length - previousMessages.length,
          },
        );
      }
    }

    previousMessagesForPerfRef.current = messages;
  }, [conversationId, messages]);

  React.useEffect(() => {
    if (!isChatPerformanceEnabled() || viewportHeight <= 0) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      const outer = outerRef.current;
      if (!outer) return;

      logChatPerformance("message-list-dom-node-count", {
        conversationId,
        messageCount: messages.length,
        rowCount: threadRows.length,
        renderedTimelineRows:
          outer.querySelectorAll("[data-timeline-key]").length,
        renderedMessageNodes: outer.querySelectorAll("[data-message-id]").length,
        virtualRows: tanStackVirtualItems.length,
        overscan: listOverscan,
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [
    conversationId,
    listOverscan,
    messages.length,
    tanStackVirtualItems.length,
    threadRows.length,
    viewportHeight,
  ]);

  const getVirtualContentHeight = React.useCallback(() => {
    if (threadRows.length === 0) {
      return 0;
    }

    const lastIndex = threadRows.length - 1;
    return Math.max(
      tanStackTotalSize,
      getItemOffset(lastIndex) + getItemSize(lastIndex),
    );
  }, [getItemOffset, getItemSize, tanStackTotalSize, threadRows.length]);

  const getBottomScrollTarget = React.useCallback(
    (element: HTMLElement | null = outerRef.current) => {
      const viewportSize = element?.clientHeight ?? viewportHeight;
      if (viewportSize <= 0) {
        return 0;
      }

      const contentHeight = Math.max(
        getVirtualContentHeight(),
        element?.scrollHeight ?? 0,
      );
      return Math.max(0, Math.ceil(contentHeight - viewportSize));
    },
    [getVirtualContentHeight, outerRef, viewportHeight],
  );

  const getVirtualDistanceFromBottom = React.useCallback(
    (element: HTMLElement | null = outerRef.current) => {
      if (!element) {
        return 0;
      }

      return Math.max(0, getBottomScrollTarget(element) - element.scrollTop);
    },
    [getBottomScrollTarget, outerRef],
  );

  const buildScrollDebugDetails = React.useCallback(
    (reason: string, extra?: Record<string, unknown>) => {
      const outer = outerRef.current;
      const latestMessage = messages[messages.length - 1];
      const latestMessageWithSeq = latestMessage as
        | (Message & { messageSeq?: number })
        | undefined;
      const latestSeq =
        typeof latestMessage?.serverSeq === "number"
          ? latestMessage.serverSeq
          : typeof latestMessageWithSeq?.messageSeq === "number"
            ? latestMessageWithSeq.messageSeq
            : null;

      return {
        conversationId,
        messageCount: messages.length,
        lastMessageId: latestMessage?.id ?? null,
        lastSeq: latestSeq,
        scrollTop: outer?.scrollTop ?? 0,
        scrollHeight: outer?.scrollHeight ?? 0,
        clientHeight: outer?.clientHeight ?? 0,
        distanceToBottom: outer ? getVirtualDistanceFromBottom(outer) : null,
        virtualItemsCount: tanStackVirtualItems.length,
        reason,
        ...(extra ?? {}),
      };
    },
    [
      conversationId,
      getVirtualDistanceFromBottom,
      messages,
      outerRef,
      tanStackVirtualItems.length,
    ],
  );

  React.useEffect(() => {
    logScrollTrace(
      "message_rows_derived",
      buildScrollDebugDetails("rows-derived", {
        rowCount: threadRows.length,
        timelineItemsCount: timelineItems.length,
      }),
    );
  }, [
    buildScrollDebugDetails,
    threadRows.length,
    timelineItems.length,
  ]);

  React.useEffect(() => {
    if (viewportHeight <= 0 || messages.length === 0) {
      return;
    }

    logScrollTrace(
      "virtualizer_measured",
      buildScrollDebugDetails("virtualizer-measured", {
        rowCount: threadRows.length,
        totalSize: tanStackTotalSize,
        viewportHeight,
      }),
    );
  }, [
    buildScrollDebugDetails,
    messages.length,
    tanStackTotalSize,
    threadRows.length,
    viewportHeight,
  ]);

  const resolveAnchorTimelineIndex = React.useCallback(
    (messageId: string | null): number => {
      const resolvedMessageId = messageId ?? messages[0]?.id ?? null;
      if (!resolvedMessageId) {
        return -1;
      }

      return threadRows.findIndex((item) => {
        if (item.kind === "group") {
          return item.messageIds.includes(resolvedMessageId);
        }

        return item.kind === "system" && item.messageId === resolvedMessageId;
      });
    },
    [messages, threadRows],
  );

  const captureVisibleAnchor = React.useCallback(() => {
    const outer = outerRef.current;
    if (!outer || threadRows.length === 0) return null;

    const visibleItem = findItemAtOffset(outer.scrollTop);
    if (!visibleItem) return null;

    const anchorIndex = threadRows.findIndex(
      (item, index) =>
        index >= visibleItem.index &&
        isThreadRowMessageLike(item),
    );
    if (anchorIndex < 0) {
      return null;
    }

    const item = threadRows[anchorIndex];
    if (!item || !isThreadRowMessageLike(item)) {
      return null;
    }

    return {
      messageId: item.kind === "group" ? item.anchorMessageId : item.messageId,
      offsetFromTop: outer.scrollTop - getItemOffset(anchorIndex),
    };
  }, [findItemAtOffset, getItemOffset, outerRef, threadRows]);

  const {
    pendingNewMessages,
    isPinnedToBottom,
    mode: scrollMode,
    firstDetachedUnreadMessageId,
    jumpToLatest,
    handleUserScroll,
    requestOffset,
    detachForJump,
    handleMediaResized,
  } = useChatScrollController({
    conversationId,
    messages,
    currentUserId,
    hasUnread: Boolean(
      unreadRestoreSignature ||
        unreadMarker?.active ||
        liveUnreadMarker?.active,
    ),
    unreadRestoreSignature,
    onUnreadRestoreConsumed,
    isInitialLoading: effectiveIsInitialLoading,
    hasLoaded: rtkMessages.hasLoaded,
    isFetchingMessages: rtkMessages.isFetching,
    hasMoreOlder: effectiveHasMore,
    isLoadingOlder: effectiveIsLoadingMore,
    onLoadOlder: effectiveLoadMore,
    outerRef,
    itemCount: threadRows.length,
    virtualItemsCount: tanStackVirtualItems.length,
    totalSize: tanStackTotalSize,
    viewportHeight,
    getItemOffset,
    resolveMessageIndex: resolveAnchorTimelineIndex,
    captureVisibleAnchor,
    scrollToOffset,
    scrollToIndex,
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

    if (unreadRestoreSignature) {
      logScrollTrace("unread_restore_signature_seen", {
        conversationId,
        signature: unreadRestoreSignature,
      });
    }
  }, [conversationId, unreadRestoreSignature]);

  const showNewMessagesPill = pendingNewMessages > 0;
  const showJumpToBottom =
    scrollMode === "settled_reading_history" && pendingNewMessages === 0;

  const topOverlayPlacements = React.useMemo(
    () =>
      resolveOverlayPlacements([
        {
          id: "error",
          visible: Boolean(effectiveError && messages.length > 0),
          priority: 100,
          slot: "top-center",
        },
        {
          id: "loading",
          visible: effectiveIsLoadingMore && !effectiveIsInitialLoading,
          priority: 80,
          slot: "top-center",
        },
        {
          id: "sticky-date",
          visible:
            !effectiveIsInitialLoading && messages.length > 0 && Boolean(stickyDate),
          priority: 30,
          slot: "top-center",
        },
      ]),
    [
      effectiveError,
      effectiveIsInitialLoading,
      effectiveIsLoadingMore,
      messages.length,
      stickyDate,
    ],
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

    pendingTimelineSizeChangesRef.current.clear();

    const isInTransitToBottom =
      scrollMode === "scrolling_to_bottom" ||
      scrollMode === "appending_new_message";

    // Use ref instead of React state to avoid stale closure: finishBottom sets
    // isPinnedRef.current synchronously, but setIsPinnedToBottom(true) is async.
    // If the virtualizer size-change fires before React re-renders, isPinnedToBottom
    // (state) would still be false, causing incorrect anchor-preserve behavior.
    if (isPinnedToBottomRef.current || isInTransitToBottom) {
      pendingResizeAnchorRef.current = null;
      handleMediaResized();
      return;
    }

    const anchor = pendingResizeAnchorRef.current;
    pendingResizeAnchorRef.current = null;
    if (!anchor) {
      return;
    }

    requestAnimationFrame(() => {
      handleMediaResized(anchor);
    });
  }, [handleMediaResized, scrollMode]);

  const handleTimelineItemSizeChange = React.useCallback(
    ({ index, key, delta }: { index: number; key: string; delta: number }) => {
      if (Math.abs(delta) <= ITEM_SIZE_CHANGE_THRESHOLD) {
        return;
      }

      if (!isPinnedToBottomRef.current && !pendingResizeAnchorRef.current) {
        pendingResizeAnchorRef.current = captureVisibleAnchor();
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
    [captureVisibleAnchor, flushTimelineItemSizeChanges],
  );

  const rowData = React.useMemo<TimelineRowData>(
    () => ({
      items: threadRows,
      onReply,
      onReact,
      onEdit,
      onDelete,
      onInspect,
      onImageClick,
      onFilePreview,
      setItemSize,
      density,
      isSelectionMode,
      selectedMessageIds,
      onToggleSelect,
      onNavigateToMessage,
      currentUsername,
      expandedLongMessageIds,
      onToggleLongMessageExpand: toggleLongMessageExpand,
      insertedMessageKeys,
      highlightedMessageId,
      onItemSizeChange: handleTimelineItemSizeChange,
    }),
    [
      currentUsername,
      density,
      expandedLongMessageIds,
      handleTimelineItemSizeChange,
      highlightedMessageId,
      insertedMessageKeys,
      isSelectionMode,
      onDelete,
      onEdit,
      onInspect,
      onFilePreview,
      onImageClick,
      onNavigateToMessage,
      onReact,
      onReply,
      toggleLongMessageExpand,
      onToggleSelect,
      selectedMessageIds,
      setItemSize,
      threadRows,
    ],
  );

  const handleScrollUpdate = React.useCallback(
    (scrollOffset: number, scrollUpdateWasRequested: boolean) => {
      if (scrollUpdateWasRequested) return;
      handleUserScroll(scrollOffset);

      if (stickyDateRafRef.current !== null) {
        cancelAnimationFrame(stickyDateRafRef.current);
      }
      stickyDateRafRef.current = requestAnimationFrame(() => {
        const targetIndex = findItemAtOffset(scrollOffset)?.index ?? 0;

        let nextStickyDate: Date | null = null;
        for (let index = targetIndex; index >= 0; index -= 1) {
          const item = threadRows[index];
          if (!item) continue;
          if (item.kind === "date") {
            nextStickyDate = item.date;
            break;
          }
          if (item.kind === "group") {
            nextStickyDate = item.startedAt;
            break;
          }
          if (item.kind === "system") {
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
    [findItemAtOffset, handleUserScroll, threadRows],
  );

  const handleTanStackScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const maxScroll = getBottomScrollTarget(event.currentTarget);
      const scrollOffset = Math.min(event.currentTarget.scrollTop, maxScroll);

      if (event.currentTarget.scrollTop !== scrollOffset) {
        event.currentTarget.scrollTop = scrollOffset;
        return;
      }
      handleScrollUpdate(
        scrollOffset,
        consumeProgrammaticScroll(scrollOffset),
      );
    },
    [consumeProgrammaticScroll, getBottomScrollTarget, handleScrollUpdate],
  );

  const handleRetry = React.useCallback(() => {
    if (rtkErrorMessage) {
      void retryRtkInitialMessages().catch(() => undefined);
      return;
    }
    if (!onRetry) return;
    void Promise.resolve(onRetry());
  }, [onRetry, retryRtkInitialMessages, rtkErrorMessage]);

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
          requestOffset(0, "keyboard-home");
          break;
        case "PageDown":
          event.preventDefault();
          requestOffset(
            outer.scrollTop + Math.round(outer.clientHeight * 0.9),
            "keyboard-page-down",
          );
          break;
        case "PageUp":
          event.preventDefault();
          requestOffset(
            Math.max(
              0,
              outer.scrollTop - Math.round(outer.clientHeight * 0.9),
            ),
            "keyboard-page-up",
          );
          break;
        default:
          break;
      }
    },
    [jumpToLatest, requestOffset],
  );

  const handleProfilerRender = React.useCallback<React.ProfilerOnRenderCallback>(
    (
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    ) => {
      logChatPerformance("react-profiler-message-list", {
        id,
        phase,
        conversationId,
        actualDuration,
        baseDuration,
        startTime,
        commitTime,
        messageCount: messages.length,
        rowCount: threadRows.length,
      });
    },
    [conversationId, messages.length, threadRows.length],
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
      requestOffset(nextOffset, reason);
      return true;
    },
    [conversationId, getItemOffset, getItemSize, requestOffset],
  );

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
    // handleMediaResized internally handles both cases:
    // pinned → scroll to bottom; detached → preserve visual anchor
    handleMediaResized();
  }, [composerHeight, handleMediaResized, viewportHeight]);

  React.useEffect(() => {
    if (!jumpToMessageId) return;

    const targetIndex = threadRows.findIndex(
      (item) =>
        item.kind === "group" &&
        item.items.some((entry) =>
          isTargetMessage(entry.message, jumpToMessageId),
        ),
    );
    if (targetIndex < 0) {
      logScrollTrace("jump_target_waiting_for_render", {
        conversationId,
        messageId: jumpToMessageId,
      });
      return;
    }

    const targetMessage = threadRows[targetIndex]?.kind === "group"
      ? threadRows[targetIndex].items.find((entry) =>
          isTargetMessage(entry.message, jumpToMessageId),
        )?.message
      : null;
    const shouldExpandTarget = targetMessage
      ? resolveThreadMessageRenderState(
          {
            kind: "message",
            message: targetMessage,
          },
          expandedLongMessageIds,
        ).isCollapsible && !expandedLongMessageIds.has(targetMessage.id)
      : false;

    if (shouldExpandTarget && targetMessage) {
      setExpandedLongMessageIds((previous) => {
        if (previous.has(targetMessage.id)) {
          return previous;
        }
        const next = new Set(previous);
        next.add(targetMessage.id);
        return next;
      });

      if (typeof window === "undefined") {
        detachForJump("jump-to-message");
        ensureItemVisible(targetIndex, "jump-to-message");
        highlightMessage(jumpToMessageId);
        onJumpHandled?.(jumpToMessageId);
        return;
      }

      window.requestAnimationFrame(() => {
        detachForJump("jump-to-message");
        ensureItemVisible(targetIndex, "jump-to-message");
        highlightMessage(jumpToMessageId);
        onJumpHandled?.(jumpToMessageId);
      });
      return;
    }

    detachForJump("jump-to-message");
    ensureItemVisible(targetIndex, "jump-to-message");
    highlightMessage(jumpToMessageId);
    onJumpHandled?.(jumpToMessageId);
  }, [
    conversationId,
    detachForJump,
    expandedLongMessageIds,
    ensureItemVisible,
    highlightMessage,
    jumpRequestVersion,
    jumpToMessageId,
    onJumpHandled,
    threadRows,
  ]);

  React.useEffect(() => {
    if (threadRows.length === 0) {
      setStickyDate(null);
      return;
    }

    const scrollTop = outerRef.current?.scrollTop ?? 0;
    const targetIndex = findItemAtOffset(scrollTop)?.index ?? 0;

    for (let index = targetIndex; index >= 0; index -= 1) {
      const item = threadRows[index];
      if (!item) continue;
      if (item.kind === "date") {
        setStickyDate(item.date);
        return;
      }
      if (item.kind === "group") {
        setStickyDate(item.startedAt);
        return;
      }
      if (item.kind === "system") {
        setStickyDate(new Date(item.message.createdAt));
        return;
      }
    }

    setStickyDate(null);
  }, [conversationId, findItemAtOffset, threadRows]);

  React.useEffect(() => {
    if (
      effectiveIsInitialLoading ||
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
    effectiveIsInitialLoading,
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

  const virtualizedRows =
    viewportHeight > 0 ? (
      <div
        ref={outerRef}
        onScroll={handleTanStackScroll}
        data-testid="message-list-scroll"
        className="h-full min-h-0 overflow-auto overscroll-contain"
      >
        <div
          style={{
            height: tanStackTotalSize,
            position: "relative",
            width: "100%",
          }}
        >
          {tanStackVirtualItems.map((virtualItem) => (
            <TimelineRow
              key={String(virtualItem.key)}
              index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualItem.size,
                transform: `translateY(${Math.round(virtualItem.start)}px)`,
              }}
              data={rowData}
              isScrolling={false}
            />
          ))}
        </div>
      </div>
    ) : null;

  const profiledVirtualizedRows = isChatPerformanceEnabled() ? (
    <React.Profiler
      id={`MessageList:${conversationId}`}
      onRender={handleProfilerRender}
    >
      {virtualizedRows}
    </React.Profiler>
  ) : (
    virtualizedRows
  );

  return (
    <section className={clsx("relative h-full min-h-0 flex-1", className)}>
      {effectiveIsInitialLoading && (
        <div className="chat-background h-full min-h-0 overflow-y-auto px-[var(--chat-lane-padding)] py-4">
          <MessageListSkeleton />
        </div>
      )}

      {!effectiveIsInitialLoading && (
        <div
          className="chat-background h-full min-h-0 overflow-hidden pb-2 pt-1"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-busy={effectiveIsLoadingMore}
          aria-label={t("chat:message.inConversationAria")}
        >
          {effectiveError && messages.length === 0 ? (
            <ErrorState
              message={effectiveError}
              onRetry={handleRetry}
            />
          ) : messages.length === 0 && !historyLoadingState?.isPartial ? (
            <EmptyMessages />
          ) : messages.length === 0 ? (
            <div
              className="h-full min-h-0 overflow-y-auto px-[var(--chat-lane-padding)] py-4"
              aria-busy="true"
            >
              <MessageListSkeleton count={6} />
            </div>
          ) : (
            <div
              ref={viewportRef}
              data-testid="message-list-viewport"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className={clsx(
                "h-full min-h-0 rounded-md outline-none",
                "focus-visible:ring-2 focus-visible:ring-focus/30",
              )}
            >
              {profiledVirtualizedRows}
            </div>
          )}
        </div>
      )}

      <MessageListOverlays
        hasMessages={messages.length > 0}
        historyLoadingState={historyLoadingState}
        stickyDate={stickyDate}
        showStickyDate={Boolean(topOverlayPlacements["sticky-date"]?.visible)}
        showError={Boolean(topOverlayPlacements.error?.visible)}
        error={effectiveError}
        canRetry={Boolean(onRetry || rtkErrorMessage)}
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
  previousProps.conversationId === nextProps.conversationId &&
  previousProps.conversationType === nextProps.conversationType &&
  previousProps.currentUserId === nextProps.currentUserId &&
  previousProps.onReply === nextProps.onReply &&
  previousProps.onReact === nextProps.onReact &&
  previousProps.onEdit === nextProps.onEdit &&
  previousProps.onDelete === nextProps.onDelete &&
  previousProps.onInspect === nextProps.onInspect &&
  previousProps.historyLoadingState === nextProps.historyLoadingState &&
  previousProps.onImageClick === nextProps.onImageClick &&
  previousProps.onFilePreview === nextProps.onFilePreview &&
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
