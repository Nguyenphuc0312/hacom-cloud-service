/* eslint-disable react-refresh/only-export-components -- estimateAttachmentHeight is covered by a focused regression test. */
/**
 * Simple Virtualized Chat Timeline.
 *
 * Production chat timeline. Built on
 * `@tanstack/react-virtual` purely for *render* virtualization; all scroll
 * behavior lives in `useSimpleChatScroll`. There is no scroll owner, no
 * command queue, no state machine, no bridge — only one component sets
 * `scrollTop`, and it does so via the rules in `useSimpleChatScroll`.
 *
 * Intentionally narrower than MessageList for v1: selection mode, jump-to-
 * message highlight, sticky-date overlay, error/empty visuals follow up
 * later. The goal is a stable, readable scroll surface in production.
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileType, type Attachment, type Conversation, type ImageClickPayload, type Message } from "../../../types";
import type { ChatDensity } from "../../../stores/uiStore";
import type { ChatLayoutState } from "../../../utils/densityPolicy";
import type { UnreadTimelineMarker } from "../../../utils/timelinePlanner";
import { MessageItem } from "../../../components/chat/MessageItem";
import { MessageGroup } from "../../../components/chat/thread/MessageGroup";
import { useConversationTimelineRows } from "../hooks/useConversationTimelineRows";
import {
  useConversationThreadRows,
  type ConversationThreadRow,
} from "../hooks/useConversationThreadRows";
import { useSimpleChatScroll } from "./useSimpleChatScroll";
import {
  isMessageDebugEnabled,
  logMessageDebug,
} from "../../../utils/messageDebug";
import { ScrollToLatestButton } from "./ScrollToLatestButton";

export interface SimpleVirtualizedChatTimelineProps {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  messages: readonly Message[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward?: (message: Message) => void;
  onPin?: (messageId: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
    context?: "ADMIN_DELETE",
  ) => void | Promise<void>;
  /** Override the default chat retry for transport-specific messages. */
  onRetry?: (message: Message) => void | Promise<void>;
  /** Restrict each message menu to the My Documents Cloud actions. */
  cloudMessageActionsOnly?: boolean;
  viewerCanRecallOthers?: boolean;
  onImageClick?: (payload: ImageClickPayload) => void;
  onFilePreview?: (attachment: Attachment) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  isInitialLoading?: boolean;
  onLoadMore?: () => void | Promise<void>;
  density?: ChatDensity;
  layoutState: ChatLayoutState;
  isSelectionMode?: boolean;
  selectedMessageIds?: Set<string>;
  onToggleSelect?: (messageId: string) => void;
  onStartSelectionMode?: () => void;
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  composerHeight?: number;
  className?: string;
  /** Fires when the user scrolls to within the near-bottom threshold. */
  onBottomVisible?: () => void;
  /** Message id to scroll to + briefly highlight. */
  jumpToMessageId?: string | null;
  /** Bumped on every jump request so repeated jumps to the same id re-fire. */
  jumpNonce?: number;
}

const EMPTY_SELECTED = new Set<string>();
const EMPTY_INSERTED = new Set<string>();

const LONG_TEXT_HEIGHT_MULTIPLIER = 1.15;
const LONG_TEXT_THRESHOLD_CHARS = 200;

// Mirror ImageMessage's reserved-box math so the virtualizer's pre-measure
// estimate matches what actually renders. A wrong (too-small) estimate is what
// makes the timeline grow after measureElement runs, which triggers the Rule-9
// re-anchor "jump" when opening an image-heavy conversation.
const MEDIA_DISPLAY_MAX_WIDTH = 320;
const MEDIA_DISPLAY_FALLBACK_WIDTH = 280;
const MEDIA_FALLBACK_RATIO = 4 / 3;
const AUDIO_ATTACHMENT_HEIGHT = 56;

/**
 * True when a keydown is a Ctrl/Cmd+A that should select only the timeline.
 *
 * Ctrl+A anywhere in the chat otherwise hits the browser default and selects
 * the entire document — rail, room list, composer hint — instead of just the
 * messages the way Zalo does. Typing in an input or the composer keeps the
 * native behavior: there, "select all" means the field, not the transcript.
 */
export const shouldScopeSelectAll = (event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): boolean => {
  // `key` is "A" under Shift/Caps Lock, so compare case-insensitively.
  if (event.key.toLowerCase() !== "a") return false;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
  const target = event.target as HTMLElement | null;
  if (!target || typeof target.closest !== "function") return true;
  return !(
    target.isContentEditable || target.closest("input, textarea, [contenteditable='true']")
  );
};

/** Reserved render height for one attachment, matching ImageMessage's box. */
export const estimateAttachmentHeight = (attachment: Attachment): number => {
  if (attachment.type === FileType.IMAGE || attachment.type === FileType.VIDEO) {
    const displayWidth = attachment.width
      ? Math.min(attachment.width, MEDIA_DISPLAY_MAX_WIDTH)
      : MEDIA_DISPLAY_FALLBACK_WIDTH;
    const ratio =
      attachment.width && attachment.height
        ? attachment.width / attachment.height
        : MEDIA_FALLBACK_RATIO;
    return ratio > 0 ? Math.round(displayWidth / ratio) : displayWidth;
  }
  if (attachment.type === FileType.AUDIO) {
    return AUDIO_ATTACHMENT_HEIGHT;
  }
  return 0;
};

/** Sum of reserved media heights across all items in a group row. */
const estimateRowMediaHeight = (row: ConversationThreadRow): number => {
  if (row.kind !== "group") return 0;
  let total = 0;
  for (const item of row.items) {
    for (const attachment of item.message.attachments ?? []) {
      total += estimateAttachmentHeight(attachment);
    }
  }
  return total;
};

/** Whether any item in the row has a long text content. */
const rowHasLongText = (
  row: ConversationThreadRow | undefined,
): boolean => {
  if (!row || row.kind !== "group") return false;
  return row.items.some(
    (item) =>
      item.message.content != null &&
      item.message.content.length > LONG_TEXT_THRESHOLD_CHARS,
  );
};

const estimateRowHeight = (
  row: ConversationThreadRow | undefined,
): number => {
  if (!row) return 72;
  if (row.kind === "date") return 56;
  if (row.kind === "unread") return 44;
  if (row.kind === "system") return 64;
  // group — coarse heuristic; measureElement corrects it after first paint.
  // We err slightly HIGH on media (real reserved box height) because an
  // over-estimate shrinks after measuring (no upward re-anchor needed),
  // whereas an under-estimate forces the disruptive Rule-9 re-anchor.
  const items = row.items.length;
  const baseHeight = 56 + items * 56;
  const mediaHeight = estimateRowMediaHeight(row);

  if (mediaHeight > 0) {
    return baseHeight + mediaHeight;
  }
  if (rowHasLongText(row)) {
    return Math.round(baseHeight * LONG_TEXT_HEIGHT_MULTIPLIER);
  }
  return baseHeight;
};

const buildJumpRowIndex = (
  threadRows: readonly ConversationThreadRow[],
): Map<string, number> => {
  const map = new Map<string, number>();
  threadRows.forEach((row, index) => {
    if (row.kind !== "group") return;
    for (const item of row.items) {
      const message = item.message;
      const aliases = new Set(
        [
          item.messageId,
          message.id,
          message.localId,
          message.stableId,
          message.clientMessageId,
        ].filter((value): value is string => Boolean(value)),
      );
      aliases.forEach((alias) => {
        if (!map.has(alias)) {
          map.set(alias, index);
        }
      });
    }
  });
  return map;
};

const SimpleVirtualizedChatTimelineComponent: React.FC<
  SimpleVirtualizedChatTimelineProps
> = ({
  conversationId,
  conversationType,
  currentUserId,
  messages,
  onReply,
  onReact,
  onForward,
  onPin,
  onEdit,
  onDelete,
  onRetry,
  cloudMessageActionsOnly,
  onImageClick,
  onFilePreview,
  hasMore,
  isLoadingMore,
  isInitialLoading,
  onLoadMore,
  density = "comfortable",
  isSelectionMode,
  selectedMessageIds,
  onToggleSelect,
  onStartSelectionMode,
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  unreadMarker,
  composerHeight,
  className,
  onBottomVisible,
  jumpToMessageId,
  jumpNonce,
}) => {
  const { t } = useTranslation();
  const timelineItems = useConversationTimelineRows({
    messages: messages as Message[],
    currentUserId,
    conversationType,
    unreadMarker,
  });
  const threadRows = useConversationThreadRows(timelineItems);

  const {
    scrollRef,
    isAtBottom,
    pendingNewMessages,
    handleScroll,
    handleMediaLoad,
    jumpToLatest,
    notifyTotalSizeChanged,
    isInitialSettled,
  } = useSimpleChatScroll({
    conversationId,
    currentUserId,
    messages,
    hasOlder: Boolean(hasMore),
    isInitialLoading: Boolean(isInitialLoading),
    isFetchingOlder: Boolean(isLoadingMore),
    loadOlder: onLoadMore,
    onBottomVisible,
  });

  const handleSelectAll = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!shouldScopeSelectAll(event)) return;
      const container = scrollRef.current;
      if (!container) return;
      event.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    [scrollRef],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: threadRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRowHeight(threadRows[index]),
    overscan: 8,
    getItemKey: (index) =>
      threadRows[index]?.key ?? `${threadRows[index]?.kind ?? "x"}-${index}`,
  });

  // When the row count changes (load older prepends, append, etc.) the
  // virtualizer must re-measure; useVirtualizer already reacts to `count`.

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  React.useEffect(() => {
    if (!isMessageDebugEnabled()) return;
    logMessageDebug("SimpleVirtualizedChatTimeline", "[VIRTUAL LIST]", {
      conversationId,
      messageCount: messages.length,
      itemCount: threadRows.length,
      threadRowCount: threadRows.length,
      virtualItemsCount: virtualItems.length,
      totalSize,
      lastMessageId: latestMessageId,
      isAtBottom,
      pendingNewMessages,
    });
  }, [
    conversationId,
    isAtBottom,
    latestMessageId,
    messages.length,
    pendingNewMessages,
    threadRows.length,
    totalSize,
    virtualItems.length,
  ]);

  // Rule 9: notify the scroll hook whenever totalSize changes so it can
  // re-anchor to the real bottom after ResizeObserver expands measurements.
  React.useLayoutEffect(
    () => notifyTotalSizeChanged(totalSize),
    [totalSize, notifyTotalSizeChanged],
  );

  // ── Initial stick-to-bottom window ──────────────────────────────────────────
  // During the first few frames after initial scroll fires, the virtualizer is
  // still measuring real row heights. Without this window, the user would land
  // in the middle of the conversation when estimates are too low.
  // We schedule 3 consecutive RAF frames that verify bottomGap <= 2px and
  // correct if needed. Guards prevent interference: conversation changes reset
  // the ref, user scrolling sets userScrollingRef which blocks the check.
  const initialStickRafRef = React.useRef<number | null>(null);
  const initialStickConvRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!isInitialSettled) return;
    if (!scrollRef.current) return;
    // Mark this stick-window as belonging to the current conversation.
    const activeConversation = conversationId;
    initialStickConvRef.current = activeConversation;

    const scheduleNext = (frame: number) => {
      if (frame >= 3) return;
      // Guard: abort if conversation changed while we were waiting in RAF queue.
      if (initialStickConvRef.current !== activeConversation) return;

      const raf = requestAnimationFrame(() => {
        // Guard: abort if conversation changed during RAF wait.
        if (initialStickConvRef.current !== activeConversation) return;
        if (!scrollRef.current) return;

        const elNow = scrollRef.current;
        const gap = Math.max(
          0,
          elNow.scrollHeight - elNow.scrollTop - elNow.clientHeight,
        );
        if (gap > 2) {
          elNow.scrollTo({ top: elNow.scrollHeight, behavior: "auto" });
        }

        scheduleNext(frame + 1);
      });
      initialStickRafRef.current = raf;
    };

    scheduleNext(0);

    return () => {
      if (initialStickRafRef.current !== null) {
        cancelAnimationFrame(initialStickRafRef.current);
        initialStickRafRef.current = null;
      }
    };
  }, [conversationId, isInitialSettled, scrollRef]);

  // Composer height changes shift the timeline's visible area. When the user is
  // at the bottom, the timeline should stay pinned to the bottom edge.
  // Reuse handleMediaLoad which already implements the correct stick logic.
  const prevComposerHeightRef = React.useRef(composerHeight);
  React.useEffect(() => {
    if (
      isInitialSettled &&
      composerHeight !== prevComposerHeightRef.current
    ) {
      prevComposerHeightRef.current = composerHeight;
      handleMediaLoad();
    }
  }, [composerHeight, isInitialSettled, handleMediaLoad]);

  // ── Expanded long messages ────────────────────────────────────────────────
  const [expandedLongMessageIds, setExpandedLongMessageIds] = React.useState(
    () => new Set<string>(),
  );
  // Reset when conversation changes so expansions don't bleed across chats.
  React.useEffect(() => {
    setExpandedLongMessageIds(new Set());
  }, [conversationId]);
  const toggleLongMessageExpand = React.useCallback((id: string) => {
    setExpandedLongMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Jump-to-message: scroll the target row into view + flash a highlight ──
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);
  const lastJumpNonceRef = React.useRef<number | undefined>(undefined);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scrollCleanupRef = React.useRef<(() => void) | null>(null);
  // Holds a requested jump whose target row is not loaded yet, so it can be
  // retried once the message arrives in the list.
  const pendingJumpRef = React.useRef<string | null>(null);

  // Build the alias row index lazily. Most renders never jump to a message, so
  // building a large Map for every threadRows change is avoidable churn.
  const rowIndexCacheRef = React.useRef<{
    rows: readonly ConversationThreadRow[];
    index: Map<string, number>;
  } | null>(null);
  const getJumpRowIndex = React.useCallback(() => {
    const cached = rowIndexCacheRef.current;
    if (cached?.rows === threadRows) {
      return cached.index;
    }
    const index = buildJumpRowIndex(threadRows);
    rowIndexCacheRef.current = { rows: threadRows, index };
    return index;
  }, [threadRows]);

  const runScrollAndHighlight = React.useCallback(
    (messageId: string, index: number) => {
      // Dynamically measured rows shift after the first scroll; re-issue it
      // across a couple of frames so we land on the corrected offset.
      const scrollToTarget = () =>
        virtualizer.scrollToIndex(index, { align: "center" });
      scrollToTarget();
      const raf = requestAnimationFrame(scrollToTarget);
      const correctionTimer = setTimeout(scrollToTarget, 160);
      scrollCleanupRef.current?.();
      scrollCleanupRef.current = () => {
        cancelAnimationFrame(raf);
        clearTimeout(correctionTimer);
      };

      setHighlightedId(messageId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedId(null);
        highlightTimerRef.current = null;
      }, 2200);
    },
    [virtualizer],
  );

  const tryResolvePendingJump = React.useCallback(() => {
    const id = pendingJumpRef.current;
    if (!id) return;
    const index = getJumpRowIndex().get(id);
    if (index == null) return; // target not loaded yet — wait for next change
    pendingJumpRef.current = null;
    runScrollAndHighlight(id, index);
  }, [getJumpRowIndex, runScrollAndHighlight]);

  // New jump request → remember it and try right away.
  React.useEffect(() => {
    if (jumpNonce == null || jumpNonce === lastJumpNonceRef.current) return;
    lastJumpNonceRef.current = jumpNonce;
    if (!jumpToMessageId) return;
    pendingJumpRef.current = jumpToMessageId;
    tryResolvePendingJump();
  }, [jumpNonce, jumpToMessageId, tryResolvePendingJump]);

  // Retry a pending jump when the row set changes (target just loaded in).
  React.useEffect(() => {
    tryResolvePendingJump();
  }, [threadRows, tryResolvePendingJump]);

  React.useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      scrollCleanupRef.current?.();
    },
    [],
  );

  const selectedIds = selectedMessageIds ?? EMPTY_SELECTED;

  // Media-load handler shared by every row — onImageClick stays the user's
  // handler, but image <img> elements must also notify the scroll hook so
  // it can decide whether to keep us pinned.
  const wrappedOnImageClick = onImageClick;

  // Inject a one-time image-onload listener via event delegation on the
  // scroll container. Cheaper than attaching per-row listeners and avoids
  // the ResizeObserver path that bit V2.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onLoad = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === "IMG") handleMediaLoad();
    };
    el.addEventListener("load", onLoad, true); // capture-phase to catch all
    return () => el.removeEventListener("load", onLoad, true);
  }, [handleMediaLoad, scrollRef]);

  if (isInitialLoading) {
    return (
      <section
        className={clsx("relative h-full min-h-0 flex-1", className)}
        aria-busy="true"
      />
    );
  }

  if (messages.length === 0) {
    return (
      <section
        className={clsx(
          "relative flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3",
          className,
        )}
        role="status"
        aria-label={t("chat:empty.messagesDescription")}
      >
        <ChatBubbleLeftIcon className="h-12 w-12 text-text-muted/40" />
        <p className="text-sm font-medium text-text-secondary">
          {t("chat:empty.messagesTitle")}
        </p>
        <p className="text-xs text-text-muted">
          {t("chat:empty.messagesDescription")}
        </p>
      </section>
    );
  }

  return (
    <section className={clsx("relative h-full min-h-0 flex-1", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onKeyDown={handleSelectAll}
        tabIndex={-1}
        data-testid="simple-timeline-scroll"
        className="chat-scroll-container h-full min-h-0 overflow-y-auto overscroll-contain focus:outline-none"
        role="log"
        aria-label={t("chat:message.inConversationAria")}
        aria-live="polite"
        style={{
          paddingBottom: 8,
          scrollBehavior: "auto",
          // A chat timeline scrolls vertically only. The hover QuickReactBar is a
          // fixed 228px popover anchored to a bubble; on a narrowed window it is
          // the ONLY element wider than the pane, and it grew scrollWidth so the
          // whole conversation slid sideways. `clip` contains it WITHOUT making a
          // scroll container, so vertical scrolling is untouched. Set here (not a
          // Tailwind class) because the `overflow-y-auto` shorthand would win.
          overflowX: "clip",
        }}
      >
        <div
          style={{
            height: totalSize,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const row = threadRows[virtualItem.index];
            if (!row) return null;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="px-[var(--chat-lane-padding)]">
                  <div className="mx-auto max-w-[var(--chat-content-lane)]">
                    {row.kind === "group" ? (
                      <MessageGroup
                        row={row}
                        onReply={onReply}
                        onReact={onReact}
                        onForward={onForward}
                        onPin={onPin}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onRetry={onRetry}
                        cloudMessageActionsOnly={cloudMessageActionsOnly}
                        onImageClick={wrappedOnImageClick}
                        onFilePreview={onFilePreview}
                        density={density}
                        isSelectionMode={isSelectionMode}
                        selectedMessageIds={selectedIds}
                        onToggleSelect={onToggleSelect}
                        onStartSelectionMode={onStartSelectionMode}
                        onNavigateToMessage={onNavigateToMessage}
                        currentUsername={currentUsername}
                        viewerCanRecallOthers={viewerCanRecallOthers}
                        expandedLongMessageIds={expandedLongMessageIds}
                        onToggleLongMessageExpand={toggleLongMessageExpand}
                        insertedMessageKeys={EMPTY_INSERTED}
                        highlightedMessageId={highlightedId}
                      />
                    ) : (
                      // system / date / unread — MessageItem already
                      // dispatches DateDivider / UnreadDivider / SystemMessage
                      // internally by row.kind. Keeps the simple timeline
                      // out of the business of formatting separators.
                      <MessageItem
                        item={row}
                        onReply={onReply}
                        onReact={onReact}
                        onForward={onForward}
                        onPin={onPin}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onImageClick={wrappedOnImageClick}
                        onFilePreview={onFilePreview}
                        density={density}
                        isSelectionMode={isSelectionMode}
                        isSelected={false}
                        onToggleSelect={onToggleSelect}
                        onStartSelectionMode={onStartSelectionMode}
                        onNavigateToMessage={onNavigateToMessage}
                        currentUsername={currentUsername}
                        viewerCanRecallOthers={viewerCanRecallOthers}
                        textRenderMode="expanded"
                        isCollapsibleText={false}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ScrollToLatestButton
        visible={!isAtBottom || pendingNewMessages > 0}
        pendingCount={pendingNewMessages}
        onClick={jumpToLatest}
        composerHeight={composerHeight}
      />
    </section>
  );
};

SimpleVirtualizedChatTimelineComponent.displayName =
  "SimpleVirtualizedChatTimeline";

export const SimpleVirtualizedChatTimeline = React.memo(
  SimpleVirtualizedChatTimelineComponent,
);

export default SimpleVirtualizedChatTimeline;
