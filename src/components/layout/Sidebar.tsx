import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { toast } from "../ui";
import { usePresence, useNotifications } from "../../hooks";
import { useAuthStore } from "../../stores";
import { useChatStore } from "../../stores";
import type { UserSummary } from "../../types";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { getOtherParticipant } from "../../utils/messageHelpers";
import { SidebarContainer } from "./sidebar/SidebarContainer";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarSearch } from "./sidebar/SidebarSearch";
import { RoomList } from "./sidebar/RoomList";
import { GlobalSearchOverlay } from "./sidebar/GlobalSearchOverlay";
import {
  ConversationLabelManagerModal,
  SidebarLabelFilter,
} from "./sidebar/ConversationLabels";
import { useChatSidebarStore } from "../../features/chat/state/chatSidebarStore";
import { useSidebarConversationList } from "../../features/chat/hooks/useSidebarConversationList";
import type { ChatLayoutState } from "../../utils/densityPolicy";
import type { SidebarConversationFilter } from "../../features/chat/state/chatSidebarStore";

interface SidebarProps {
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  selectedId: string | null;
  leadingContent?: React.ReactNode;

  isLoadingMoreConversations?: boolean;
  hasMoreConversations?: boolean;
  showConversationSkeleton?: boolean;
  conversationsError?: string | null;
  onSelectConversation: (id: string) => void;
  onRetryConversations?: () => void;
  onLoadMoreConversations?: () => void;
  onCurrentUserClick?: () => void;
  onAddFriendClick?: () => void;
  className?: string;
}

const SidebarConversationTabs: React.FC<{
  value: SidebarConversationFilter;
  counts: {
    all: number;
    unread: number;
    groups: number;
  };
  onChange: (value: SidebarConversationFilter) => void;
}> = ({ value, counts, onChange }) => {
  const { t } = useTranslation();
  const tabs: Array<{
    id: SidebarConversationFilter;
    label: string;
    count: number;
  }> = [
    { id: "all", label: t("sidebar:tabs.all"), count: counts.all },
    { id: "groups", label: t("sidebar:tabs.groups"), count: counts.groups },
  ];

  return (
    <div
      role="tablist"
      aria-label={t("sidebar:room.listAria")}
      className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={clsx(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-[13px] font-semibold transition-micro",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2]/25",
              active
                ? "bg-[#1976D2]/10 text-[#1565C0]"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.count > 0 ? (
              <span
                className={clsx(
                  "inline-flex min-w-[1.15rem] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-[#1976D2]/10 text-[#1565C0]"
                    : "bg-surface-overlay text-text-muted",
                )}
              >
                {tab.count > 99 ? "99+" : tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  layoutState,
  currentUser,
  selectedId,
  leadingContent,

  isLoadingMoreConversations = false,
  hasMoreConversations = false,
  showConversationSkeleton = false,
  conversationsError = null,
  onSelectConversation,
  onRetryConversations,
  onLoadMoreConversations,
  onCurrentUserClick,
  onAddFriendClick = () => undefined,
  className,
}) => {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = useChatSidebarStore((state) => state.searchQuery);
  const setSearchQuery = useChatSidebarStore((state) => state.setSearchQuery);
  const activeFilter = useChatSidebarStore((state) => state.filter);
  const setActiveFilter = useChatSidebarStore((state) => state.setFilter);
  const isSearchOpen = useChatSidebarStore((state) => state.isSearchOpen);
  const openSearch = useChatSidebarStore((state) => state.openSearch);
  const closeSearch = useChatSidebarStore((state) => state.closeSearch);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isAuthenticated = !!useAuthStore((s) => s.user);
  const markAsRead = useChatStore((state) => state.markAsRead);
  useNotifications(isAuthenticated);

  const handleSelectRoom = useCallback(
    (conversationId: string) => {
      onSelectConversation(conversationId);
    },
    [onSelectConversation],
  );

  const { conversationIds, counts } = useSidebarConversationList(currentUser, {
    filter: activeFilter,
    query: deferredSearchQuery,
  });

  const handleMarkVisibleRead = useCallback(async () => {
    const conversationById = useChatStore.getState().conversationById;
    const unreadConversationIds = conversationIds.filter(
      (conversationId) =>
        (conversationById[conversationId]?.unreadCount ?? 0) > 0,
    );

    if (unreadConversationIds.length === 0) {
      toast.info(t("sidebar:labels.noUnreadInScope"));
      return;
    }

    const results = await Promise.allSettled(
      unreadConversationIds.map((conversationId) => markAsRead(conversationId)),
    );
    const failedCount = results.filter(
      (result) => result.status === "rejected",
    ).length;

    if (failedCount > 0) {
      toast.warning(t("sidebar:labels.markReadPartial"));
      return;
    }

    toast.success(t("sidebar:labels.markReadSuccess"));
  }, [conversationIds, markAsRead, t]);

  const dmUserIds = useMemo(() => {
    const ids = new Set<string>();
    const conversationById = useChatStore.getState().conversationById;
    for (const conversationId of conversationIds) {
      const conversation = conversationById[conversationId];
      if (!conversation) continue;
      if (!isDirectConversation(conversation)) continue;
      const other = getOtherParticipant(conversation, currentUser.id);
      if (other?.id) ids.add(other.id);
    }
    return Array.from(ids);
  }, [conversationIds, currentUser.id]);

  usePresence({ userIds: dmUserIds, enabled: dmUserIds.length > 0 });



  return (
    <>
      <SidebarContainer className={clsx("relative", className)}>
        <SidebarHeader
          layoutState={layoutState}
          currentUser={currentUser}
          onCurrentUserClick={onCurrentUserClick}
          onAddFriendClick={onAddFriendClick}
        />

        <SidebarSearch
          layoutState={layoutState}
          value={searchQuery}
          onChange={setSearchQuery}
          onFocus={openSearch}
          inputRef={searchInputRef}
        />

        <div
          className={
            layoutState === "normal" ? "px-4 pb-3" : "px-3 pb-2.5"
          }
        >
          <div className="flex items-center gap-2">
            <SidebarConversationTabs
              value={activeFilter}
              counts={counts}
              onChange={setActiveFilter}
            />
            <SidebarLabelFilter
              layoutState={layoutState}
              onMarkVisibleRead={handleMarkVisibleRead}
            />
          </div>


        </div>

        <div
          className={clsx(
            "flex min-h-0 flex-1 flex-col",
            layoutState === "normal" ? "px-2 pb-3" : "px-1.5 pb-2.5",
          )}
        >
          {leadingContent}
          <RoomList
            layoutState={layoutState}
            conversationIds={conversationIds}
            currentUser={currentUser}
            selectedId={selectedId}
            searchQuery={deferredSearchQuery}
            showLoadingSkeleton={showConversationSkeleton}
            error={conversationsError}
            onRetry={onRetryConversations}
            hasMore={hasMoreConversations}
            isLoadingMore={isLoadingMoreConversations}
            onLoadMore={onLoadMoreConversations}
            onSelect={handleSelectRoom}
          />
        </div>

        {isSearchOpen ? (
          <GlobalSearchOverlay
            currentUser={currentUser}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClose={closeSearch}
            inputRef={searchInputRef}
          />
        ) : null}
      </SidebarContainer>
      <ConversationLabelManagerModal />
    </>
  );
};

export default Sidebar;
