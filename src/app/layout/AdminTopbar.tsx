import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { App } from 'antd';
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCurrentUser } from '@/app/useCurrentUser';
import { appConfig } from '@/config/appConfig';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useAuthStore } from '@/store/authStore';
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
  const { user, isAuthServiceUnavailable } = useCurrentUser();
  const { isOpen, openPalette, closePalette } = useCommandPalette();

  const currentPage = resolveNavigationContext(location.pathname);
  const breadcrumbTrail = currentPage.breadcrumbs.map((entry) => entry.label).join(' / ');

  const quickActions = useMemo(
    () => [
      {
        key: 'create-user',
        label: 'Create user',
        onSelect: () => navigate('/users'),
      },
      {
        key: 'send-broadcast',
        label: 'Send broadcast',
        onSelect: () => navigate('/services/email-templates'),
      },
      {
        key: 'create-group',
        label: 'Create group',
        onSelect: () => {
          message.info('Group creation workflow is not wired yet. Opening users workspace.');
          navigate('/users');
        },
      },
    ],
    [message, navigate],
  );

  const paletteItems = useMemo(
    () => [
      ...commandRouteItems.map((item) => ({
        ...item,
        onSelect: () => {
          if (item.route) {
            navigate(item.route);
          }
        },
      })),
      {
        id: 'quick-create-user',
        label: 'Create User',
        description: 'Jump to user management and open the create workflow',
        category: 'Quick Actions' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-users')?.icon,
        keywords: ['create', 'user', 'invite', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-send-broadcast',
        label: 'Send Broadcast',
        description: 'Open messaging templates for broadcast preparation',
        category: 'Quick Actions' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-email-templates')?.icon,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/services/email-templates'),
      },
      {
        id: 'quick-create-group',
        label: 'Create Group',
        description: 'Stage the future group-management workflow from the users workspace',
        category: 'Quick Actions' as const,
        icon: commandRouteItems.find((item) => item.id === 'go-users')?.icon,
        keywords: ['group', 'team', 'segment'],
        onSelect: () => {
          message.info('Group creation workflow is not wired yet. Opening users workspace.');
          navigate('/users');
        },
      },
    ],
    [message, navigate],
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
            aria-label={collapsed ? 'Open navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={onToggleSidebar}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
          <div className="ds-topbar-title-block">
            <span className="ds-topbar-eyebrow">{breadcrumbTrail || currentPage.sectionLabel}</span>
            <strong className="ds-topbar-page-title">{currentPage.title}</strong>
            <span className="ds-topbar-page-description">{currentPage.description}</span>
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
            liveUpdatesLabel={appConfig.liveUpdatesLabel}
            liveUpdatesMode={appConfig.liveUpdatesMode}
            quickActions={quickActions}
            onOpenNotifications={() => message.info('Notifications center is not wired yet.')}
            onOpenProfile={() => message.info('Profile panel is not available yet.')}
            onOpenSettings={() => navigate('/services/smtp')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
