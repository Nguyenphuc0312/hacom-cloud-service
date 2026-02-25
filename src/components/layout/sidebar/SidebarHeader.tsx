import React, { useMemo } from "react";
import clsx from "clsx";
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
}

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
  return statusLabelByKey[status.trim().toLowerCase()] ?? "Offline";
};

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  currentUser,
  collapsed,
  onToggleCollapsed,
  onNewChat,
}) => {
  const currentUserName = useMemo(
    () => resolveDisplayName(currentUser),
    [currentUser],
  );
  const currentStatusLabel = useMemo(
    () => resolveStatusLabel(currentUser.status),
    [currentUser.status],
  );

  return (
    <>
      <div className="border-b border-slate-200 px-3 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {!collapsed && (
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                Workspace
              </p>
            )}
            <div className="flex items-center gap-2">
              {!collapsed && (
                <BuildingOffice2Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              )}
              <h1
                className={clsx(
                  "truncate font-semibold text-slate-900 dark:text-slate-100",
                  collapsed ? "text-sm" : "text-base",
                )}
              >
                {collapsed ? "HC" : "Hacom Chat"}
              </h1>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onNewChat}
              className={clsx(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                "text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
              )}
              aria-label="Start new chat"
            >
              <PencilSquareIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={onToggleCollapsed}
              className={clsx(
                "hidden h-9 w-9 items-center justify-center rounded-xl lg:inline-flex",
                "text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900",
                "dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100",
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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

      <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          className={clsx(
            "flex w-full items-center rounded-xl text-left",
            "transition-colors hover:bg-slate-100 dark:hover:bg-slate-800",
            collapsed ? "justify-center p-1.5" : "gap-3 px-2 py-1.5",
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
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {currentUserName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentStatusLabel}
              </p>
            </div>
          )}
        </button>
      </div>
    </>
  );
};

export default SidebarHeader;
