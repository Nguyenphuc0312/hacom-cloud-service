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
import { useLocation } from "react-router-dom";
import {
  ArrowLeftOnRectangleIcon,
  Cog6ToothIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "../common/Badge";
import { ConfirmDialog, Spinner } from "../ui";
import { useLogout, usePresence } from "../../hooks";
import type {
  Conversation,
  ConversationFilter,
  UserSummary,
} from "../../types";
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
  const location = useLocation();

  const tabs: { id: ConversationFilter; label: string }[] = [
    { id: "all", label: t("sidebar:tabs.all") },
    { id: "direct", label: t("sidebar:tabs.direct") },
    { id: "groups", label: t("sidebar:tabs.groups") },
  ];

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("all");
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

  // Collect unique DM contact user IDs so presence is subscribed globally
  const dmUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conv of conversations ?? []) {
      if (!isDirectConversation(conv)) continue;
      const other = getOtherParticipant(conv, currentUser.id);
      if (other?.id) ids.add(other.id);
    }
    return Array.from(ids);
  }, [conversations, currentUser.id]);

  // Subscribe to presence for all DM contacts visible in the sidebar
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

  const unreadTotal = useMemo(
    () =>
      (Array.isArray(conversations) ? conversations : []).reduce(
        (sum, conversation) => sum + (conversation.unreadCount || 0),
        0,
      ),
    [conversations],
  );

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } finally {
      setIsLogoutConfirmOpen(false);
    }
  };

  return (
    <>
      <SidebarContainer collapsed={isCollapsed} className={className}>
        <SidebarHeader
          currentUser={currentUser}
          collapsed={isCollapsed}
          onToggleCollapsed={() => setIsCollapsed((current) => !current)}
          onNewChat={onNewChat}
          onCurrentUserClick={onCurrentUserClick}
        />

        <SidebarSearch
          value={searchQuery}
          collapsed={isCollapsed}
          onChange={setSearchQuery}
          onSearchUsers={(query) =>
            navigate(`${ROUTE_PATHS.FRIENDS}?q=${encodeURIComponent(query)}`)
          }
        />

        {!isCollapsed && (
          <div className="px-3 pb-2 pt-1">
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => {
                const isActive = activeFilter === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={clsx(
                      "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-caption font-medium transition-micro",
                      isActive
                        ? "bg-surface text-text-primary shadow-xs"
                        : "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
                    )}
                    aria-pressed={isActive}
                  >
                    {tab.label}
                    {tab.id === "all" && unreadTotal > 0 && (
                      <Badge
                        count={unreadTotal}
                        size="sm"
                        variant={isActive ? "primary" : "muted"}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {isLoadingConversations && conversations.length > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 px-1 text-caption text-text-muted">
                <Spinner size="sm" />
                <span>{t("common:loading.default")}</span>
              </div>
            )}
          </div>
        )}

        <RoomList
          conversations={conversations}
          currentUser={currentUser}
          selectedId={currentConversationId}
          searchQuery={deferredSearchQuery}
          activeFilter={activeFilter}
          collapsed={isCollapsed}
          showLoadingSkeleton={showConversationSkeleton}
          error={conversationsError}
          onRetry={onRetryConversations}
          hasMore={hasMoreConversations}
          isLoadingMore={isLoadingMoreConversations}
          onLoadMore={onLoadMoreConversations}
          onSelect={handleSelectRoom}
        />

        <div className="border-t border-border/70 px-2 pb-2 pt-2">
          {/* Friends button */}
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.FRIENDS)}
            className={clsx(
              "inline-flex w-full items-center rounded-lg px-3 py-2.5 text-body-sm font-medium transition-micro",
              location.pathname.startsWith(ROUTE_PATHS.FRIENDS)
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={t("friends:title")}
          >
            <UserGroupIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="ml-2">{t("friends:title")}</span>}
          </button>

          {/* Settings button */}
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
            className={clsx(
              "inline-flex w-full items-center rounded-lg px-3 py-2.5 text-body-sm font-medium transition-micro",
              location.pathname.startsWith(ROUTE_PATHS.SETTINGS)
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={t("settings:pageTitle")}
          >
            <Cog6ToothIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && (
              <span className="ml-2">{t("settings:pageTitle")}</span>
            )}
          </button>

          {/* Logout button */}
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => setIsLogoutConfirmOpen(true)}
            className={clsx(
              "inline-flex w-full items-center rounded-lg px-3 py-2.5 text-body-sm font-medium transition-micro",
              "text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={t("sidebar:logout.button")}
          >
            <ArrowLeftOnRectangleIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && (
              <span className="ml-2">
                {isLoggingOut
                  ? t("sidebar:logout.loading")
                  : t("sidebar:logout.button")}
              </span>
            )}
          </button>
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
