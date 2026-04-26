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
        label: 'Open Users',
        description: 'Open account management for search and operator actions.',
        category: 'Quick Actions' as const,
        icon: <AppIcon name="users" size={16} aria-hidden />,
        keywords: ['users', 'accounts', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-open-email-templates',
        label: 'Open Email Templates',
        description: 'Open system email templates.',
        category: 'Quick Actions' as const,
        icon: <AppIcon name="fileStack" size={16} aria-hidden />,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/settings/email-templates'),
      },
      {
        id: 'quick-open-conversations',
        label: 'Open Conversations',
        description: 'Inspect admin-facing conversation records.',
        category: 'Navigate' as const,
        icon: <AppIcon name="messages" size={16} aria-hidden />,
        keywords: ['chat', 'conversation', 'support'],
        onSelect: () => navigate('/conversations'),
      },
      {
        id: 'quick-open-hr',
        label: 'Open HR Employees',
        description: 'Review HR records and linked accounts.',
        category: 'Quick Actions' as const,
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
      ? 'Close navigation'
      : 'Open navigation'
    : sidebarCollapsed
      ? 'Expand navigation'
      : 'Collapse navigation';

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
            <span className="ds-topbar-eyebrow">{currentPage.sectionLabel}</span>
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
            onOpenNotifications={() => message.info('Notification center is not connected yet.')}
            onOpenProfile={() => message.info('Profile panel is not available yet.')}
            onOpenSettings={() => navigate('/settings/system')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
