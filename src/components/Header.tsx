import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Button, Space, Tag } from 'antd';
import { memo } from 'react';

import type { CurrentAdmin } from '@/api/types';
import { SearchTrigger } from '@/components/SearchTrigger';
import { UserMenu } from '@/components/UserMenu';

interface HeaderProps {
  collapsed: boolean;
  environment: string;
  envColor: string;
  isAuthServiceUnavailable: boolean;
  user: CurrentAdmin | null;
  onToggleSidebar: () => void;
  onOpenPalette: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const Header = memo(
  ({
    collapsed,
    environment,
    envColor,
    isAuthServiceUnavailable,
    user,
    onToggleSidebar,
    onOpenPalette,
    onOpenProfile,
    onOpenSettings,
    onLogout,
  }: HeaderProps) => {
    return (
      <div className="app-header-grid">
        <div className="app-header-zone app-header-zone-left">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          />
        </div>

        <div className="app-header-zone app-header-zone-center">
          <SearchTrigger onOpen={onOpenPalette} />
        </div>

        <div className="app-header-zone app-header-zone-right">
          <Space size={8} className="app-header-status" wrap>
            <Tag color={envColor}>{environment}</Tag>
            <Tag color={isAuthServiceUnavailable ? 'gold' : 'green'}>
              {isAuthServiceUnavailable ? 'DEGRADED' : 'HEALTHY'}
            </Tag>
          </Space>
          <UserMenu
            user={user}
            onOpenProfile={onOpenProfile}
            onOpenSettings={onOpenSettings}
            onLogout={onLogout}
          />
        </div>
      </div>
    );
  },
);

Header.displayName = 'Header';
