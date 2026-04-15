import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BellIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  PencilSquareIcon,
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
  onToggleNotifications?: () => void;
  notificationUnreadCount?: number;
}

const resolveDisplayName = (user: UserSummary, fallback: string): string => {
  return getUserDisplayName(user, { allowTechnicalFallback: true }) || fallback;
};

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

  const key = statusKeyMap[normalized];
  return key ? t(key) : t("common:status.offline");
};

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  currentUser,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onCurrentUserClick,
  onToggleNotifications,
  notificationUnreadCount = 0,
}) => {
  const { t } = useTranslation();

  const currentUserName = useMemo(
    () => resolveDisplayName(currentUser, t("common:labels.user")),
    [currentUser, t],
  );
  const currentStatusLabel = useMemo(
    () => resolveStatusLabel(currentUser.status, t),
    [currentUser.status, t],
  );

  return (
    <div className="px-3 pb-2 pt-3">
      <div className="flex items-center justify-between gap-2 rounded-[1.75rem] border border-border/70 bg-surface/85 px-2.5 py-2 shadow-xs backdrop-blur-sm">
        <button
          type="button"
          onClick={onCurrentUserClick}
          className={clsx(
            "flex min-w-0 flex-1 items-center rounded-[1.25rem] text-left transition-micro hover:bg-surface-hover",
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-2.5 py-2.5",
          )}
          title={collapsed ? currentUserName : undefined}
          aria-label={currentUserName}
        >
          <Avatar
            src={currentUser.avatar}
            alt={currentUserName}
            size={collapsed ? "sm" : "md"}
            status={currentUser.status}
            showStatus
          />

          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text-primary">
                {currentUserName}
              </p>
              <p className="truncate text-caption text-text-muted">
                {currentStatusLabel}
              </p>
            </div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <div className="relative">
            <IconButtonSurface
              onClick={onToggleNotifications}
              aria-label={t("notifications.panelTitle", {
                defaultValue: "Notifications",
              })}
            >
              <BellIcon className="h-5 w-5" />
            </IconButtonSurface>
            {notificationUnreadCount > 0 && (
              <Badge
                count={notificationUnreadCount}
                size="sm"
                variant="danger"
                className="absolute -right-1 -top-1"
              />
            )}
          </div>

          {!collapsed && (
            <IconButtonSurface
              onClick={onNewChat}
              className="bg-primary text-text-inverse shadow-xs hover:bg-primary-hover hover:text-text-inverse"
              aria-label={t("sidebar:header.startNewChat")}
            >
              <PencilSquareIcon className="h-5 w-5" />
            </IconButtonSurface>
          )}

          <IconButtonSurface
            onClick={onToggleCollapsed}
            className="hidden lg:inline-flex"
            aria-label={
              collapsed
                ? t("sidebar:header.expandSidebar")
                : t("sidebar:header.collapseSidebar")
            }
          >
            {collapsed ? (
              <ChevronDoubleRightIcon className="h-5 w-5" />
            ) : (
              <ChevronDoubleLeftIcon className="h-5 w-5" />
            )}
          </IconButtonSurface>
        </div>
      </div>
    </div>
  );
};

export default SidebarHeader;
