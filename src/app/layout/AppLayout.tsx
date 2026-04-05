import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Breadcrumb, Layout, Menu, Typography } from 'antd';
import type { ItemType } from 'antd/es/menu/interface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  breadcrumbNameMap,
  commandRouteItems,
  navItems,
  pickSelectedMenuKey,
  type NavItem,
} from '@/app/layout/navigationConfig';
import { Header as AdminHeader } from '@/components/Header';
import { LoadingState } from '@/components/QueryStates';
import { CommandPalette, type CommandPaletteItem } from '@/components/CommandPalette';
import { SystemDegradedBanner } from '@/components/SystemDegradedBanner';
import { useCurrentUser } from '@/app/useCurrentUser';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useAuthStore } from '@/store/authStore';

const { Header: AntHeader, Sider, Content } = Layout;
const { Text } = Typography;

export const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isOpen: isCommandPaletteOpen, openPalette, closePalette } = useCommandPalette();

  const clearAuth = useAuthStore((state) => state.clearAuth);
  const {
    user,
    isLoading,
    isAuthServiceUnavailable,
    currentUserErrorMessage,
    retryCurrentUser,
    isRetryingCurrentUser,
  } = useCurrentUser();

  const menuItems = useMemo<ItemType[]>(() => {
    const toChild = (item: NavItem): ItemType => ({
      key: item.key,
      icon: item.icon,
      label: item.label,
    });

    return [
      {
        type: 'group',
        key: 'group-dashboard',
        label: 'Dashboard',
        children: navItems.filter((item) => item.group === 'dashboard').map(toChild),
      },
      {
        type: 'group',
        key: 'group-users',
        label: 'Users',
        children: navItems.filter((item) => item.group === 'users').map(toChild),
      },
      {
        type: 'group',
        key: 'group-services',
        label: 'Services',
        children: navItems.filter((item) => item.group === 'services').map(toChild),
      },
      {
        type: 'group',
        key: 'group-system',
        label: 'System',
        children: navItems.filter((item) => item.group === 'system').map(toChild),
      },
    ];
  }, []);

  const selectedMenu = pickSelectedMenuKey(location.pathname);

  const breadcrumbItems = useMemo(() => {
    const pathSnippets = location.pathname.split('/').filter(Boolean);
    const paths = pathSnippets.map((_, index) => `/${pathSnippets.slice(0, index + 1).join('/')}`);

    const items = [{ title: breadcrumbNameMap['/'] }];

    paths.forEach((path) => {
      if (path !== '/' && breadcrumbNameMap[path]) {
        items.push({ title: breadcrumbNameMap[path] });
      }
    });

    return items;
  }, [location.pathname]);

  const logout = useCallback(() => {
    clearAuth();
    navigate('/login', { replace: true });
  }, [clearAuth, navigate]);

  const openMyProfile = useCallback(() => {
    if (user?.id) {
      navigate(`/users/${user.id}`);
      return;
    }

    navigate('/users');
  }, [navigate, user?.id]);

  const openSettings = useCallback(() => {
    navigate('/services/smtp');
  }, [navigate]);

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(
    () => [
      {
        id: 'open-my-profile',
        label: 'Profile',
        description: 'Open your account details',
        category: 'Settings',
        icon: <UserOutlined />,
        keywords: ['my profile', 'account', 'me'],
        onSelect: openMyProfile,
      },
      ...commandRouteItems.map((item) => ({
        ...item,
        disabled: item.disabled ?? !item.route,
        onSelect: () => {
          if (item.route) {
            navigate(item.route);
          }
        },
      })),
      {
        id: 'logout',
        label: 'Logout',
        description: 'Sign out from current admin session',
        category: 'System',
        icon: <LogoutOutlined />,
        keywords: ['logout', 'sign out', 'exit'],
        onSelect: logout,
      },
    ],
    [logout, navigate, openMyProfile],
  );

  useEffect(() => {
    closePalette();
  }, [closePalette, location.pathname]);

  const environment = (import.meta.env.VITE_APP_ENV ?? 'server-test').toUpperCase();
  const envColor =
    environment === 'PROD' || environment === 'PRODUCTION'
      ? 'red'
      : environment === 'STAGING'
        ? 'gold'
        : 'blue';

  if (isLoading) {
    return <LoadingState tip="Đang khởi tạo phiên làm việc..." />;
  }

  return (
    <Layout className="app-layout">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={260}
        collapsedWidth={80}
        className="app-sider"
        breakpoint="lg"
        onBreakpoint={(broken) => setCollapsed(broken)}
      >
        <div className="brand">{collapsed ? 'CA' : 'Chat Admin Console'}</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenu]}
          items={menuItems}
          aria-label="Main admin navigation"
          onClick={({ key }) => navigate(String(key))}
        />
        <div className="app-sider-footer">
          <Text type="secondary">System context</Text>
          <Text>Environment: {environment}</Text>
          <Text type="secondary">RBAC + release policy enforced</Text>
        </div>
      </Sider>
      <Layout>
        <AntHeader className="app-header">
          <AdminHeader
            collapsed={collapsed}
            environment={environment}
            envColor={envColor}
            isAuthServiceUnavailable={isAuthServiceUnavailable}
            user={user}
            onToggleSidebar={() => setCollapsed((prev) => !prev)}
            onOpenPalette={openPalette}
            onOpenProfile={openMyProfile}
            onOpenSettings={openSettings}
            onLogout={logout}
          />
        </AntHeader>
        <Content className="app-content">
          <SystemDegradedBanner
            visible={isAuthServiceUnavailable}
            title="Admin auth integration degraded"
            description={
              currentUserErrorMessage ?? 'Cannot verify current admin profile right now.'
            }
            onRetry={retryCurrentUser}
            retrying={isRetryingCurrentUser}
          />
          <Breadcrumb items={breadcrumbItems} style={{ marginBottom: 16 }} />
          <Outlet />
        </Content>
        <CommandPalette
          open={isCommandPaletteOpen}
          onClose={closePalette}
          items={commandPaletteItems}
        />
      </Layout>
    </Layout>
  );
};
