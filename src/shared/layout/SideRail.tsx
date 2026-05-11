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
} from "@heroicons/react/24/outline";
import type { UserSummary } from "../../types";
import { ROUTE_PATHS } from "../../router/paths";
import { useUIStore } from "../../stores";
import { emitOpenNewChatModal } from "../../lib/commandPalette";
import ContactsAddressBookOutlineIcon from "./ContactsAddressBookOutlineIcon";
import CreateGroupIcon from "./CreateGroupIcon";

type SideRailItem = {
  id: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
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
    icon: ContactsAddressBookOutlineIcon,
    to: ROUTE_PATHS.FRIENDS,
    activeWhen: (pathname) =>
      pathname === ROUTE_PATHS.FRIENDS ||
      pathname.startsWith("/friend-discovery/"),
  },
  { id: "tasks", label: "Công việc", icon: BriefcaseIcon, to: ROUTE_PATHS.TASKS },
  { id: "calendar", label: "Lịch", icon: CalendarDaysIcon, to: ROUTE_PATHS.CALENDAR },
  { id: "archive", label: "Lưu trữ", icon: FolderIcon, to: ROUTE_PATHS.ARCHIVE },
  { id: "notifications", label: "Thông báo", icon: BellIcon, to: ROUTE_PATHS.NOTIFICATIONS },
];

const bottomItems: SideRailItem[] = [
  { id: "help", label: "Trợ giúp", icon: QuestionMarkCircleIcon, to: ROUTE_PATHS.HELP },
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
  onClick?: () => void;
}> = ({ item, isActive = false, onClick }) => {
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
      onClick={onClick || item.onClick}
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
  const openModal = useUIStore((state) => state.openModal);

  const mainRailItems: SideRailItem[] = [
    ...railItems.slice(0, 1),
    {
      id: "new-chat",
      label: "Tạo mới",
      icon: CreateGroupIcon,
      onClick: () => emitOpenNewChatModal(),
    },
    ...railItems.slice(1),
  ];

  return (
    <aside className="hc-side-rail" aria-label="Điều hướng chính">
      <NavLink
        to={ROUTE_PATHS.CHAT}
        className="hc-side-rail__logo"
        aria-label="Hacom Chat"
        title="Hacom Chat"
      >
        <img
          src="/logo-dung.png"
          alt="Hacom Holdings"
          className="h-full w-full object-contain mix-blend-multiply"
        />
      </NavLink>

      <nav className="hc-side-rail__nav" aria-label="Module">
        {mainRailItems.map((item) => (
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
