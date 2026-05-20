import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { SegmentedControl, SkeletonButton } from "../ui";
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
import { useChatSidebarStore } from "../../features/chat/state/chatSidebarStore";
import { useSidebarConversationList } from "../../features/chat/hooks/useSidebarConversationList";
import type { ChatLayoutState } from "../../utils/densityPolicy";

interface SidebarProps {
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  selectedId: string | null;
  isLoadingConversations?: boolean;
  isLoadingMoreConversations?: boolean;
  hasMoreConversations?: boolean;
  showConversationSkeleton?: boolean;
  conversationsError?: string | null;
  onSelectConversation: (id: string) => void;
  onRetryConversations?: () => void;
  onLoadMoreConversations?: () => void;
  onCurrentUserClick?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  layoutState,
  currentUser,
  selectedId,
  isLoadingConversations = false,
  isLoadingMoreConversations = false,
  hasMoreConversations = false,
  showConversationSkeleton = false,
  conversationsError = null,
  onSelectConversation,
  onRetryConversations,
  onLoadMoreConversations,
  onCurrentUserClick,
  className,
}) => {
  const { t } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = useChatSidebarStore((state) => state.searchQuery);
  const setSearchQuery = useChatSidebarStore((state) => state.setSearchQuery);
  const activeFilter = useChatSidebarStore((state) => state.filter);
  const setActiveFilter = useChatSidebarStore((state) => state.setFilter);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isAuthenticated = !!useAuthStore((s) => s.user);
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
      <SidebarContainer className={className}>
        <SidebarHeader
          layoutState={layoutState}
          currentUser={currentUser}
          onCurrentUserClick={onCurrentUserClick}
        />

        <SidebarSearch
          layoutState={layoutState}
          value={searchQuery}
          onChange={setSearchQuery}
          inputRef={searchInputRef}
        />

        <div
          className={
            layoutState === "normal" ? "px-4 pb-3" : "px-3 pb-2.5"
          }
        >
          <SegmentedControl
            value={activeFilter}
            onChange={(value) =>
              setActiveFilter(value as "all" | "unread" | "groups")
            }
            size="sm"
            ariaLabel={t("sidebar:room.listAria")}
            options={[
              {
                id: "all",
                label: t("sidebar:tabs.all"),
                count: counts.all,
              },
              {
                id: "groups",
                label: t("sidebar:tabs.groups"),
                count: counts.groups,
              },
            ]}
          />

          {isLoadingConversations && conversationIds.length > 0 && (
            <div
              className="mt-2 flex items-center gap-2 px-1"
              aria-busy="true"
              aria-label={t("common:loading.default")}
              role="status"
            >
              <SkeletonButton width={128} height={12} />
            </div>
          )}
        </div>

        <div
          className={clsx(
            "flex min-h-0 flex-1",
            layoutState === "normal" ? "px-2 pb-3" : "px-1.5 pb-2.5",
          )}
        >
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
      </SidebarContainer>


    </>
  );
};

export default Sidebar;
