import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import CreateGroupIcon from "../../../shared/layout/CreateGroupIcon";
import { emitOpenNewChatModal } from "../../../lib/commandPalette";
import { Avatar } from "../../common/Avatar";
import { IconButtonSurface } from "../../ui";
import type { UserSummary } from "../../../types";
import { getUserDisplayName } from "../../../utils/messageHelpers";
import type { ChatLayoutState } from "../../../utils/densityPolicy";

interface SidebarHeaderProps {
  layoutState: ChatLayoutState;
  currentUser: UserSummary;
  onCurrentUserClick?: () => void;
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
  onCurrentUserClick,
}) => {
  const { t } = useTranslation();
  const isDense = layoutState !== "normal";

  const currentUserName = useMemo(
    () => resolveDisplayName(currentUser, t("common:labels.user")),
    [currentUser, t],
  );
  const currentStatusLabel = useMemo(
    () => resolveStatusLabel(currentUser.status, t),
    [currentUser.status, t],
  );



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
              {t("sidebar:header.conversations")}
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
        >
          <IconButtonSurface
            onClick={() => emitOpenNewChatModal()}
            className={clsx(
              "rounded-md text-text-muted hover:bg-surface-hover/70 hover:text-[#1565C0]",
              "h-[var(--control-height-md)] w-[var(--control-height-md)]",
            )}
            aria-label={t("sidebar:header.composeLabel")}
          >
            <CreateGroupIcon className="h-[18px] w-[18px]" />
          </IconButtonSurface>

        </div>
      </div>
    </div>
  );
};

export default SidebarHeader;
