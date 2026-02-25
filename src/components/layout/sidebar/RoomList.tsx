import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { VariableSizeList, type ListChildComponentProps } from "react-window";
import type { Conversation, ConversationFilter, UserSummary } from "../../../types";
import { RoomType } from "../../../types";
import { RoomItem } from "./RoomItem";

interface RoomListProps {
  conversations: Conversation[];
  currentUser: UserSummary;
  selectedId: string | null;
  searchQuery: string;
  activeFilter: ConversationFilter;
  collapsed: boolean;
  onSelect: (conversationId: string) => void;
}

type SectionId = "unread" | "channels" | "groups" | "direct";

interface RoomSection {
  id: SectionId;
  title: string;
  rooms: Conversation[];
}

type FlatListItem =
  | {
      kind: "section";
      key: string;
      title: string;
      count: number;
    }
  | {
      kind: "room";
      key: string;
      room: Conversation;
    };

interface RowData {
  items: FlatListItem[];
  currentUser: UserSummary;
  selectedId: string | null;
  collapsed: boolean;
  keyboardActiveRoomId: string | null;
  onSelect: (conversationId: string) => void;
}

const SECTION_HEIGHT = 30;
const EXPANDED_ROOM_HEIGHT = 80;
const COLLAPSED_ROOM_HEIGHT = 64;

const toTimestamp = (value: unknown): number => {
  const date = new Date(value as string | number | Date);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const sortByPriority = (items: Conversation[]): Conversation[] =>
  [...items].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
  });

const includesQuery = (conversation: Conversation, normalizedQuery: string): boolean => {
  if (!normalizedQuery) return true;

  if ((conversation.name || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  const participantMatch = (conversation.participants || []).some((participant) => {
    const displayName = (participant.displayName || "").toLowerCase();
    const username = (participant.username || "").toLowerCase();
    return displayName.includes(normalizedQuery) || username.includes(normalizedQuery);
  });

  if (participantMatch) return true;

  return (conversation.lastMessage?.content || "").toLowerCase().includes(normalizedQuery);
};

const toSections = (
  source: Conversation[],
  activeFilter: ConversationFilter,
): RoomSection[] => {
  const unread = source.filter((room) => (room.unreadCount || 0) > 0);
  const channels = source.filter((room) => room.type === RoomType.CHANNEL);
  const groups = source.filter((room) => room.type === RoomType.GROUP);
  const direct = source.filter(
    (room) => room.type === RoomType.DIRECT || room.type === RoomType.PRIVATE,
  );

  switch (activeFilter) {
    case "unread":
      return unread.length > 0 ? [{ id: "unread", title: "Unread", rooms: unread }] : [];
    case "channels":
      return channels.length > 0
        ? [{ id: "channels", title: "Channels", rooms: channels }]
        : [];
    case "groups":
      return groups.length > 0 ? [{ id: "groups", title: "Groups", rooms: groups }] : [];
    default: {
      const readChannel = channels.filter((room) => (room.unreadCount || 0) === 0);
      const readGroup = groups.filter((room) => (room.unreadCount || 0) === 0);
      const readDirect = direct.filter((room) => (room.unreadCount || 0) === 0);

      const sections: RoomSection[] = [];
      if (unread.length > 0) {
        sections.push({ id: "unread", title: "Unread", rooms: unread });
      }
      if (readChannel.length > 0) {
        sections.push({ id: "channels", title: "Channels", rooms: readChannel });
      }
      if (readGroup.length > 0) {
        sections.push({ id: "groups", title: "Groups", rooms: readGroup });
      }
      if (readDirect.length > 0) {
        sections.push({ id: "direct", title: "Direct Messages", rooms: readDirect });
      }
      return sections;
    }
  }
};

const Row = ({ index, style, data }: ListChildComponentProps<RowData>) => {
  const item = data.items[index];
  if (!item) {
    return <div style={style} />;
  }

  if (item.kind === "section") {
    return (
      <div style={style} className="px-3">
        <div
          className={clsx(
            "flex h-full items-center text-[11px] font-semibold uppercase tracking-[0.08em]",
            "text-slate-500 dark:text-slate-400",
            data.collapsed && "justify-center",
          )}
        >
          {data.collapsed ? item.title.charAt(0) : `${item.title} (${item.count})`}
        </div>
      </div>
    );
  }

  return (
    <div style={style}>
      <RoomItem
        conversation={item.room}
        currentUser={data.currentUser}
        collapsed={data.collapsed}
        isActive={data.selectedId === item.room.id}
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
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<VariableSizeList<RowData> | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardCursor, setKeyboardCursor] = useState(0);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const sortedRooms = useMemo(
    () => sortByPriority(Array.isArray(conversations) ? conversations : []),
    [conversations],
  );

  const queriedRooms = useMemo(
    () => sortedRooms.filter((conversation) => includesQuery(conversation, normalizedQuery)),
    [sortedRooms, normalizedQuery],
  );

  const sections = useMemo(
    () => toSections(queriedRooms, activeFilter),
    [queriedRooms, activeFilter],
  );

  const flatItems = useMemo<FlatListItem[]>(() => {
    const result: FlatListItem[] = [];

    sections.forEach((section) => {
      result.push({
        kind: "section",
        key: `section-${section.id}`,
        title: section.title,
        count: section.rooms.length,
      });

      section.rooms.forEach((room) => {
        result.push({
          kind: "room",
          key: `room-${room.id}`,
          room,
        });
      });
    });

    return result;
  }, [sections]);

  const roomIndexes = useMemo(() => {
    const indexes: number[] = [];
    flatItems.forEach((item, index) => {
      if (item.kind === "room") {
        indexes.push(index);
      }
    });
    return indexes;
  }, [flatItems]);

  const rowHeights = useMemo(
    () =>
      flatItems.map((item) =>
        item.kind === "section"
          ? SECTION_HEIGHT
          : collapsed
            ? COLLAPSED_ROOM_HEIGHT
            : EXPANDED_ROOM_HEIGHT,
      ),
    [flatItems, collapsed],
  );

  const getItemSize = useCallback(
    (index: number) => rowHeights[index] ?? EXPANDED_ROOM_HEIGHT,
    [rowHeights],
  );

  const selectedRoomPosition = useMemo(() => {
    if (!selectedId) return -1;
    return roomIndexes.findIndex((listIndex) => {
      const item = flatItems[listIndex];
      return item?.kind === "room" && item.room.id === selectedId;
    });
  }, [flatItems, roomIndexes, selectedId]);

  const clampedKeyboardCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    return Math.max(0, Math.min(roomIndexes.length - 1, keyboardCursor));
  }, [keyboardCursor, roomIndexes.length]);

  const currentCursor = useMemo(() => {
    if (roomIndexes.length === 0) return 0;
    if (isKeyboardMode) return clampedKeyboardCursor;
    return selectedRoomPosition >= 0 ? selectedRoomPosition : clampedKeyboardCursor;
  }, [
    roomIndexes.length,
    isKeyboardMode,
    clampedKeyboardCursor,
    selectedRoomPosition,
  ]);

  const rowData = useMemo<RowData>(() => {
    const keyboardListIndex = roomIndexes[currentCursor];
    const keyboardActiveRoomId =
      typeof keyboardListIndex === "number" && flatItems[keyboardListIndex]?.kind === "room"
        ? flatItems[keyboardListIndex].room.id
        : null;

    return {
      items: flatItems,
      currentUser,
      selectedId,
      collapsed,
      keyboardActiveRoomId: isKeyboardMode ? keyboardActiveRoomId : null,
      onSelect,
    };
  }, [
    currentUser,
    flatItems,
    selectedId,
    collapsed,
    isKeyboardMode,
    roomIndexes,
    currentCursor,
    onSelect,
  ]);

  useEffect(() => {
    listRef.current?.resetAfterIndex(0, true);
  }, [rowHeights]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateHeight = () => setViewportHeight(node.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const moveCursor = useCallback(
    (delta: -1 | 1) => {
      if (roomIndexes.length === 0) return;

      const next = Math.max(0, Math.min(roomIndexes.length - 1, currentCursor + delta));
      setKeyboardCursor(next);
      const listIndex = roomIndexes[next];
      listRef.current?.scrollToItem(listIndex, "smart");
    },
    [currentCursor, roomIndexes],
  );

  const selectByCursor = useCallback(() => {
    const listIndex = roomIndexes[currentCursor];
    const item = flatItems[listIndex];
    if (item && item.kind === "room") {
      onSelect(item.room.id);
    }
  }, [currentCursor, flatItems, onSelect, roomIndexes]);

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

  if (flatItems.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {normalizedQuery ? "No room matches your search." : "No conversations available."}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1"
      tabIndex={0}
      role="listbox"
      aria-label="Conversation list"
      onKeyDown={handleKeyDown}
      onMouseMove={() => {
        if (isKeyboardMode) {
          setIsKeyboardMode(false);
        }
      }}
    >
      {viewportHeight > 0 && (
        <VariableSizeList<RowData>
          ref={listRef}
          height={viewportHeight}
          width="100%"
          itemCount={flatItems.length}
          itemData={rowData}
          itemSize={getItemSize}
          overscanCount={12}
        >
          {Row}
        </VariableSizeList>
      )}
    </div>
  );
};

export default RoomList;
