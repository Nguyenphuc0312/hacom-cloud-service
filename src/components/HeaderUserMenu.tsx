import {
  DownOutlined,
  LockOutlined,
  LogoutOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';

import type { CurrentAdmin } from '@/api/types';
import { toDisplayRole } from '@/utils/role';

interface HeaderUserMenuProps {
  user: CurrentAdmin | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onChangePassword?: () => void;
}

const normalizeDisplayName = (user: CurrentAdmin | null): string => {
  const fallback = user?.email?.split('@')[0] ?? 'Admin';
  const source = user?.username?.trim() || fallback;
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
  const avatarText = (user?.username ?? user?.email ?? 'A').charAt(0).toUpperCase();

  const menuItems = useMemo<NonNullable<MenuProps['items']>>(
    () => [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'My Profile',
        onClick: onOpenProfile,
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Settings',
        onClick: onOpenSettings,
      },
      {
        key: 'change-password',
        icon: <LockOutlined />,
        label: 'Change password',
        disabled: !onChangePassword,
        onClick: onChangePassword,
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Logout',
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
      <Button className="header-user-menu-trigger" aria-label="Open user menu">
        <Avatar size={30} className="header-user-avatar">
          {avatarText}
        </Avatar>
        <span className="header-user-menu-text" aria-hidden>
          <span className="header-user-menu-name">{displayName}</span>
          <span className="header-user-menu-role">{roleLabel}</span>
        </span>
        <DownOutlined className="header-user-menu-caret" />
      </Button>
    </Dropdown>
  );
};
