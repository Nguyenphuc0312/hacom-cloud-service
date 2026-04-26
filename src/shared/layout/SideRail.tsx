import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  BellIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  FolderIcon,
  QuestionMarkCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { UserSummary } from "../../types";
import { ROUTE_PATHS } from "../../router/paths";

type SideRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  to?: string;
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
    label: "Tin nhắn",
    icon: ChatBubbleLeftRightIcon,
    to: ROUTE_PATHS.CHAT,
    activeWhen: (pathname) =>
      pathname === ROUTE_PATHS.CHAT ||
      pathname.startsWith(`${ROUTE_PATHS.CHAT}/`),
  },
  {
    id: "contacts",
    label: "Danh bạ",
    icon: UserGroupIcon,
    to: ROUTE_PATHS.FRIENDS,
    activeWhen: (pathname) =>
      pathname === ROUTE_PATHS.FRIENDS ||
      pathname.startsWith("/friend-discovery/"),
  },
  { id: "tasks", label: "Công việc", icon: BriefcaseIcon },
  { id: "calendar", label: "Lịch", icon: CalendarDaysIcon },
  { id: "archive", label: "Lưu trữ", icon: FolderIcon },
  { id: "notifications", label: "Thông báo", icon: BellIcon },
];

const bottomItems: SideRailItem[] = [
  { id: "help", label: "Trợ giúp", icon: QuestionMarkCircleIcon },
  {
    id: "settings",
    label: "Cài đặt",
    icon: Cog6ToothIcon,
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
  const [imageFailed, setImageFailed] = React.useState(false);
  const avatarSrc =
    typeof currentUser?.avatar === "string" && currentUser.avatar.trim()
      ? currentUser.avatar.trim()
      : "";

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarSrc]);

  return (
    <button
      type="button"
      className="hc-side-rail__avatar"
      onClick={onCurrentUserClick}
      aria-label="Hồ sơ cá nhân"
      title={currentUser?.displayName || currentUser?.username || "Hồ sơ"}
    >
      {avatarSrc && !imageFailed ? (
        <img
          src={avatarSrc}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{getInitial(currentUser)}</span>
      )}
    </button>
  );
};

const SideRailButton: React.FC<{
  item: SideRailItem;
  isActive?: boolean;
}> = ({ item, isActive = false }) => {
  const Icon = item.icon;
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
        aria-label={item.label}
        title={item.label}
      >
        {({ isActive: routeActive }) => (
          <>
            {renderIndicator(routeActive || isActive)}
            <Icon className="hc-side-rail__item-icon" aria-hidden="true" />
          </>
        )}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      className={getItemClassName(isActive)}
      aria-label={item.label}
      title={item.label}
    >
      {renderIndicator(isActive)}
      <Icon className="hc-side-rail__item-icon" aria-hidden="true" />
    </button>
  );
};

export const SideRail: React.FC<SideRailProps> = ({
  currentUser,
  activeModule,
  onCurrentUserClick,
}) => {
  const { pathname } = useLocation();

  return (
    <aside className="hc-side-rail" aria-label="Điều hướng chính">
      <NavLink
        to={ROUTE_PATHS.CHAT}
        className="hc-side-rail__logo"
        aria-label="Hacom Chat"
        title="Hacom Chat"
      >
        H
      </NavLink>

      <nav className="hc-side-rail__nav" aria-label="Module">
        {railItems.map((item) => (
          <SideRailButton
            key={item.id}
            item={item}
            isActive={
              activeModule === item.id || Boolean(item.activeWhen?.(pathname))
            }
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
