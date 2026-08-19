import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
  BriefcaseIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import {
  BriefcaseIcon as BriefcaseSolid,
  CalendarDaysIcon as CalendarDaysSolid,
  ChatBubbleLeftRightIcon as ChatBubbleSolid,
  Cog6ToothIcon as Cog6ToothSolid,
  SparklesIcon as SparklesSolid,
} from "@heroicons/react/24/solid";
import { Contact, HandHelping } from "lucide-react";
import type { UserSummary } from "../../types";
import { ROUTE_PATHS } from "../../router/paths";
import { useChatStore } from "../../stores";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { useReminderStore } from "../../stores/reminderStore";
import { useChatUiStore } from "../../features/chat/state/chatUiStore";
import { useHrUnreadCount } from "../../features/calendar/useHrUnreadCount";
import { SafeImage } from "../../components/common/SafeImage";

type SideRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>> | React.ComponentType<object>;
  iconActive?: React.ComponentType<React.SVGProps<SVGSVGElement>> | React.ComponentType<object>;
  to?: string;
  onClick?: () => void;
  activeWhen?: (pathname: string) => boolean;
};

interface SideRailProps {
  currentUser?: Pick<UserSummary, "displayName" | "username" | "avatar"> | null;
  activeModule?: string;
  onCurrentUserClick?: () => void;
}

const railItems: SideRailItem[] = [
  {
    id: "messages",
    label: "sidebar:rail.messages",
    icon: ChatBubbleLeftRightIcon,
    iconActive: ChatBubbleSolid,
    to: ROUTE_PATHS.CHAT,
    activeWhen: (pathname) =>
      pathname === ROUTE_PATHS.CHAT ||
      pathname.startsWith(`${ROUTE_PATHS.CHAT}/`) ||
      pathname === ROUTE_PATHS.CLOUD ||
      pathname === ROUTE_PATHS.CLOUD_MANAGE,
  },
  {
    id: "contacts",
    label: "sidebar:rail.contacts",
    icon: () => <Contact size={22} color="currentColor" strokeWidth={1.8} />,
    to: ROUTE_PATHS.FRIENDS,
    activeWhen: (pathname) =>
      pathname === ROUTE_PATHS.FRIENDS ||
      pathname.startsWith("/friend-discovery/"),
  },
  { id: "tasks", label: "sidebar:rail.tasks", icon: BriefcaseIcon, iconActive: BriefcaseSolid, to: ROUTE_PATHS.TASKS },
  { id: "calendar", label: "sidebar:rail.calendar", icon: CalendarDaysIcon, iconActive: CalendarDaysSolid, to: ROUTE_PATHS.CALENDAR },
  { id: "ai-assistant", label: "sidebar:rail.aiAssistant", icon: SparklesIcon, iconActive: SparklesSolid, to: ROUTE_PATHS.AI_ASSISTANT },
];

const bottomItems: SideRailItem[] = [
  { id: "help", label: "sidebar:rail.help", icon: () => <HandHelping size={22} color="currentColor" strokeWidth={1.8} />, to: ROUTE_PATHS.HELP },
  {
    id: "settings",
    label: "sidebar:rail.settings",
    icon: Cog6ToothIcon,
    iconActive: Cog6ToothSolid,
    to: ROUTE_PATHS.SETTINGS,
    activeWhen: (pathname) => pathname === ROUTE_PATHS.SETTINGS,
  },
];

const getInitial = (
  user?: Pick<UserSummary, "displayName" | "username"> | null,
) => {
  const source = user?.displayName || user?.username || "H";
  return source.trim().slice(0, 1).toUpperCase() || "H";
};

const SideRailAvatar: React.FC<{
  currentUser?: Pick<UserSummary, "displayName" | "username" | "avatar"> | null;
  onCurrentUserClick?: () => void;
}> = ({ currentUser, onCurrentUserClick }) => {
  const { t } = useTranslation();
  const avatarSrc =
    typeof currentUser?.avatar === "string" && currentUser.avatar.trim()
      ? currentUser.avatar.trim()
      : "";
  const fallback = <span>{getInitial(currentUser)}</span>;

  return (
    <button
      type="button"
      className="hc-side-rail__avatar"
      onClick={onCurrentUserClick}
      aria-label={t("sidebar:rail.profile")}
      title={currentUser?.displayName || currentUser?.username || t("sidebar:rail.profile")}
    >
      <SafeImage
        src={avatarSrc}
        alt=""
        className="h-full w-full object-cover"
        fallback={fallback}
      />
    </button>
  );
};

const BadgeCount: React.FC<{ count: number }> = ({ count }) => {
  if (count <= 0) return null;
  return (
    <span className="hc-side-rail__badge" aria-hidden="true">
      {count > 99 ? "99+" : count}
    </span>
  );
};

const SideRailButton: React.FC<{
  item: SideRailItem;
  isActive?: boolean;
  badge?: number;
  onClick?: () => void;
}> = ({ item, isActive = false, badge, onClick }) => {
  const { t } = useTranslation();
  const Icon = (isActive && item.iconActive) ? item.iconActive : item.icon;
  const translatedLabel = t(item.label);
  const badgeCount = badge ?? 0;
  const labelWithBadge =
    badgeCount > 0
      ? `${translatedLabel} (${badgeCount > 99 ? "99+" : badgeCount})`
      : translatedLabel;
  const getItemClassName = (active: boolean) =>
    clsx("hc-side-rail__item", active && "hc-side-rail__item--active");
  const renderIndicator = (active: boolean) => (
    <span
      className={clsx(
        "hc-side-rail__item-indicator",
        active ? "opacity-100" : "opacity-0",
      )}
      aria-hidden="true"
    />
  );
  if (item.to) {
    return (
      <NavLink
        to={item.to}
        className={({ isActive: routeActive }) =>
          getItemClassName(routeActive || isActive)
        }
        aria-label={labelWithBadge}
        title={labelWithBadge}
        onClick={onClick}
      >
        {({ isActive: routeActive }) => {
          const active = routeActive || isActive;
          const ActiveIcon = active && item.iconActive ? item.iconActive : item.icon;
          return (
            <>
              {renderIndicator(active)}
              <ActiveIcon className="hc-side-rail__item-icon" aria-hidden="true" />
              <BadgeCount count={badgeCount} />
            </>
          );
        }}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      className={getItemClassName(isActive)}
      aria-label={labelWithBadge}
      title={labelWithBadge}
      onClick={onClick || item.onClick}
    >
      {renderIndicator(isActive)}
      <Icon className="hc-side-rail__item-icon" aria-hidden="true" />
      <BadgeCount count={badgeCount} />
    </button>
  );
};

export const SideRail: React.FC<SideRailProps> = ({
  currentUser,
  activeModule,
  onCurrentUserClick,
}) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const messagesUnreadCount = useChatStore((s) => s.totalUnreadCount);
  const friendRequestPendingCount = useFriendshipStore(
    (s) => s.pendingCount,
  );
  const hasPendingReminder = useReminderStore((s) => s.hasPendingReminder);
  const activateReminder = useReminderStore((s) => s.activateReminder);
  const setSelectedEndpoint = useChatUiStore((s) => s.setSelectedEndpoint);
  const calendarUnreadCount = useHrUnreadCount();

  const getBadge = (itemId: string): number | undefined => {
    if (itemId === "messages") return messagesUnreadCount;
    if (itemId === "contacts") return friendRequestPendingCount;
    if (itemId === "calendar") return calendarUnreadCount;
    if (itemId === "ai-assistant") return hasPendingReminder ? 1 : undefined;
    return undefined;
  };

  const getClickHandler = (itemId: string): (() => void) | undefined => {
    if (itemId === "ai-assistant") {
      return () => {
        setSelectedEndpoint("personal");
        if (hasPendingReminder) activateReminder();
      };
    }
    return undefined;
  };

  return (
    <aside className="hc-side-rail" aria-label={t("sidebar:rail.navAria")}>
      <NavLink
        to={ROUTE_PATHS.CHAT}
        className="hc-side-rail__logo"
        aria-label={t("sidebar:rail.logoAria")}
        title={t("sidebar:rail.logoAria")}
      >
        <img
          src="/logo-dung.png"
          alt="Hacom Holdings"
          className="h-full w-full object-contain"
        />
      </NavLink>

      <nav className="hc-side-rail__nav" aria-label={t("sidebar:rail.moduleNavAria")}>
        {railItems.map((item) => (
          <SideRailButton
            key={item.id}
            item={item}
            isActive={
              activeModule === item.id || Boolean(item.activeWhen?.(pathname))
            }
            badge={getBadge(item.id)}
            onClick={getClickHandler(item.id)}
          />
        ))}
      </nav>

      <div className="hc-side-rail__bottom">
        {bottomItems.map((item) => (
          <SideRailButton
            key={item.id}
            item={item}
            isActive={
              activeModule === item.id || Boolean(item.activeWhen?.(pathname))
            }
          />
        ))}
        <SideRailAvatar
          currentUser={currentUser}
          onCurrentUserClick={onCurrentUserClick}
        />
      </div>
    </aside>
  );
};

export default SideRail;
