import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftOnRectangleIcon,
  BellIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import ContactsAddressBookOutlineIcon from "../../../shared/layout/ContactsAddressBookOutlineIcon";
import CreateGroupIcon from "../../../shared/layout/CreateGroupIcon";
import { emitOpenNewChatModal } from "../../../lib/commandPalette";
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
  onCurrentUserClick?: () => void;
  onOpenFriends?: () => void;
  onOpenSettings?: () => void;
  onRequestLogout?: () => void;
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
  onCurrentUserClick,
  onOpenFriends,
  onOpenSettings,
  onRequestLogout,
  onMarkRead,
  onMarkAllRead,
}) => {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const notificationRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({});
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

  React.useLayoutEffect(() => {
    if (!isPanelOpen) return;

    const compute = () => {
      const rect = notificationRef.current?.getBoundingClientRect();
      if (!rect) return;

      const VIEWPORT_PADDING = 12;
      const GAP = 6;
      const MAX_WIDTH = 400;

      const popupWidth = Math.min(MAX_WIDTH, window.innerWidth - 2 * VIEWPORT_PADDING);
      const left = Math.max(VIEWPORT_PADDING, rect.right - popupWidth);

      setPanelStyle({ top: rect.bottom + GAP, left, width: popupWidth });
    };

    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [isPanelOpen]);

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
      if (panelRef.current?.contains(event.target as Node)) return;
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
            onClick={() => emitOpenNewChatModal()}
            className={clsx(
              "rounded-md text-text-muted hover:bg-surface-hover/70 hover:text-text-primary",
              "h-[var(--control-height-md)] w-[var(--control-height-md)]",
            )}
            aria-label="Tạo chat mới"
          >
            <CreateGroupIcon className="h-[18px] w-[18px]" />
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

            {isPanelOpen &&
              typeof document !== "undefined" &&
              createPortal(
                <div
                  ref={panelRef}
                  style={{ position: "fixed", zIndex: 80, ...panelStyle }}
                >
                  <NotificationPanel
                    onMarkRead={onMarkRead}
                    onMarkAllRead={onMarkAllRead}
                  />
                </div>,
                document.body,
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
                <ContactsAddressBookOutlineIcon className="h-5 w-5" />
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
