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
import { RoomType } from "../../../types";
import {
  isDirectConversation,
  normalizeRoomType,
} from "../../../lib/conversationAdapter";
import { rankConversations } from "../../../utils/conversationRanking";
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

const SECTION_HEIGHT = 24;
const EXPANDED_ROOM_HEIGHT = 72;
const COLLAPSED_ROOM_HEIGHT = 60;

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
): boolean => {
  if (!normalizedQuery) return true;

  if ((conversation.displayName || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if ((conversation.name || "").toLowerCase().includes(normalizedQuery)) {
    return true;
  }

  if (
    (conversation.otherUser?.displayName || "").toLowerCase().includes(normalizedQuery) ||
    (conversation.otherUser?.username || "").toLowerCase().includes(normalizedQuery)
  ) {
    return true;
  }

  const participantMatch = (conversation.participants || []).some(
    (participant) => {
      const displayName = (participant.displayName || "").toLowerCase();
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

const toSections = (
  source: Conversation[],
  activeFilter: ConversationFilter,
): RoomSection[] => {
  const toType = (room: Conversation): RoomType =>
    normalizeRoomType(room.type, room.participants?.length);
  const unread = source.filter((room) => (room.unreadCount || 0) > 0);
  const channels = source.filter((room) => toType(room) === RoomType.CHANNEL);
  const groups = source.filter((room) => toType(room) === RoomType.GROUP);
  const direct = source.filter((room) => isDirectConversation(room));

  switch (activeFilter) {
    case "unread":
      return unread.length > 0 ? [{ id: "unread", rooms: unread }] : [];
    case "channels":
      return channels.length > 0 ? [{ id: "channels", rooms: channels }] : [];
    case "groups":
      return groups.length > 0 ? [{ id: "groups", rooms: groups }] : [];
    default: {
      const readChannel = channels.filter(
        (room) => (room.unreadCount || 0) === 0,
      );
      const readGroup = groups.filter((room) => (room.unreadCount || 0) === 0);
      const readDirect = direct.filter((room) => (room.unreadCount || 0) === 0);

      const sections: RoomSection[] = [];
      if (unread.length > 0) {
        sections.push({ id: "unread", rooms: unread });
      }
      if (readChannel.length > 0) {
        sections.push({ id: "channels", rooms: readChannel });
      }
      if (readGroup.length > 0) {
        sections.push({ id: "groups", rooms: readGroup });
      }
      if (readDirect.length > 0) {
        sections.push({ id: "direct", rooms: readDirect });
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
      <div style={style} className="px-4">
        <div
          className={clsx(
            "flex h-full items-center text-[11px] font-medium uppercase tracking-[0.12em] text-text-muted/80",
            data.collapsed && "justify-center",
          )}
        >
          {data.collapsed
            ? item.title.charAt(0)
            : `${item.title} (${item.count})`}
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
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<VariableSizeList<RowData> | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardCursor, setKeyboardCursor] = useState(0);
  const [isKeyboardMode, setIsKeyboardMode] = useState(false);

  const sectionTitles = useMemo<Record<SectionId, string>>(
    () => ({
      unread: t("sidebar:room.section.unread"),
      channels: t("sidebar:room.section.channels"),
      groups: t("sidebar:room.section.groups"),
      direct: t("sidebar:room.section.direct"),
    }),
    [t],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const sortedRooms = useMemo(
    () =>
      rankConversations(Array.isArray(conversations) ? conversations : [], {
        currentUserId: currentUser.id,
        currentUsername: currentUser.username,
        currentDisplayName: currentUser.displayName,
        activeConversationId: selectedId,
      }),
    [
      conversations,
      currentUser.displayName,
      currentUser.id,
      currentUser.username,
      selectedId,
    ],
  );

  const queriedRooms = useMemo(() => {
    return sortedRooms.filter((conversation) =>
      includesQuery(conversation, normalizedQuery),
    );
  }, [sortedRooms, normalizedQuery]);

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
        title: sectionTitles[section.id],
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
  }, [sections, sectionTitles]);

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
    return selectedRoomPosition >= 0
      ? selectedRoomPosition
      : clampedKeyboardCursor;
  }, [
    roomIndexes.length,
    isKeyboardMode,
    clampedKeyboardCursor,
    selectedRoomPosition,
  ]);

  const rowData = useMemo<RowData>(() => {
    const keyboardListIndex = roomIndexes[currentCursor];
    const keyboardActiveRoomId =
      typeof keyboardListIndex === "number" &&
      flatItems[keyboardListIndex]?.kind === "room"
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
        <p className="text-sm text-text-muted">
          {normalizedQuery
            ? t("sidebar:room.emptyBySearch")
            : t("sidebar:room.empty")}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 pb-2"
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
