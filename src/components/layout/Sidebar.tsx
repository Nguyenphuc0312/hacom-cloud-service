import React, { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeftOnRectangleIcon,
  Bars3Icon,
  ChevronDownIcon,
  Cog6ToothIcon,
  MoonIcon,
  UserCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { ConversationSearch } from "../conversation/ConversationSearch";
import { ConversationList } from "../conversation/ConversationList";
import { NewChatButton } from "../conversation/NewChatButton";
import { Avatar } from "../common/Avatar";
import { ConfirmDialog } from "../ui";
import type {
  Conversation,
  ConversationFilter,
  UserSummary,
} from "../../types";
import { useLogout } from "../../hooks";

interface SidebarProps {
  conversations: Conversation[];
  currentUser: UserSummary;
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat?: () => void;
  className?: string;
}

const tabs: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "Tat ca" },
  { id: "unread", label: "Chua doc" },
  { id: "groups", label: "Nhom" },
  { id: "channels", label: "Kenh" },
];

const statusLabelByKey: Record<string, string> = {
  online: "Online",
  offline: "Offline",
  away: "Away",
  dnd: "Do not disturb",
  busy: "Busy",
  invisible: "Invisible",
};

const resolveDisplayName = (user: UserSummary): string => {
  const byDisplayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (byDisplayName) return byDisplayName;

  const byUsername =
    typeof user.username === "string" ? user.username.trim() : "";
  if (byUsername) return byUsername;

  return "User";
};

const resolveStatusLabel = (status: unknown): string => {
  if (typeof status !== "string") return "Offline";
  const key = status.trim().toLowerCase();
  return statusLabelByKey[key] ?? "Offline";
};

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentUser,
  selectedId,
  onSelectConversation,
  onNewChat,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ConversationFilter>("all");
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement | null>(null);
  const { logout, isLoggingOut } = useLogout();

  const currentUserName = useMemo(
    () => resolveDisplayName(currentUser),
    [currentUser],
  );
  const currentStatusLabel = useMemo(
    () => resolveStatusLabel(currentUser.status),
    [currentUser.status],
  );

  useEffect(() => {
    if (!isProfileDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileDropdownRef.current) return;
      const target = event.target;
      if (target instanceof Node && !profileDropdownRef.current.contains(target)) {
        setIsProfileDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileDropdownOpen]);

  const openLogoutConfirm = () => {
    setIsProfileDropdownOpen(false);
    setIsMobileDrawerOpen(false);
    setIsLogoutConfirmOpen(true);
  };

  const handleLogoutConfirm = async () => {
    await logout();
    setIsLogoutConfirmOpen(false);
  };

  return (
    <>
      <div className={clsx("flex h-full flex-col bg-white", className)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
              aria-label="Open menu"
            >
              <Bars3Icon className="h-5 w-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold tracking-tight text-telegram-primary sm:text-xl">
              Hacom Chat
            </h1>
          </div>

          <div className="relative hidden items-center gap-2 lg:flex" ref={profileDropdownRef}>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-1.5 text-gray-700 transition-colors hover:bg-gray-100"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              aria-expanded={isProfileDropdownOpen}
              aria-haspopup="menu"
              aria-label="Open profile menu"
            >
              <Avatar
                src={currentUser.avatar}
                alt={currentUserName}
                size="sm"
                status={currentUser.status}
                showStatus
              />
              <span className="max-w-24 truncate text-sm font-medium text-gray-800">
                {currentUserName}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
            </button>

            {isProfileDropdownOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-40 min-w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
              >
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-gray-900">{currentUserName}</p>
                  <p className="text-xs text-gray-500">{currentStatusLabel}</p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  disabled={isLoggingOut}
                  onClick={openLogoutConfirm}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                  Dang xuat
                </button>
              </div>
            )}

            <button
              type="button"
              className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
              aria-label="Settings"
            >
              <Cog6ToothIcon className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 sm:px-5">
          <ConversationSearch value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-1 border-b border-gray-200 px-3 pb-1 sm:px-4">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "min-h-11 rounded-lg px-1 py-2 text-xs font-medium transition-colors sm:text-sm",
                activeTab === tab.id
                  ? "border-b-2 border-telegram-primary bg-telegram-primary/5 text-telegram-primary"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              )}
              aria-pressed={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conversations list */}
        <ConversationList
          conversations={conversations}
          currentUserId={currentUser.id}
          selectedId={selectedId}
          searchQuery={searchQuery}
          activeFilter={activeTab}
          onSelect={onSelectConversation}
          className="flex-1"
        />

        {/* Bottom actions */}
        <div className="grid grid-cols-4 gap-1 border-t border-gray-200 px-3 py-2 sm:px-4">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Open menu"
            onClick={() => setIsMobileDrawerOpen(true)}
          >
            <UserCircleIcon className="h-6 w-6 text-gray-600" />
          </button>

          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="New group"
            onClick={onNewChat}
          >
            <UserGroupIcon className="h-6 w-6 text-gray-600" />
          </button>

          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Toggle theme"
          >
            <MoonIcon className="h-6 w-6 text-gray-600" />
          </button>

          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Settings"
          >
            <Cog6ToothIcon className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        {/* New chat FAB - mobile only */}
        <div className="lg:hidden">
          <NewChatButton onClick={onNewChat || (() => console.log("New chat"))} />
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={clsx(
          "fixed inset-0 z-50 lg:hidden",
          isMobileDrawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!isMobileDrawerOpen}
      >
        <div
          className={clsx(
            "absolute inset-0 bg-black/40 transition-opacity duration-200",
            isMobileDrawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setIsMobileDrawerOpen(false)}
        />

        <aside
          className={clsx(
            "absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col bg-white shadow-xl transition-transform duration-200",
            isMobileDrawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile menu"
        >
          <div className="flex items-start justify-between border-b border-gray-200 px-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar
                src={currentUser.avatar}
                alt={currentUserName}
                size="md"
                status={currentUser.status}
                showStatus
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{currentUserName}</p>
                <p className="text-xs text-gray-500">{currentStatusLabel}</p>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100"
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Close menu"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 px-2 py-3">
            <button
              type="button"
              onClick={() => {
                setIsMobileDrawerOpen(false);
                onNewChat?.();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              <UserGroupIcon className="h-5 w-5" />
              New chat or group
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              <Cog6ToothIcon className="h-5 w-5" />
              Settings
            </button>
          </div>

          <div className="border-t border-gray-200 p-3">
            <button
              type="button"
              onClick={openLogoutConfirm}
              disabled={isLoggingOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
              {isLoggingOut ? "Dang xu ly..." : "Dang xuat"}
            </button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => {
          if (isLoggingOut) return;
          setIsLogoutConfirmOpen(false);
        }}
        onConfirm={handleLogoutConfirm}
        title="Dang xuat tai khoan"
        message="Ban se can dang nhap lai de tiep tuc su dung ung dung."
        confirmText="Dang xuat"
        cancelText="Huy"
        variant="warning"
        isLoading={isLoggingOut}
      />
    </>
  );
};

export default Sidebar;
