import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BuildingOffice2Icon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
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
  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary";

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
    <>
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {!collapsed && (
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("sidebar:header.workspace")}
              </p>
            )}

            <div className="flex items-center gap-2">
              {!collapsed && (
                <BuildingOffice2Icon className="h-4 w-4 text-text-muted" />
              )}
              <h1
                className={clsx(
                  "truncate font-semibold text-text-primary",
                  collapsed ? "text-sm" : "text-base",
                )}
              >
                {collapsed ? t("common:app.shortName") : t("common:app.name")}
              </h1>
            </div>
          </div>

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

      <div className="border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onCurrentUserClick}
          className={clsx(
            "flex w-full items-center rounded-lg text-left transition-colors hover:bg-surface-overlay",
            collapsed ? "justify-center p-2" : "gap-3 px-2 py-2",
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
              <p className="truncate text-sm font-medium text-text-primary">
                {currentUserName}
              </p>
              <p className="text-xs text-text-muted">{currentStatusLabel}</p>
            </div>
          )}
        </button>
      </div>
    </>
  );
};

export default SidebarHeader;
