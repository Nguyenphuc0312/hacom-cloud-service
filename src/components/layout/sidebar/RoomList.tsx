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
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import type {
  Conversation,
  ConversationFilter,
  UserSummary,
} from "../../../types";
import { isDirectConversation } from "../../../lib/conversationAdapter";
import { sortConversationsByActivity } from "../../../utils/conversationRanking";
import {
  getConversationDisplayName,
  getUserDisplayName,
} from "../../../utils/messageHelpers";
import { ConversationListSkeleton, ErrorState, StateBlock } from "../../ui";
import {
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { RoomItem } from "./RoomItem";

interface RoomListProps {
  conversations: Conversation[];
  currentUser: UserSummary;
  selectedId: string | null;
  searchQuery: string;
  activeFilter: ConversationFilter;
  collapsed: boolean;
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
  room: Conversation;
};

interface RowData {
  items: FlatListItem[];
  currentUser: UserSummary;
  currentConversationId: string | null;
  collapsed: boolean;
  keyboardActiveRoomId: string | null;
  onSelect: (conversationId: string) => void;
}

const EXPANDED_ROOM_HEIGHT = 72;
const COLLAPSED_ROOM_HEIGHT = 60;
const VIRTUALIZATION_THRESHOLD = 10;

const measureViewportHeight = (node: HTMLDivElement): number => {
  if (node.clientHeight > 0) return node.clientHeight;

  const rectHeight = node.getBoundingClientRect().height;
  if (rectHeight > 0) return Math.round(rectHeight);

  if (node.scrollHeight > 0) return node.scrollHeight;
  return 0;
};

const includesQuery = (
  conversation: Conversation,
  normalizedQuery: string,
  currentUserId: string,
): boolean => {
  if (!normalizedQuery) return true;

  const resolvedConversationName = getConversationDisplayName(
    conversation,
    currentUserId,
  ).toLowerCase();
  if (resolvedConversationName.includes(normalizedQuery)) {
    return true;
  }

  if ((conversation.displayName || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if ((conversation.name || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if (
    (conversation.otherUser?.displayName || "")
      .toLowerCase()
      .includes(normalizedQuery) ||
    (conversation.otherUser?.username || "")
      .toLowerCase()
      .includes(normalizedQuery)
  ) {
    return true;
  }

  const participantMatch = (conversation.participants || []).some(
    (participant) => {
      const displayName = getUserDisplayName(participant, {
        allowTechnicalFallback: true,
      }).toLowerCase();
      const username = (participant.username || "").toLowerCase();
      return (
        displayName.includes(normalizedQuery) ||
        username.includes(normalizedQuery)
      );
    },
  );

  if (participantMatch) return true;

  return (conversation.lastMessage?.content || "")
    .toLowerCase()
    .includes(normalizedQuery);
};

const isRoomActive = (
  roomId: string,
  currentConversationId: string | null,
): boolean => currentConversationId === roomId;

const resolveVisibleRooms = (
  source: Conversation[],
  activeFilter: ConversationFilter,
): Conversation[] => {
  const directRooms = source.filter((room) => isDirectConversation(room));
  const groupRooms = source.filter((room) => !isDirectConversation(room));

  switch (activeFilter) {
    case "unread":
      return source.filter((room) => (room.unreadCount || 0) > 0);
    case "direct":
      return directRooms;
    case "channels":
    case "groups":
      return groupRooms;
    default:
      return [...directRooms, ...groupRooms];
  }
};

const Row = ({ index, style, data }: ListChildComponentProps<RowData>) => {
  const item = data.items[index];
  if (!item) {
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <RoomItem
        conversation={item.room}
        currentUser={data.currentUser}
        collapsed={data.collapsed}
        isActive={isRoomActive(item.room.id, data.currentConversationId)}
        isKeyboardActive={data.keyboardActiveRoomId === item.room.id}
        onSelect={data.onSelect}
      />
    </div>
  );
};

export const RoomList: React.FC<RoomListProps> = ({
  conversations,
  currentUser,
  selectedId,
  searchQuery,
  activeFilter,
  collapsed,
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

  const handleSelect = useCallback(
    (conversationId: string) => {
      setIsKeyboardMode(false);
      onSelect(conversationId);
    },
    [onSelect],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasAnyConversations =
    Array.isArray(conversations) && conversations.length > 0;

  const sortedRooms = useMemo(
    () => sortConversationsByActivity(Array.isArray(conversations) ? conversations : []),
    [conversations],
  );

  const queriedRooms = useMemo(
    () =>
      sortedRooms.filter((conversation) =>
        includesQuery(conversation, normalizedQuery, currentUser.id),
      ),
    [currentUser.id, normalizedQuery, sortedRooms],
  );

  const flatItems = useMemo<FlatListItem[]>(
    () =>
      resolveVisibleRooms(queriedRooms, activeFilter).map((room) => ({
        kind: "room",
        key: `room-${room.id}`,
        room,
      })),
    [activeFilter, queriedRooms],
  );

  const roomIndexes = useMemo(
    () => flatItems.map((_, index) => index),
    [flatItems],
  );

  const rowHeights = useMemo(
    () =>
      flatItems.map(() =>
        collapsed ? COLLAPSED_ROOM_HEIGHT : EXPANDED_ROOM_HEIGHT,
      ),
    [collapsed, flatItems],
  );

  const getItemSize = useCallback(
    (index: number) => rowHeights[index] ?? EXPANDED_ROOM_HEIGHT,
    [rowHeights],
  );

  const selectedRoomPosition = useMemo(() => {
    if (!selectedId) return -1;
    return roomIndexes.findIndex((listIndex) => {
      const item = flatItems[listIndex];
      return item && isRoomActive(item.room.id, selectedId);
    });
  }, [flatItems, roomIndexes, selectedId]);

  const clampedKeyboardCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    return Math.max(0, Math.min(roomIndexes.length - 1, keyboardCursor));
  }, [keyboardCursor, roomIndexes.length]);

  const currentCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    if (isKeyboardMode) return clampedKeyboardCursor;
    return selectedRoomPosition >= 0
      ? selectedRoomPosition
      : clampedKeyboardCursor;
  }, [
    clampedKeyboardCursor,
    isKeyboardMode,
    roomIndexes.length,
    selectedRoomPosition,
  ]);

  const rowData = useMemo<RowData>(() => {
    const keyboardListIndex = roomIndexes[currentCursor];
    const keyboardActiveRoomId =
      typeof keyboardListIndex === "number"
        ? flatItems[keyboardListIndex]?.room.id ?? null
        : null;

    return {
      items: flatItems,
      currentUser,
      currentConversationId: selectedId,
      collapsed,
      keyboardActiveRoomId: isKeyboardMode ? keyboardActiveRoomId : null,
      onSelect: handleSelect,
    };
  }, [
    collapsed,
    currentCursor,
    currentUser,
    flatItems,
    handleSelect,
    isKeyboardMode,
    roomIndexes,
    selectedId,
  ]);

  const shouldUseVirtualList =
    viewportHeight > 0 && flatItems.length > VIRTUALIZATION_THRESHOLD;

  useEffect(() => {
    listRef.current?.resetAfterIndex(0, true);
  }, [collapsed, flatItems.length]);

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
  }, [flatItems.length, collapsed, syncViewportHeight]);

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
      handleSelect(item.room.id);
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

  if (showLoadingSkeleton) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <ConversationListSkeleton count={collapsed ? 5 : 7} />
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
            itemSize={getItemSize}
            itemKey={getItemKey}
            overscanCount={12}
          >
            {Row}
          </VariableSizeList>
        ) : (
          <div className="sidebar-scrollbar h-full space-y-0.5 overflow-y-auto py-0.5">
            {flatItems.map((item, index) => (
              <RoomItem
                key={item.key}
                conversation={item.room}
                currentUser={currentUser}
                collapsed={collapsed}
                isActive={isRoomActive(item.room.id, selectedId)}
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

      {hasMore && (
        <div className="px-3 pt-1">
          <button
            type="button"
            onClick={() => onLoadMore?.()}
            disabled={isLoadingMore}
            className={clsx(
              "w-full rounded-2xl border border-border/70 bg-surface px-3 py-2.5 text-xs font-medium shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
              isLoadingMore
                ? "cursor-not-allowed text-text-muted opacity-70"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {isLoadingMore
              ? t("common:status.loading", { defaultValue: "Loading..." })
              : t("sidebar:actions.loadMore", { defaultValue: "Load more" })}
          </button>
        </div>
      )}
    </div>
  );
};

export default RoomList;
