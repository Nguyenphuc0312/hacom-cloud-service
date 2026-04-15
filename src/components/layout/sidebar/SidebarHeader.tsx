import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftOnRectangleIcon,
  BellIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { Badge } from "../../common/Badge";
import { IconButtonSurface } from "../../ui";
import type { UserSummary } from "../../../types";
import { getUserDisplayName } from "../../../utils/messageHelpers";

interface SidebarHeaderProps {
  currentUser: UserSummary;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat?: () => void;
  onCurrentUserClick?: () => void;
  onOpenSettings?: () => void;
  onRequestLogout?: () => void;
  onToggleNotifications?: () => void;
  notificationUnreadCount?: number;
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
  currentUser,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onCurrentUserClick,
  onOpenSettings,
  onRequestLogout,
  onToggleNotifications,
  notificationUnreadCount = 0,
}) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="px-4 pb-3 pt-4">
      <div
        className={clsx(
          "flex gap-2",
          collapsed ? "flex-col items-center" : "items-center justify-between",
        )}
      >
        <button
          type="button"
          onClick={() => setIsMenuOpen((current) => !current)}
          className={clsx(
            "flex min-w-0 items-center text-left transition-micro hover:bg-surface-hover/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            collapsed
              ? "h-11 w-11 justify-center rounded-2xl"
              : "flex-1 gap-3 rounded-[1.15rem] px-3 py-2.5",
          )}
          title={collapsed ? currentUserName : undefined}
          aria-label={currentUserName}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          <Avatar
            src={currentUser.avatar}
            alt={currentUserName}
            size="md"
            status={currentUser.status}
            showStatus
          />

          {!collapsed && (
            <div
              className="sidebar-shell-label min-w-0"
              data-collapsed={collapsed}
            >
              <p className="truncate text-body-sm font-semibold text-text-primary">
                {currentUserName}
              </p>
              <p className="truncate text-caption text-text-muted">
                {currentStatusLabel}
              </p>
            </div>
          )}
        </button>

        <div
          className={clsx(
            "relative flex shrink-0 items-center gap-1.5",
            collapsed && "flex-col",
          )}
          ref={menuRef}
        >
          <div className="relative shrink-0">
            <IconButtonSurface
              onClick={onToggleNotifications}
              aria-label={t("notifications.panelTitle", {
                defaultValue: "Notifications",
              })}
              className="h-9 w-9 rounded-[0.95rem]"
            >
              <BellIcon className="h-5 w-5" />
            </IconButtonSurface>
            {notificationUnreadCount > 0 && (
              <Badge
                count={notificationUnreadCount}
                size="sm"
                variant="danger"
                className="sidebar-shell-badge absolute -right-1 -top-1 shadow-xs"
              />
            )}
          </div>

          <IconButtonSurface
            onClick={onNewChat}
            className="h-10 w-10 rounded-[1rem] bg-primary text-text-inverse shadow-xs hover:bg-primary-hover hover:text-text-inverse"
            aria-label={t("sidebar:header.startNewChat")}
          >
            <PencilSquareIcon className="h-5 w-5" />
          </IconButtonSurface>

          <IconButtonSurface
            onClick={() => setIsMenuOpen((current) => !current)}
            className="h-9 w-9 rounded-[0.95rem]"
            aria-label={t("common:actions.more", {
              defaultValue: "More actions",
            })}
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </IconButtonSurface>

          {isMenuOpen && (
            <div
              className={clsx(
                "absolute z-[70] min-w-[13rem] overflow-hidden rounded-[1.25rem] border border-border/80 bg-surface p-1.5 shadow-elev3",
                collapsed
                  ? "left-[calc(100%+0.5rem)] top-0"
                  : "right-0 top-[calc(100%+0.5rem)]",
              )}
              role="menu"
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
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
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
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
                className="hidden w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-text-secondary transition-micro hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30 lg:flex"
                onClick={() => {
                  setIsMenuOpen(false);
                  onToggleCollapsed();
                }}
                role="menuitem"
              >
                {collapsed ? (
                  <ChevronDoubleRightIcon className="h-5 w-5" />
                ) : (
                  <ChevronDoubleLeftIcon className="h-5 w-5" />
                )}
                <span>
                  {collapsed
                    ? t("sidebar:header.expandSidebar")
                    : t("sidebar:header.collapseSidebar")}
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-danger transition-micro hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30"
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
