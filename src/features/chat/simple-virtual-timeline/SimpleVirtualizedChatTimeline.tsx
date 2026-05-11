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
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Attachment, Conversation, Message } from "../../../types";
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
import { ScrollToLatestButton } from "./ScrollToLatestButton";

export interface SimpleVirtualizedChatTimelineProps {
  conversationId: string;
  conversationType: Conversation["type"];
  currentUserId: string;
  messages: readonly Message[];
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: Message) => void | Promise<void>;
  onDelete?: (
    messageId: string,
    mode?: "FOR_ME" | "FOR_EVERYONE",
  ) => void | Promise<void>;
  onInspect?: (message: Message) => void;
  viewerCanRecallOthers?: boolean;
  onImageClick?: (imageUrl: string) => void;
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
  onNavigateToMessage?: (messageId: string) => void;
  currentUsername?: string;
  unreadMarker?: UnreadTimelineMarker | null;
  composerHeight?: number;
  className?: string;
}

const EMPTY_SELECTED = new Set<string>();
const EMPTY_INSERTED = new Set<string>();
const EMPTY_EXPANDED = new Set<string>();

const estimateRowHeight = (row: ConversationThreadRow | undefined): number => {
  if (!row) return 72;
  if (row.kind === "date") return 56;
  if (row.kind === "unread") return 44;
  if (row.kind === "system") return 64;
  // group — coarse heuristic; measureElement corrects it after first paint.
  const items = row.items.length;
  return 56 + items * 56;
};

const noopToggleExpand = (_messageId: string): void => undefined;

const SimpleVirtualizedChatTimelineComponent: React.FC<
  SimpleVirtualizedChatTimelineProps
> = ({
  conversationId,
  conversationType,
  currentUserId,
  messages,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onInspect,
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
  onNavigateToMessage,
  currentUsername,
  viewerCanRecallOthers,
  unreadMarker,
  composerHeight,
  className,
}) => {
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
  } = useSimpleChatScroll({
    conversationId,
    currentUserId,
    messages,
    hasOlder: Boolean(hasMore),
    isInitialLoading: Boolean(isInitialLoading),
    isFetchingOlder: Boolean(isLoadingMore),
    loadOlder: onLoadMore,
  });

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
        className={clsx("relative h-full min-h-0 flex-1", className)}
        aria-label="empty conversation"
      />
    );
  }

  return (
    <section className={clsx("relative h-full min-h-0 flex-1", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="simple-timeline-scroll"
        className="chat-scroll-container h-full min-h-0 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: composerHeight ?? 0,
          scrollBehavior: "auto",
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
                        onInspect={onInspect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onImageClick={wrappedOnImageClick}
                        onFilePreview={onFilePreview}
                        density={density}
                        isSelectionMode={isSelectionMode}
                        selectedMessageIds={selectedIds}
                        onToggleSelect={onToggleSelect}
                        onNavigateToMessage={onNavigateToMessage}
                        currentUsername={currentUsername}
                        viewerCanRecallOthers={viewerCanRecallOthers}
                        expandedLongMessageIds={EMPTY_EXPANDED}
                        onToggleLongMessageExpand={noopToggleExpand}
                        insertedMessageKeys={EMPTY_INSERTED}
                        highlightedMessageId={null}
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
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onImageClick={wrappedOnImageClick}
                        onFilePreview={onFilePreview}
                        density={density}
                        isSelectionMode={isSelectionMode}
                        isSelected={false}
                        onToggleSelect={onToggleSelect}
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
