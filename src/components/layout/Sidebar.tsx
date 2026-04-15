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
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { ConfirmDialog, SegmentedControl, Spinner } from "../ui";
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
import { NotificationPanel } from "../notification/NotificationPanel";
import {
  useNotificationStore,
  useNotificationUnreadCount,
} from "../../features/notification/state/notificationStore";

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

  // ─── FIX: Khai báo tabs bên ngoài JSX để reuse ───────────────────────────
  const tabs: { id: ConversationFilter; label: string }[] = useMemo(
    () => [
      { id: "all", label: t("sidebar:tabs.all") },
      { id: "direct", label: t("sidebar:tabs.direct") },
      { id: "groups", label: t("sidebar:tabs.groups") },
    ],
    [t],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>("all");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const { logout, isLoggingOut } = useLogout();
  const currentConversationId = selectedId;
  const isNotificationPanelOpen = useNotificationStore(
    (state) => state.isPanelOpen,
  );
  const setNotificationPanelOpen = useNotificationStore(
    (state) => state.setPanelOpen,
  );
  const toggleNotificationPanel = useNotificationStore(
    (state) => state.togglePanel,
  );
  const notificationUnreadCount = useNotificationUnreadCount();

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

  // ─── Hydrate collapsed state từ localStorage (tránh flicker) ─────────────
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

  // ─── Helper: active state cho bottom nav ─────────────────────────────────
  const isNavActive = (path: string) => location.pathname.startsWith(path);

  useEffect(() => {
    setNotificationPanelOpen(false);
  }, [location.pathname, setNotificationPanelOpen]);

  return (
    <>
      <SidebarContainer
        collapsed={isCollapsed}
        className={clsx("relative", className)}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <SidebarHeader
          currentUser={currentUser}
          collapsed={isCollapsed}
          onToggleCollapsed={() => setIsCollapsed((current) => !current)}
          onNewChat={onNewChat}
          onCurrentUserClick={onCurrentUserClick}
          onOpenSettings={() => navigate(ROUTE_PATHS.SETTINGS)}
          onRequestLogout={() => setIsLogoutConfirmOpen(true)}
          onToggleNotifications={toggleNotificationPanel}
          notificationUnreadCount={notificationUnreadCount}
        />

        <NotificationPanel
          isOpen={isNotificationPanelOpen}
          onClose={() => setNotificationPanelOpen(false)}
          className={clsx(
            isCollapsed
              ? "left-4 right-4 top-[4.75rem] w-auto"
              : "right-4 top-[4.75rem]",
          )}
        />

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div className="px-4">
          <SidebarSearch
            value={searchQuery}
            collapsed={isCollapsed}
            onChange={setSearchQuery}
            onSearchUsers={(query) =>
              navigate(`${ROUTE_PATHS.FRIENDS}?q=${encodeURIComponent(query)}`)
            }
          />

          {!isCollapsed && (
            <div className="pt-2">
              <SegmentedControl
                value={activeFilter}
                onChange={(next) => setActiveFilter(next as ConversationFilter)}
                ariaLabel={t("sidebar:tabs.label")}
                size="sm"
                options={tabs.map((tab) => ({
                  id: tab.id,
                  label: tab.label,
                }))}
              />

              {isLoadingConversations && conversations.length > 0 && (
                <div className="mt-2 inline-flex items-center gap-2 px-1 text-caption text-text-muted">
                  <Spinner size="sm" />
                  <span>{t("common:loading.default")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Room List ───────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 px-2 pb-3 pt-2">
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
        </div>

        {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.FRIENDS)}
            className={clsx(
              "inline-flex min-h-11 w-full items-center rounded-2xl px-3 py-2.5 text-body-sm font-medium transition-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
              isNavActive(ROUTE_PATHS.FRIENDS)
                ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              isCollapsed && "justify-center px-0 py-0",
            )}
            aria-label={t("friends:title")}
            title={isCollapsed ? t("friends:title") : undefined}
          >
            <UserGroupIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="ml-2">{t("friends:title")}</span>}
          </button>
        </div>
      </SidebarContainer>

      {/* ── Logout Confirm Dialog ────────────────────────────────────────── */}
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
