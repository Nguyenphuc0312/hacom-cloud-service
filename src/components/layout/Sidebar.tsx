import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog, Spinner } from "../ui";
import { useLogout, usePresence } from "../../hooks";
import type { Conversation, UserSummary } from "../../types";
import { isDirectConversation } from "../../lib/conversationAdapter";
import { getOtherParticipant } from "../../utils/messageHelpers";
import { SidebarContainer } from "./sidebar/SidebarContainer";
import { SidebarHeader } from "./sidebar/SidebarHeader";
import { SidebarSearch } from "./sidebar/SidebarSearch";
import { RoomList } from "./sidebar/RoomList";
import { ROUTE_PATHS } from "../../router/paths";

interface SidebarProps {
  conversations: Conversation[];
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

const COLLAPSED_STORAGE_KEY = "chat.sidebar.collapsed";

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
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
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const { logout, isLoggingOut } = useLogout();
  const currentConversationId = selectedId;

  const handleSelectRoom = useCallback(
    (conversationId: string) => {
      onSelectConversation(conversationId);
    },
    [onSelectConversation],
  );

  const dmUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conversation of conversations ?? []) {
      if (!isDirectConversation(conversation)) continue;
      const other = getOtherParticipant(conversation, currentUser.id);
      if (other?.id) ids.add(other.id);
    }
    return Array.from(ids);
  }, [conversations, currentUser.id]);

  usePresence({ userIds: dmUserIds, enabled: dmUserIds.length > 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    setIsCollapsed(storedValue === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } finally {
      setIsLogoutConfirmOpen(false);
    }
  };

  return (
    <>
      <SidebarContainer
        collapsed={isCollapsed}
        className={clsx("relative", className)}
      >
        <SidebarHeader
          currentUser={currentUser}
          collapsed={isCollapsed}
          onToggleCollapsed={() => setIsCollapsed((current) => !current)}
          onNewChat={onNewChat}
          onCurrentUserClick={onCurrentUserClick}
          onOpenFriends={() => navigate(ROUTE_PATHS.FRIENDS)}
          onOpenSettings={() => navigate(ROUTE_PATHS.SETTINGS)}
          onRequestLogout={() => setIsLogoutConfirmOpen(true)}
        />

        <div className="px-4">
          <SidebarSearch
            value={searchQuery}
            collapsed={isCollapsed}
            onChange={setSearchQuery}
            onSearchUsers={(query) =>
              navigate(`${ROUTE_PATHS.FRIENDS}?q=${encodeURIComponent(query)}`)
            }
          />

          {isLoadingConversations && conversations.length > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 px-1 text-caption text-text-muted">
              <Spinner size="sm" />
              <span>{t("common:loading.default")}</span>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 px-2 pb-3 pt-2.5">
          <RoomList
            conversations={conversations}
            currentUser={currentUser}
            selectedId={currentConversationId}
            searchQuery={deferredSearchQuery}
            collapsed={isCollapsed}
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
