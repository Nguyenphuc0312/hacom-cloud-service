import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  VariableSizeList,
  type ListChildComponentProps,
  type ListOnScrollProps,
} from "react-window";
import { ConversationListSkeleton, ErrorState, StateBlock } from "../../ui";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { RoomItemContainer } from "./RoomItem";
import type { UserSummary } from "../../../types";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface RoomListProps {
  layoutState: ChatLayoutState;
  conversationIds: string[];
  currentUser: UserSummary;
  selectedId: string | null;
  searchQuery: string;
  showLoadingSkeleton?: boolean;
  error?: string | null;
  onRetry?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (conversationId: string) => void;
}

type FlatListItem = {
  kind: "room";
  key: string;
  conversationId: string;
};

interface RowData {
  items: FlatListItem[];
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  currentConversationId: string | null;
  keyboardActiveConversationId: string | null;
  onSelect: (conversationId: string) => void;
}

const VIRTUALIZATION_THRESHOLD = 10;
const LOAD_MORE_THRESHOLD_PX = 280;
const ROOM_HEIGHT_BY_LAYOUT: Record<ChatLayoutState, number> = {
  normal: 72,
  "with-panel": 68,
  mobile: 64,
};

const measureViewportHeight = (node: HTMLDivElement): number => {
  if (node.clientHeight > 0) return node.clientHeight;

  const rectHeight = node.getBoundingClientRect().height;
  if (rectHeight > 0) return Math.round(rectHeight);

  if (node.scrollHeight > 0) return node.scrollHeight;
  return 0;
};

const isConversationActive = (
  conversationId: string,
  currentConversationId: string | null,
): boolean => currentConversationId === conversationId;

const Row = ({ index, style, data }: ListChildComponentProps<RowData>) => {
  const item = data.items[index];
  if (!item) {
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <RoomItemContainer
        conversationId={item.conversationId}
        layoutState={data.layoutState}
        currentUser={data.currentUser}
        isActive={isConversationActive(
          item.conversationId,
          data.currentConversationId,
        )}
        isKeyboardActive={
          data.keyboardActiveConversationId === item.conversationId
        }
        onSelect={data.onSelect}
      />
    </div>
  );
};

export const RoomList: React.FC<RoomListProps> = ({
  layoutState,
  conversationIds,
  currentUser,
  selectedId,
  searchQuery,
  showLoadingSkeleton = false,
  error = null,
  onRetry,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelect,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<VariableSizeList<RowData> | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardCursor, setKeyboardCursor] = useState(0);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);
  const roomHeight = ROOM_HEIGHT_BY_LAYOUT[layoutState];

  const handleSelect = useCallback(
    (conversationId: string) => {
      setIsKeyboardMode(false);
      onSelect(conversationId);
    },
    [onSelect],
  );

  const normalizedQuery = searchQuery.trim();
  const hasAnyConversations =
    Array.isArray(conversationIds) && conversationIds.length > 0;

  const flatItems = useMemo<FlatListItem[]>(
    () =>
      (Array.isArray(conversationIds) ? conversationIds : []).map(
        (conversationId) => ({
          kind: "room",
          key: `room-${conversationId}`,
          conversationId,
        }),
      ),
    [conversationIds],
  );

  const roomIndexes = useMemo(
    () => flatItems.map((_, index) => index),
    [flatItems],
  );

  const selectedConversationPosition = useMemo(() => {
    if (!selectedId) return -1;
    return roomIndexes.findIndex((listIndex) => {
      const item = flatItems[listIndex];
      return item && isConversationActive(item.conversationId, selectedId);
    });
  }, [flatItems, roomIndexes, selectedId]);

  const clampedKeyboardCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    return Math.max(0, Math.min(roomIndexes.length - 1, keyboardCursor));
  }, [keyboardCursor, roomIndexes.length]);

  const currentCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    if (isKeyboardMode) return clampedKeyboardCursor;
    return selectedConversationPosition >= 0
      ? selectedConversationPosition
      : clampedKeyboardCursor;
  }, [
    clampedKeyboardCursor,
    isKeyboardMode,
    roomIndexes.length,
    selectedConversationPosition,
  ]);

  const rowData = useMemo<RowData>(() => {
    const keyboardListIndex = roomIndexes[currentCursor];
    const keyboardActiveConversationId =
      typeof keyboardListIndex === "number"
        ? flatItems[keyboardListIndex]?.conversationId ?? null
        : null;

    return {
      items: flatItems,
      layoutState,
      currentUser,
      currentConversationId: selectedId,
      keyboardActiveConversationId: isKeyboardMode
        ? keyboardActiveConversationId
        : null,
      onSelect: handleSelect,
    };
  }, [
    currentCursor,
    currentUser,
    flatItems,
    handleSelect,
    isKeyboardMode,
    layoutState,
    roomIndexes,
    selectedId,
  ]);

  const shouldUseVirtualList =
    viewportHeight > 0 && flatItems.length > VIRTUALIZATION_THRESHOLD;

  const syncViewportHeight = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;

    const nextHeight = measureViewportHeight(node);
    setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    syncViewportHeight();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncViewportHeight)
        : null;
    observer?.observe(node);

    const onResize = () => syncViewportHeight();
    window.addEventListener("resize", onResize);

    let rafId1 = 0;
    let rafId2 = 0;
    rafId1 = window.requestAnimationFrame(() => {
      syncViewportHeight();
      rafId2 = window.requestAnimationFrame(syncViewportHeight);
    });

    const timerId = window.setTimeout(syncViewportHeight, 120);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(rafId1);
      window.cancelAnimationFrame(rafId2);
      window.clearTimeout(timerId);
    };
  }, [syncViewportHeight]);

  useEffect(() => {
    syncViewportHeight();
  }, [flatItems.length, syncViewportHeight]);

  const requestLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) {
      return;
    }

    onLoadMore?.();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleVirtualListScroll = useCallback(
    ({ scrollOffset, scrollUpdateWasRequested }: ListOnScrollProps) => {
      if (scrollUpdateWasRequested || !hasMore || isLoadingMore) {
        return;
      }

      const estimatedVisibleStopIndex = Math.floor(
        (scrollOffset + viewportHeight) / roomHeight,
      );
      if (estimatedVisibleStopIndex >= flatItems.length - 4) {
        requestLoadMore();
      }
    },
    [
      flatItems.length,
      hasMore,
      isLoadingMore,
      requestLoadMore,
      roomHeight,
      viewportHeight,
    ],
  );

  const moveCursor = useCallback(
    (delta: -1 | 1) => {
      if (roomIndexes.length === 0) return;

      const next = Math.max(
        0,
        Math.min(roomIndexes.length - 1, currentCursor + delta),
      );
      setKeyboardCursor(next);
      const listIndex = roomIndexes[next];
      listRef.current?.scrollToItem(listIndex, "smart");
    },
    [currentCursor, roomIndexes],
  );

  const selectByCursor = useCallback(() => {
    const listIndex = roomIndexes[currentCursor];
    const item = flatItems[listIndex];
    if (item) {
      handleSelect(item.conversationId);
    }
  }, [currentCursor, flatItems, handleSelect, roomIndexes]);

  const getItemKey = useCallback(
    (index: number, data: RowData) => data.items[index]?.key ?? `row-${index}`,
    [],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (roomIndexes.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsKeyboardMode(true);
      moveCursor(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsKeyboardMode(true);
      moveCursor(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      setIsKeyboardMode(true);
      selectByCursor();
    }
  };

  const handleContainerScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!hasMore || isLoadingMore) {
        return;
      }

      const node = event.currentTarget;
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining <= LOAD_MORE_THRESHOLD_PX) {
        requestLoadMore();
      }
    },
    [hasMore, isLoadingMore, requestLoadMore],
  );

  if (showLoadingSkeleton) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <ConversationListSkeleton count={7} />
      </div>
    );
  }

  if (error && !hasAnyConversations && normalizedQuery.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <ErrorState
          title={t("error:chat.fetchConversationsFailed")}
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }

  if (flatItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 py-3">
        <StateBlock
          variant={normalizedQuery ? "search-empty" : "empty"}
          icon={
            normalizedQuery ? (
              <MagnifyingGlassIcon className="h-6 w-6" />
            ) : (
              <ChatBubbleLeftRightIcon className="h-6 w-6" />
            )
          }
          title={
            normalizedQuery
              ? t("sidebar:room.emptyBySearch")
              : t("sidebar:room.empty")
          }
          description={
            normalizedQuery
              ? t("sidebar:search.placeholder")
              : t("chat:empty.noChatDescription")
          }
          className="w-full border-dashed shadow-none"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col pb-2">
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto"
        tabIndex={0}
        role="listbox"
        aria-label={t("sidebar:room.listAria")}
        onKeyDown={handleKeyDown}
        onScroll={shouldUseVirtualList ? undefined : handleContainerScroll}
        onMouseMove={() => {
          if (isKeyboardMode) {
            setIsKeyboardMode(false);
          }
        }}
      >
        {shouldUseVirtualList ? (
          <VariableSizeList<RowData>
            ref={listRef}
            className="sidebar-scrollbar"
            height={viewportHeight}
            width="100%"
            itemCount={flatItems.length}
            itemData={rowData}
            itemSize={() => roomHeight}
            itemKey={getItemKey}
            onScroll={handleVirtualListScroll}
            overscanCount={12}
          >
            {Row}
          </VariableSizeList>
        ) : (
          <div className="sidebar-scrollbar h-full space-y-0.5 overflow-y-auto py-0.5">
            {flatItems.map((item, index) => (
              <RoomItemContainer
                key={item.key}
                conversationId={item.conversationId}
                layoutState={layoutState}
                currentUser={currentUser}
                isActive={isConversationActive(item.conversationId, selectedId)}
                isKeyboardActive={
                  isKeyboardMode &&
                  roomIndexes[currentCursor] === index
                }
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {(hasMore || isLoadingMore) && (
        <div className="px-4 pb-2 pt-2">
          <div
            className={clsx(
              "flex h-9 items-center justify-center rounded-full border border-dashed border-border/60 text-xs text-text-muted",
              isLoadingMore && "bg-surface/80",
            )}
          >
            {isLoadingMore
              ? t("common:status.loading", { defaultValue: "Loading..." })
              : t("sidebar:actions.loadMore", {
                  defaultValue: "Loading more...",
                })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomList;
