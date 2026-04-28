import { Avatar, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';

import type { CurrentAdmin } from '@/api/types/auth/auth';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { toDisplayRole } from '@/utils/role/role';

import './../Header/Header.css';
interface HeaderUserMenuProps {
  user: CurrentAdmin | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onChangePassword?: () => void;
}

const normalizeDisplayName = (user: CurrentAdmin | null): string => {
  const fallback = user?.email?.split('@')[0] ?? 'Admin';
  const source =
    user?.fullName?.trim() ||
    user?.displayName?.trim() ||
    user?.username?.trim() ||
    fallback;
  return source.length > 16 ? `${source.slice(0, 15)}...` : source;
};

export const HeaderUserMenu = ({
  user,
  onOpenProfile,
  onOpenSettings,
  onLogout,
  onChangePassword,
}: HeaderUserMenuProps) => {
  const displayName = normalizeDisplayName(user);
  const roleLabel = toDisplayRole(user?.role).replace('_', ' ');
  const avatarText = (user?.fullName ?? user?.displayName ?? user?.username ?? user?.email ?? 'A')
    .charAt(0)
    .toUpperCase();

  const menuItems = useMemo<NonNullable<MenuProps['items']>>(
    () => [
      {
        key: 'profile',
        icon: <AppIcon name="user" size={14} />,
        label: 'Hồ sơ của tôi',
        onClick: onOpenProfile,
      },
      {
        key: 'settings',
        icon: <AppIcon name="settings" size={14} />,
        label: 'Cài đặt',
        onClick: onOpenSettings,
      },
      {
        key: 'change-password',
        icon: <AppIcon name="lock" size={14} />,
        label: 'Đổi mật khẩu',
        disabled: !onChangePassword,
        onClick: onChangePassword,
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <AppIcon name="logout" size={14} />,
        label: 'Đăng xuất',
        danger: true,
        onClick: onLogout,
      },
    ],
    [onChangePassword, onLogout, onOpenProfile, onOpenSettings],
  );

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="header-user-dropdown"
      menu={{ items: menuItems }}
    >
      <Button className="header-user-menu-trigger" aria-label="Mở menu người dùng">
        <Avatar size={30} className="header-user-avatar">
          {avatarText}
        </Avatar>
        <span className="header-user-menu-text" aria-hidden>
          <span className="header-user-menu-name">{displayName}</span>
          <span className="header-user-menu-role">{roleLabel}</span>
        </span>
        <AppIcon name="chevronDown" size={14} className="header-user-menu-caret" />
      </Button>
    </Dropdown>
  );
};
