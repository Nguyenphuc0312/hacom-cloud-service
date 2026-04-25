import React, {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog, SegmentedControl, Spinner } from "../ui";
import { useLogout, usePresence } from "../../hooks";
import { useChatStore } from "../../stores";
import type { UserSummary } from "../../types";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { getOtherParticipant } from "../../utils/messageHelpers";
import { SidebarContainer } from "./sidebar/SidebarContainer";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarSearch } from "./sidebar/SidebarSearch";
import { RoomList } from "./sidebar/RoomList";
import { ROUTE_PATHS } from "../../router/paths";
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
  onNewChat?: () => void;
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
  onNewChat,
  onCurrentUserClick,
  className,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchQuery = useChatSidebarStore((state) => state.searchQuery);
  const setSearchQuery = useChatSidebarStore((state) => state.setSearchQuery);
  const activeFilter = useChatSidebarStore((state) => state.filter);
  const setActiveFilter = useChatSidebarStore((state) => state.setFilter);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const { logout, isLoggingOut } = useLogout();

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

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } finally {
      setIsLogoutConfirmOpen(false);
    }
  };

  return (
    <>
      <SidebarContainer className={className}>
        <SidebarHeader
          layoutState={layoutState}
          currentUser={currentUser}
          onNewChat={onNewChat}
          onCurrentUserClick={onCurrentUserClick}
          onOpenFriends={() => navigate(ROUTE_PATHS.FRIENDS)}
          onOpenSettings={() => navigate(ROUTE_PATHS.SETTINGS)}
          onRequestLogout={() => setIsLogoutConfirmOpen(true)}
          onFocusSearch={() => searchInputRef.current?.focus()}
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
                id: "unread",
                label: t("sidebar:tabs.unread"),
                count: counts.unread,
              },
              {
                id: "groups",
                label: t("sidebar:tabs.groups"),
                count: counts.groups,
              },
            ]}
          />

          {isLoadingConversations && conversationIds.length > 0 && (
            <div className="mt-1.5 inline-flex items-center gap-2 px-1 text-caption text-text-muted">
              <Spinner size="sm" />
              <span>{t("common:loading.default")}</span>
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

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => {
          if (!isLoggingOut) setIsLogoutConfirmOpen(false);
        }}
        onConfirm={handleLogoutConfirm}
        title={t("sidebar:logout.confirmTitle")}
        message={t("sidebar:logout.confirmMessage")}
        confirmText={t("sidebar:logout.confirmText")}
        cancelText={t("sidebar:logout.cancelText")}
        variant="warning"
        isLoading={isLoggingOut}
      />
    </>
  );
};

export default Sidebar;
