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

  // ─── Unread count riêng theo filter để hiển thị trên từng tab ────────────
  const unreadByFilter = useMemo(() => {
    const safeConversations = Array.isArray(conversations) ? conversations : [];
    return {
      all: safeConversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
      direct: safeConversations
        .filter((c) => isDirectConversation(c))
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0),
      groups: safeConversations
        .filter((c) => !isDirectConversation(c))
        .reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    };
  }, [conversations]);

  const handleLogoutConfirm = async () => {
    try {
      await logout();
    } finally {
      setIsLogoutConfirmOpen(false);
    }
  };

  // ─── Helper: active state cho bottom nav ─────────────────────────────────
  const isNavActive = (path: string) => location.pathname.startsWith(path);

  return (
    <>
      <SidebarContainer collapsed={isCollapsed} className={className}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <SidebarHeader
          currentUser={currentUser}
          collapsed={isCollapsed}
          onToggleCollapsed={() => setIsCollapsed((current) => !current)}
          onNewChat={onNewChat}
          onCurrentUserClick={onCurrentUserClick}
        />

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <SidebarSearch
          value={searchQuery}
          collapsed={isCollapsed}
          onChange={setSearchQuery}
          onSearchUsers={(query) =>
            navigate(`${ROUTE_PATHS.FRIENDS}?q=${encodeURIComponent(query)}`)
          }
        />

        {/* ── Filter Tabs ─────────────────────────────────────────────────── */}
        {!isCollapsed && (
          <div className="px-3 pb-2 pt-1">
            <div
              className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label={t("sidebar:tabs.label")}
            >
              {tabs.map((tab) => {
                const isActive = activeFilter === tab.id;
                // ─── FIX: Lấy unread count của từng tab ─────────────────
                const tabUnread =
                  unreadByFilter[tab.id as keyof typeof unreadByFilter] ?? 0;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveFilter(tab.id)}
                    className={clsx(
                      // ─── FIX: Tăng padding để text có không gian ──────
                      "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-caption font-medium transition-micro",
                      isActive
                        ? "bg-surface text-text-primary shadow-xs"
                        : "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
                    )}
                  >
                    {/* ─── FIX: Render label — đây là bug chính trong code gốc ─── */}
                    <span>{tab.label}</span>

                    {/* Badge chỉ hiện khi có unread, không chỉ tab "all" */}
                    {tabUnread > 0 && (
                      <Badge
                        count={tabUnread}
                        size="sm"
                        variant={isActive ? "primary" : "muted"}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Loading indicator khi đang fetch thêm conversations */}
            {isLoadingConversations && conversations.length > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 px-1 text-caption text-text-muted">
                <Spinner size="sm" />
                <span>{t("common:loading.default")}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Room List ───────────────────────────────────────────────────── */}
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

        {/* ── Bottom Nav ──────────────────────────────────────────────────── */}
        <div className="border-t border-border/70 px-2 pb-2 pt-2">
          {/* Friends */}
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.FRIENDS)}
            className={clsx(
              "inline-flex w-full items-center rounded-lg px-3 py-2.5 text-body-sm font-medium transition-micro",
              isNavActive(ROUTE_PATHS.FRIENDS)
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={t("friends:title")}
            // ─── UX: tooltip khi collapsed ────────────────────────────────
            title={isCollapsed ? t("friends:title") : undefined}
          >
            <UserGroupIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && <span className="ml-2">{t("friends:title")}</span>}
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={() => navigate(ROUTE_PATHS.SETTINGS)}
            className={clsx(
              "inline-flex w-full items-center rounded-lg px-3 py-2.5 text-body-sm font-medium transition-micro",
              isNavActive(ROUTE_PATHS.SETTINGS)
                ? "bg-surface-active text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              isCollapsed && "justify-center px-0",
            )}
            aria-label={t("settings:pageTitle")}
            title={isCollapsed ? t("settings:pageTitle") : undefined}
          >
            <Cog6ToothIcon className="h-5 w-5 shrink-0" />
            {!isCollapsed && (
              <span className="ml-2">{t("settings:pageTitle")}</span>
            )}
          </button>

          {/* Logout */}
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
            title={isCollapsed ? t("sidebar:logout.button") : undefined}
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
