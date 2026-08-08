import React, { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RoomItemContainer } from "./RoomItem";
import {
  RoomListLoadingState,
  RoomListErrorState,
  RoomListEmptyState,
} from "./RoomListEmptyStates";
import { RoomListLoadMore } from "./RoomListLoadMore";
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

const VIRTUALIZATION_THRESHOLD = 10;
const LOAD_MORE_THRESHOLD_PX = 280;
const ROOM_HEIGHT_BY_LAYOUT: Record<ChatLayoutState, number> = {
  normal: 72,
  "with-panel": 68,
  mobile: 64,
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
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

  const selectedConversationPosition = useMemo(() => {
    if (!selectedId) return -1;
    return flatItems.findIndex((item) => item.conversationId === selectedId);
  }, [flatItems, selectedId]);

  const clampedKeyboardCursor = useMemo(() => {
    if (flatItems.length === 0) return 0;
    return Math.max(0, Math.min(flatItems.length - 1, keyboardCursor));
  }, [keyboardCursor, flatItems.length]);

  const currentCursor = useMemo(() => {
    if (flatItems.length === 0) return 0;
    if (isKeyboardMode) return clampedKeyboardCursor;
    return selectedConversationPosition >= 0
      ? selectedConversationPosition
      : clampedKeyboardCursor;
  }, [
    clampedKeyboardCursor,
    isKeyboardMode,
    flatItems.length,
    selectedConversationPosition,
  ]);

  const keyboardActiveConversationId = isKeyboardMode
    ? flatItems[currentCursor]?.conversationId ?? null
    : null;

  const shouldUseVirtualList = flatItems.length > VIRTUALIZATION_THRESHOLD;

  // Virtualizer tự đo scroll element (ResizeObserver nội bộ) — không cần
  // truyền height đo tay từ ngoài vào.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => roomHeight,
    overscan: 12,
    getItemKey: (index) => flatItems[index]?.key ?? `row-${index}`,
    enabled: shouldUseVirtualList,
  });

  const requestLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore) {
      return;
    }

    onLoadMore?.();
  }, [hasMore, isLoadingMore, onLoadMore]);

  const moveCursor = useCallback(
    (delta: -1 | 1) => {
      if (flatItems.length === 0) return;

      const next = Math.max(
        0,
        Math.min(flatItems.length - 1, currentCursor + delta),
      );
      setKeyboardCursor(next);
      if (shouldUseVirtualList) {
        virtualizer.scrollToIndex(next, { align: "auto" });
      }
    },
    [currentCursor, flatItems.length, shouldUseVirtualList, virtualizer],
  );

  const selectByCursor = useCallback(() => {
    const item = flatItems[currentCursor];
    if (item) {
      handleSelect(item.conversationId);
    }
  }, [currentCursor, flatItems, handleSelect]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (flatItems.length === 0) return;

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
    return <RoomListLoadingState />;
  }

  if (error && !hasAnyConversations && normalizedQuery.length === 0) {
    return <RoomListErrorState error={error} onRetry={onRetry} />;
  }

  if (flatItems.length === 0) {
    return <RoomListEmptyState normalizedQuery={normalizedQuery} />;
  }

  return (
    <div className="hc-room-list flex h-full min-h-0 w-full flex-1 flex-col pb-2">
      <div
        className="min-h-0 flex-1"
        tabIndex={0}
        role="listbox"
        aria-label={t("sidebar:room.listAria")}
        onKeyDown={handleKeyDown}
        onMouseMove={() => {
          if (isKeyboardMode) {
            setIsKeyboardMode(false);
          }
        }}
      >
        <div
          ref={scrollRef}
          className={
            shouldUseVirtualList
              ? "sidebar-scrollbar h-full overflow-y-auto"
              : "sidebar-scrollbar h-full space-y-0.5 overflow-y-auto py-0.5"
          }
          onScroll={handleContainerScroll}
        >
          {shouldUseVirtualList ? (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
                width: "100%",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = flatItems[virtualRow.index];
                if (!item) return null;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <RoomItemContainer
                      conversationId={item.conversationId}
                      layoutState={layoutState}
                      currentUser={currentUser}
                      isActive={selectedId === item.conversationId}
                      isKeyboardActive={
                        keyboardActiveConversationId === item.conversationId
                      }
                      onSelect={handleSelect}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            flatItems.map((item, index) => (
              <RoomItemContainer
                key={item.key}
                conversationId={item.conversationId}
                layoutState={layoutState}
                currentUser={currentUser}
                isActive={selectedId === item.conversationId}
                isKeyboardActive={isKeyboardMode && currentCursor === index}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>
      </div>

      {(hasMore || isLoadingMore) && (
        <RoomListLoadMore isLoadingMore={isLoadingMore} />
      )}
    </div>
  );
};

export default RoomList;
