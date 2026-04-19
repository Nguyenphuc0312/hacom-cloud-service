import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { App } from 'antd';
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCurrentUser } from '@/app/useCurrentUser';
import { appConfig } from '@/config/appConfig';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useAuthStore } from '@/store/authStore';
import { hasSomeRole } from '@/utils/role';
import { TopbarActions } from './TopbarActions';
import { TopbarSearch } from './TopbarSearch';
import { commandRouteItems, resolveNavigationContext } from './navigationConfig';

interface AdminTopbarProps {
  collapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  collapsed = false,
  onToggleSidebar,
}) => {
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const currentRole = useAuthStore((state) => state.user?.role);
  const { user, isAuthServiceUnavailable } = useCurrentUser();
  const { isOpen, openPalette, closePalette } = useCommandPalette();

  const currentPage = resolveNavigationContext(location.pathname);
  const breadcrumbTrail = currentPage.breadcrumbs
    .map((entry) => entry.label)
    .filter((label) => label !== currentPage.title)
    .join(' / ');

  const paletteItems = useMemo(
    () => [
      ...commandRouteItems
        .filter((item) => !item.roles || hasSomeRole(currentRole, item.roles))
        .map((item) => ({
          ...item,
          onSelect: () => {
            if (item.route) {
              navigate(item.route);
            }
          },
        })),
      {
        id: 'quick-create-user',
        label: 'Tạo người dùng',
        description: 'Mở khu quản lý người dùng để bắt đầu quy trình tạo tài khoản',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-users')?.icon,
        keywords: ['create', 'user', 'invite', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-send-broadcast',
        label: 'Gửi broadcast',
        description: 'Mở mẫu email để chuẩn bị thông báo hàng loạt',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-email-templates')?.icon,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/services/email-templates'),
      },
      {
        id: 'quick-create-group',
        label: 'Tạo nhóm',
        description: 'Đi tới khu người dùng để chuẩn bị luồng quản lý nhóm',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-users')?.icon,
        keywords: ['group', 'team', 'segment'],
        onSelect: () => {
          message.info('Luồng tạo nhóm chưa được kết nối. Đang mở khu người dùng.');
          navigate('/users');
        },
      },
    ],
    [currentRole, message, navigate],
  );

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="ds-admin-topbar" role="banner">
        <div className="ds-admin-topbar-left">
          <button
            type="button"
            className="ds-topbar-toggle ds-btn ds-btn--icon"
            aria-label={collapsed ? 'Mở điều hướng' : 'Thu gọn điều hướng'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={onToggleSidebar}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <div className="ds-topbar-title-block">
            <span className="ds-topbar-eyebrow">{breadcrumbTrail || 'Không gian làm việc'}</span>
            <strong className="ds-topbar-page-title">{currentPage.title}</strong>
          </div>
        </div>

        <div className="ds-admin-topbar-center">
          <TopbarSearch onOpen={openPalette} />
        </div>

        <div className="ds-admin-topbar-right">
          <TopbarActions
            user={user}
            environmentLabel={appConfig.environmentLabel}
            systemTone={isAuthServiceUnavailable ? 'degraded' : 'healthy'}
            onOpenNotifications={() => message.info('Trung tâm thông báo chưa được kết nối.')}
            onOpenProfile={() => message.info('Khu hồ sơ hiện chưa khả dụng.')}
            onOpenSettings={() => navigate('/services/smtp')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
