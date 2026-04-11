import { DownOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { memo, useMemo } from 'react';

import type { CurrentAdmin } from '@/api/types';
import { toDisplayRole } from '@/utils/role';

interface UserMenuProps {
  user: CurrentAdmin | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const normalizeUsername = (user: CurrentAdmin | null): string => {
  const fallback = user?.email?.split('@')[0] ?? 'admin';
  const source = user?.username?.trim() || fallback;
  return source.length > 16 ? source.slice(0, 16) + '...' : source;
};

const normalizeRoleLabel = (user: CurrentAdmin | null): string => {
  return toDisplayRole(user?.role).replace('_', ' ').toUpperCase();
};

export const UserMenu = memo(({ user, onOpenProfile, onOpenSettings, onLogout }: UserMenuProps) => {
  const username = normalizeUsername(user);
  const roleLabel = normalizeRoleLabel(user);
  const avatarText = username.charAt(0).toUpperCase();

  const menuItems = useMemo<NonNullable<MenuProps['items']>>(
    () => [
      {
        key: 'identity',
        disabled: true,
        label: (
          <div className="user-menu-identity">
            <div className="user-menu-identity-name">{username}</div>
            <div className="user-menu-identity-role">{roleLabel}</div>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: 'Profile',
        onClick: onOpenProfile,
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Settings',
        onClick: onOpenSettings,
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
    [onLogout, onOpenProfile, onOpenSettings, roleLabel, username],
  );

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      overlayClassName="user-menu-dropdown"
      menu={{ items: menuItems }}
    >
      <Button className="user-menu-trigger" aria-label="Open user menu">
        <Avatar size={30} className="user-menu-avatar">
          {avatarText}
        </Avatar>
        <span className="user-menu-name" aria-hidden>
          {username}
        </span>
        <DownOutlined className="user-menu-caret" />
      </Button>
    </Dropdown>
  );
});

UserMenu.displayName = 'UserMenu';
