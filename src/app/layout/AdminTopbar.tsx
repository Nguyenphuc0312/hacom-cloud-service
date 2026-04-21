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
  mobile?: boolean;
  mobileNavOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  mobile = false,
  mobileNavOpen = false,
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
        id: 'quick-open-users',
        label: 'Mở quản trị tài khoản',
        description: 'Đi tới danh sách tài khoản để tra cứu hoặc thao tác',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-users')?.icon,
        keywords: ['users', 'accounts', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-open-email-templates',
        label: 'Mở mẫu email',
        description: 'Đi tới khu mẫu email để chuẩn bị thông báo',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-email-templates')?.icon,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/settings/email-templates'),
      },
      {
        id: 'quick-open-conversations',
        label: 'Mở tra cứu hội thoại',
        description: 'Đọc lịch sử chat và xử lý moderation',
        category: 'Điều hướng' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-conversations')?.icon,
        keywords: ['chat', 'conversation', 'support'],
        onSelect: () => navigate('/conversations'),
      },
      {
        id: 'quick-open-hr',
        label: 'Mở nhân sự',
        description: 'Đi tới hồ sơ nhân sự để đối chiếu và cấp tài khoản',
        category: 'Tác vụ nhanh' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-hr-employees')?.icon,
        keywords: ['hr', 'employees', 'directory'],
        onSelect: () => navigate('/hr-employees'),
      },
    ],
    [currentRole, navigate],
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
            aria-label={mobileNavOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
            aria-expanded={mobileNavOpen}
            aria-controls="app-sidebar"
            onClick={onToggleSidebar}
            disabled={!mobile}
          >
            {mobileNavOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
          </button>
          <div className="ds-topbar-title-block">
            <span className="ds-topbar-eyebrow">{currentPage.sectionLabel || 'Không gian làm việc'}</span>
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
            onOpenSettings={() => navigate('/settings/smtp')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
