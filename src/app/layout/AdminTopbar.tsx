import React, { useMemo } from 'react';
import { App } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCurrentUser } from '@/app/useCurrentUser';
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
  const paletteItems = useMemo(
    () =>
      commandRouteItems.map((item) => ({
        ...item,
        onSelect: () => {
          if (item.route) {
            navigate(item.route);
          }
        },
      })),
    [navigate],
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
            aria-label={collapsed ? 'Mở thanh bên' : 'Thu nhỏ thanh bên'}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={onToggleSidebar}
          >
            <span className="ds-icon">{collapsed ? '☰' : '≡'}</span>
          </button>
          <div className="ds-topbar-title-block">
            <span className="ds-topbar-eyebrow">
              {currentPage.sectionLabel} · {currentPage.sectionDescription}
            </span>
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
            systemTone={isAuthServiceUnavailable ? 'degraded' : 'healthy'}
            onOpenNotifications={() => message.info('Notifications center is not wired yet.')}
            onOpenQuickAction={openPalette}
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
