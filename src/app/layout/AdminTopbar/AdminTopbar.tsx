import { App } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCurrentUser } from '@/app/useCurrentUser/useCurrentUser';
import {
  getConnectionStatus,
  onConnectionStatusChange,
  type ConnectionStatus,
} from '@/api/axios/axios';
import { AppIcon } from '@/components/AppIcon/AppIcon';
import { CommandPalette } from '@/components/CommandPalette/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette/useCommandPalette';
import { useAuthStore } from '@/store/authStore/authStore';
import { hasSomeRole } from '@/utils/role/role';
import { getEnvironmentDisplayConfig } from '@/config/environment';
import { TopbarActions } from '../TopbarActions/TopbarActions';
import { TopbarSearch } from '../TopbarSearch/TopbarSearch';
import { commandRouteItems, resolveNavigationContext } from '../navigationConfig/navigationConfig';

import './AdminTopbar-01.css';
import './AdminTopbar-02.css';
interface AdminTopbarProps {
  mobile?: boolean;
  mobileNavOpen?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const ConnectionStatusIndicator: React.FC<{ status: ConnectionStatus }> = ({ status }) => {
  const statusConfig: Record<ConnectionStatus, { color: string; label: string; icon: 'check' | 'refresh' | 'wifiOff' | 'alertCircle' }> = {
    connected: { color: 'var(--color-success)', label: 'Kết nối', icon: 'check' },
    connecting: { color: 'var(--color-warning)', label: 'Đang kết nối', icon: 'refresh' },
    disconnected: { color: 'var(--color-muted)', label: 'Mất kết nối', icon: 'wifiOff' },
    error: { color: 'var(--color-danger)', label: 'Lỗi kết nối', icon: 'alertCircle' },
  };

  const config = statusConfig[status];

  return (
    <div
      className="connection-status-indicator"
      title={config.label}
      aria-label={`Trạng thái kết nối: ${config.label}`}
    >
      <span
        className="connection-status-dot"
        style={{ backgroundColor: config.color }}
        aria-hidden
      />
      <AppIcon name={config.icon} size={14} aria-hidden />
    </div>
  );
};

const EnvironmentBadge: React.FC = () => {
  const envConfig = getEnvironmentDisplayConfig();

  // Only show for non-production environments
  if (envConfig.value === 'production') {
    return null;
  }

  return (
    <div
      className="environment-badge"
      style={{
        backgroundColor: envConfig.bgColor,
        color: envConfig.color,
        borderColor: envConfig.color,
      }}
      aria-label={`Môi trường: ${envConfig.label}`}
    >
      <span className="environment-badge-dot" style={{ backgroundColor: envConfig.color }} />
      <span className="environment-badge-label">{envConfig.label}</span>
    </div>
  );
};

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
  const { user } = useCurrentUser();
  const { isOpen, openPalette, closePalette } = useCommandPalette();
  const currentPage = resolveNavigationContext(location.pathname);

  // Connection status state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(getConnectionStatus());

  useEffect(() => {
    const unsubscribe = onConnectionStatusChange((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubscribe();
    };
  }, []);

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
        label: 'Mở người dùng',
        description: 'Mở quản lý tài khoản để tìm kiếm và thao tác vận hành.',
        category: 'Thao tác nhanh' as const,
        icon: <AppIcon name="users" size={16} aria-hidden />,
        keywords: ['users', 'accounts', 'admin'],
        onSelect: () => navigate('/users'),
      },
      {
        id: 'quick-open-email-templates',
        label: 'Mở mẫu email',
        description: 'Mở mẫu email hệ thống.',
        category: 'Thao tác nhanh' as const,
        icon: <AppIcon name="fileStack" size={16} aria-hidden />,
        keywords: ['broadcast', 'announcement', 'message'],
        onSelect: () => navigate('/settings/email-templates'),
      },
      {
        id: 'quick-open-conversations',
        label: 'Mở hội thoại',
        description: 'Kiểm tra bản ghi hội thoại phục vụ admin.',
        category: 'Điều hướng' as const,
        icon: <AppIcon name="messages" size={16} aria-hidden />,
        keywords: ['chat', 'conversation', 'support'],
        onSelect: () => navigate('/conversations'),
      },
      {
        id: 'quick-open-hr',
        label: 'Mở nhân sự HR',
        description: 'Rà soát hồ sơ HR và tài khoản liên kết.',
        category: 'Thao tác nhanh' as const,
        icon: <AppIcon name="hr" size={16} aria-hidden />,
        keywords: ['hr', 'employees', 'directory'],
        onSelect: () => navigate('/hr-employees'),
      },
      {
        id: 'quick-open-alerts',
        label: 'Mở Cảnh báo',
        description: 'Xem danh sách cảnh báo và sự cố.',
        category: 'Thao tác nhanh' as const,
        icon: <AppIcon name="alert" size={16} aria-hidden />,
        keywords: ['alerts', 'incidents', 'warnings'],
        onSelect: () => navigate('/alerts'),
      },
      {
        id: 'quick-open-realtime',
        label: 'Mở Dashboard Realtime',
        description: 'Theo dõi KPIs realtime của hệ thống.',
        category: 'Thao tác nhanh' as const,
        icon: <AppIcon name="activity" size={16} aria-hidden />,
        keywords: ['realtime', 'dashboard', 'live', 'online'],
        onSelect: () => navigate('/realtime'),
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
            <span className="ds-topbar-eyebrow">{currentPage.sectionLabel}</span>
            <strong className="ds-topbar-page-title">Admin Console</strong>
          </div>
        </div>

        <div className="ds-admin-topbar-center">
          <TopbarSearch onOpen={openPalette} />
        </div>

        <div className="ds-admin-topbar-right">
          {/* Environment Badge */}
          <EnvironmentBadge />

          {/* Connection Status Indicator */}
          <div className="ds-topbar-connection-status">
            <ConnectionStatusIndicator status={connectionStatus} />
          </div>

          <TopbarActions
            user={user}
            onOpenNotifications={() => message.info('Trung tâm thông báo chưa được kết nối.')}
            onOpenProfile={() => navigate('/profile')}
            onOpenSettings={() => navigate('/settings/system')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      <CommandPalette open={isOpen} onClose={closePalette} items={paletteItems} />
    </>
  );
};
