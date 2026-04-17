import React, { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftOnRectangleIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "../../common/Avatar";
import { IconButtonSurface } from "../../ui";
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
}) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const isDense = layoutState !== "normal";

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
    <div
      className={clsx(
        "border-b border-border/60",
        isDense ? "px-3 pb-3 pt-3" : "px-4 pb-4 pt-4",
      )}
    >
      <div className={clsx("flex items-start", isDense ? "gap-2.5" : "gap-3")}>
        <button
          type="button"
          onClick={onCurrentUserClick}
          className={clsx(
            "flex min-w-0 flex-1 items-center rounded-[1.2rem] text-left transition-micro hover:bg-surface-hover/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
            isDense ? "gap-2.5 px-1.5 py-1" : "gap-3 px-2 py-1.5",
          )}
          aria-label={currentUserName}
        >
          <Avatar
            src={currentUser.avatar}
            alt={currentUserName}
            size={isDense ? "md" : "lg"}
            status={currentUser.status}
            showStatus
          />

          <div className="min-w-0">
            <p
              className={clsx(
                "truncate font-semibold text-text-primary",
                isDense ? "text-[13px] leading-[1.1rem]" : "text-sm",
              )}
            >
              {currentUserName}
            </p>
            <p
              className={clsx(
                "truncate text-text-muted",
                isDense ? "text-[11px] leading-4" : "text-caption",
              )}
            >
              {currentStatusLabel}
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
              "rounded-[1rem] bg-primary text-text-inverse shadow-xs hover:bg-primary-hover hover:text-text-inverse",
              isDense ? "h-10 w-10" : "h-11 w-11",
            )}
            aria-label={t("sidebar:header.startNewChat")}
          >
            <PencilSquareIcon className="h-5 w-5" />
          </IconButtonSurface>

          <IconButtonSurface
            onClick={onFocusSearch}
            className={clsx("rounded-[1rem]", isDense ? "h-9 w-9" : "h-10 w-10")}
            aria-label={t("sidebar:search.aria")}
          >
            <MagnifyingGlassIcon
              className={isDense ? "h-[18px] w-[18px]" : "h-5 w-5"}
            />
          </IconButtonSurface>

          <IconButtonSurface
            onClick={() => setIsMenuOpen((current) => !current)}
            className={clsx("rounded-[1rem]", isDense ? "h-9 w-9" : "h-10 w-10")}
            aria-label={t("common:actions.more", {
              defaultValue: "More actions",
            })}
          >
            <EllipsisHorizontalIcon
              className={isDense ? "h-[18px] w-[18px]" : "h-5 w-5"}
            />
          </IconButtonSurface>

          {isMenuOpen && (
            <div
              className={clsx(
                "absolute right-0 top-[calc(100%+0.5rem)] z-[70] min-w-[13rem] overflow-hidden rounded-[1.25rem] border border-border/80 bg-surface p-1.5 shadow-elev3",
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
                  onOpenFriends?.();
                }}
                role="menuitem"
              >
                <UserGroupIcon className="h-5 w-5" />
                <span>{t("friends:title", { defaultValue: "Friends" })}</span>
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
