import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftOnRectangleIcon,
  BellIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { IconButtonSurface } from "../../ui";
import { NotificationPanel } from "../../notification/NotificationPanel";
import { useNotificationStore, useNotificationUnreadCount } from "../../../features/notification/state/notificationStore";
import type { UserSummary } from "../../../types";
import { getUserDisplayName } from "../../../utils/messageHelpers";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface SidebarHeaderProps {
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  onNewChat?: () => void;
  onCurrentUserClick?: () => void;
  onOpenFriends?: () => void;
  onOpenSettings?: () => void;
  onRequestLogout?: () => void;
  onFocusSearch?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

const resolveDisplayName = (user: UserSummary, fallback: string): string =>
  getUserDisplayName(user, { allowTechnicalFallback: true }) || fallback;

const resolveStatusLabel = (
  status: unknown,
  t: (key: string) => string,
): string => {
  if (typeof status !== "string") return t("common:status.offline");

  const normalized = status.trim().toLowerCase();
  const statusKeyMap: Record<string, string> = {
    online: "common:status.online",
    offline: "common:status.offline",
    away: "common:status.away",
    dnd: "common:status.dnd",
    busy: "common:status.busy",
    invisible: "common:status.invisible",
  };

  return t(statusKeyMap[normalized] ?? "common:status.offline");
};

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  layoutState,
  currentUser,
  onNewChat,
  onCurrentUserClick,
  onOpenFriends,
  onOpenSettings,
  onRequestLogout,
  onFocusSearch,
  onMarkRead,
  onMarkAllRead,
}) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const notificationRef = React.useRef<HTMLDivElement | null>(null);
  const isDense = layoutState !== "normal";
  const unreadCount = useNotificationUnreadCount();
  const togglePanel = useNotificationStore((s) => s.togglePanel);
  const isPanelOpen = useNotificationStore((s) => s.isPanelOpen);

  const currentUserName = useMemo(
    () => resolveDisplayName(currentUser, t("common:labels.user")),
    [currentUser, t],
  );
  const currentStatusLabel = useMemo(
    () => resolveStatusLabel(currentUser.status, t),
    [currentUser.status, t],
  );

  React.useEffect(() => {
    if (!isMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  React.useEffect(() => {
    if (!isPanelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (notificationRef.current?.contains(event.target as Node)) return;
      togglePanel();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") togglePanel();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPanelOpen, togglePanel]);

  return (
    <div
      className={clsx(
        "border-b border-border/60 bg-surface",
        isDense ? "px-3 py-3" : "px-4 py-4",
      )}
    >
      <div className={clsx("flex items-center", isDense ? "gap-2" : "gap-3")}>
        <button
          type="button"
          onClick={onCurrentUserClick}
          className={clsx(
            "flex min-w-0 flex-1 items-center rounded-md text-left transition-micro hover:bg-surface-hover/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            isDense ? "gap-2 px-1 py-1" : "gap-3 px-1.5 py-1.5",
          )}
          aria-label={currentUserName}
        >
          <Avatar
            src={currentUser.avatar}
            alt={currentUserName}
            size="md"
            status={currentUser.status}
            showStatus
          />

          <div className="min-w-0 flex-1">
            <p
              className={clsx(
                "font-semibold text-text-primary",
                isDense ? "text-[16px] leading-5" : "text-[20px] leading-7",
              )}
            >
              Tin nhắn
            </p>
            <p
              title={`${currentStatusLabel} · ${currentUserName}`}
              className={clsx(
                "truncate text-text-muted",
                isDense ? "text-[11px] leading-4" : "text-[12px] leading-4",
              )}
            >
              {currentStatusLabel} · {currentUserName}
            </p>
          </div>
        </button>

        <div
          className={clsx(
            "relative flex shrink-0 items-center",
            isDense ? "gap-1" : "gap-1.5",
          )}
          ref={menuRef}
        >
          <IconButtonSurface
            onClick={onNewChat}
            className={clsx(
              "rounded-md bg-[hsl(var(--chat-active-surface)/0.12)] text-primary shadow-none hover:bg-[hsl(var(--chat-active-surface)/0.18)] hover:text-primary",
              "h-[var(--control-height-md)] w-[var(--control-height-md)]",
            )}
            aria-label={t("sidebar:header.startNewChat")}
          >
            <PencilSquareIcon className="h-[18px] w-[18px]" />
          </IconButtonSurface>

          <IconButtonSurface
            onClick={onFocusSearch}
            className={clsx(
              "rounded-md text-text-muted hover:bg-surface-hover/70 hover:text-text-primary",
              "h-[var(--control-height-md)] w-[var(--control-height-md)]",
            )}
            aria-label={t("sidebar:search.aria")}
          >
            <MagnifyingGlassIcon className="h-[18px] w-[18px]" />
          </IconButtonSurface>

          <div className="relative" ref={notificationRef}>
            <IconButtonSurface
              onClick={togglePanel}
              className={clsx(
                "rounded-md text-text-muted hover:bg-surface-hover/70 hover:text-text-primary",
                "h-[var(--control-height-md)] w-[var(--control-height-md)]",
                isPanelOpen && "bg-surface-hover/70 text-text-primary",
              )}
              aria-label="Thông báo"
            >
              <BellIcon className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-0.5 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </IconButtonSurface>

            {isPanelOpen && (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-[80]">
                <NotificationPanel
                  onMarkRead={onMarkRead}
                  onMarkAllRead={onMarkAllRead}
                />
              </div>
            )}
          </div>

          <IconButtonSurface
            onClick={() => setIsMenuOpen((current) => !current)}
            className={clsx(
              "rounded-md text-text-muted hover:bg-surface-hover/70 hover:text-text-primary",
              "h-[var(--control-height-md)] w-[var(--control-height-md)]",
            )}
            aria-label={t("common:actions.more", {
              defaultValue: "More actions",
            })}
          >
            <EllipsisHorizontalIcon className="h-[18px] w-[18px]" />
          </IconButtonSurface>

          {isMenuOpen && (
            <div
              className={clsx(
                "absolute right-0 top-[calc(100%+0.4rem)] z-[70] min-w-[13rem] overflow-hidden rounded-xl border border-border/80 bg-surface p-1.5 shadow-elev3",
              )}
              role="menu"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
                onClick={() => {
                  setIsMenuOpen(false);
                  onCurrentUserClick?.();
                }}
                role="menuitem"
              >
                <UserCircleIcon className="h-5 w-5" />
                <span>{t("profile:title", { defaultValue: "Profile" })}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenFriends?.();
                }}
                role="menuitem"
              >
                <UserGroupIcon className="h-5 w-5" />
                <span>{t("friends:title", { defaultValue: "Friends" })}</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSettings?.();
                }}
                role="menuitem"
              >
                <Cog6ToothIcon className="h-5 w-5" />
                <span>
                  {t("settings:pageTitle", { defaultValue: "Settings" })}
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-danger transition-micro hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
                onClick={() => {
                  setIsMenuOpen(false);
                  onRequestLogout?.();
                }}
                role="menuitem"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                <span>
                  {t("sidebar:logout.button", { defaultValue: "Log out" })}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SidebarHeader;
