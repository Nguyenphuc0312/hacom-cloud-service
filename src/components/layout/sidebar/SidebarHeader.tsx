import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import type { UserSummary } from "../../../types";

interface SidebarHeaderProps {
  currentUser: UserSummary;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewChat?: () => void;
  onCurrentUserClick?: () => void;
}

const resolveDisplayName = (user: UserSummary, fallback: string): string => {
  const byDisplayName =
    typeof user.displayName === "string" ? user.displayName.trim() : "";
  if (byDisplayName) return byDisplayName;

  const byUsername =
    typeof user.username === "string" ? user.username.trim() : "";
  if (byUsername) return byUsername;

  return fallback;
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

const iconButtonClasses =
  "inline-flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-white/8 hover:text-text-primary";

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  currentUser,
  collapsed,
  onToggleCollapsed,
  onNewChat,
  onCurrentUserClick,
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
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCurrentUserClick}
          className={clsx(
            "flex min-w-0 flex-1 items-center rounded-[22px] text-left transition-colors hover:bg-white/6",
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-2 py-2.5",
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
              <p className="truncate text-[15px] font-semibold text-text-primary">
                {currentUserName}
              </p>
              <p className="truncate text-xs text-text-muted">{currentStatusLabel}</p>
            </div>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {!collapsed && (
            <button
              type="button"
              onClick={onNewChat}
              className={iconButtonClasses}
              aria-label={t("sidebar:header.startNewChat")}
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleCollapsed}
            className={clsx("hidden lg:inline-flex", iconButtonClasses)}
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
          </button>
        </div>
      </div>
    </div>
  );
};

export default SidebarHeader;
