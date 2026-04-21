import { App } from 'antd';
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCurrentUser } from '@/app/useCurrentUser';
import { AppIcon } from '@/components/AppIcon';
import { CommandPalette } from '@/components/CommandPalette';
import { appConfig } from '@/config/appConfig';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useAuthStore } from '@/store/authStore';
import { hasSomeRole } from '@/utils/role';
import { TopbarActions } from './TopbarActions';
import { TopbarSearch } from './TopbarSearch';
import { commandRouteItems, resolveNavigationContext } from './navigationConfig';

interface AdminTopbarProps {
  mobile?: boolean;
  mobileNavOpen?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const AdminTopbar: React.FC<AdminTopbarProps> = ({
  mobile = false,
  mobileNavOpen = false,
  sidebarCollapsed = false,
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
          icon: <AppIcon name={item.iconKey} size={16} aria-hidden />,
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
        icon: <AppIcon name="users" size={16} aria-hidden />,
        keywords: ['users', 'accounts', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-open-email-templates',
        label: 'Mở mẫu email',
        description: 'Đi tới khu mẫu email để chuẩn bị thông báo',
        category: 'Tác vụ nhanh' as const,
        icon: <AppIcon name="fileStack" size={16} aria-hidden />,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/settings/email-templates'),
      },
      {
        id: 'quick-open-conversations',
        label: 'Mở tra cứu hội thoại',
        description: 'Đọc lịch sử chat và xử lý moderation',
        category: 'Điều hướng' as const,
        icon: <AppIcon name="messages" size={16} aria-hidden />,
        keywords: ['chat', 'conversation', 'support'],
        onSelect: () => navigate('/conversations'),
      },
      {
        id: 'quick-open-hr',
        label: 'Mở nhân sự',
        description: 'Đi tới hồ sơ nhân sự để đối chiếu và cấp tài khoản',
        category: 'Tác vụ nhanh' as const,
        icon: <AppIcon name="hr" size={16} aria-hidden />,
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

  const sidebarToggleLabel = mobile
    ? mobileNavOpen
      ? 'Đóng điều hướng'
      : 'Mở điều hướng'
    : sidebarCollapsed
      ? 'Mở rộng điều hướng'
      : 'Thu gọn điều hướng';

  return (
    <>
      <header className="ds-admin-topbar" role="banner">
        <div className="ds-admin-topbar-left">
          <button
            type="button"
            className="ds-topbar-toggle ds-btn ds-btn--icon"
            aria-label={sidebarToggleLabel}
            aria-expanded={mobile ? mobileNavOpen : !sidebarCollapsed}
            aria-controls="app-sidebar"
            onClick={onToggleSidebar}
          >
            <AppIcon name="menu" size={18} aria-hidden />
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
            onOpenSettings={() => navigate('/settings/system')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
